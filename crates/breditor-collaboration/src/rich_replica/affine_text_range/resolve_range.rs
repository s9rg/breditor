//! Resolve every original scalar by native identity; never select a surviving subset or equal text.
use super::{
    AffineTextRangeConflict as Conflict, AffineTextRangeResolution as Resolution,
    AffineTextSegment, MAX_BYTES, MAX_SEGMENTS,
    packet::Packet,
    source::{self, Binding, FormatCache},
};
use crate::{
    Error,
    anchor::Affinity,
    rich_replica::{
        RichReplica,
        selection::{Selection, TextPoint},
        text_flow::{self, FlowAnchor},
    },
};
use serde::Serialize;
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc};
#[cfg(test)]
#[path = "segment_budget_tests.rs"]
mod segment_budget_tests;
struct Current {
    block: Arc<str>,
    offset: u32,
    character: char,
    formats: Arc<Vec<Value>>,
    binding: Arc<Binding>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SegmentView<'a> {
    source: TextPoint,
    current: TextPoint,
    length: u32,
    text: char,
    source_formats: &'a [Value],
    current_formats: &'a [Value],
    domain: &'a super::AffineTextDomain,
}
fn conflict(reason: Conflict) -> Resolution {
    Resolution::Conflict { reason }
}
fn point(block: &str, offset: u32, affinity: Affinity) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity }
}
fn endpoint(
    owner: &RichReplica,
    source: &loro::LoroDoc,
    original: &TextPoint,
) -> Result<Option<TextPoint>, Error> {
    let anchor = FlowAnchor::capture(source, &original.block, original.offset, original.affinity)?;
    let resolved = match anchor.resolve(&owner.doc) {
        Ok(value) => value,
        Err(Error::Anchor) => return Ok(None),
        Err(error) => return Err(error),
    };
    let value = point(&resolved.0, resolved.1, original.affinity);
    let caret = Selection::TextRange { anchor: value.clone(), focus: value.clone() };
    if caret.admit(&owner.document).is_err() {
        return Ok(None);
    }
    Ok(Some(value))
}
fn append_segment(
    segments: &mut Vec<AffineTextSegment>,
    before: &source::Scalar,
    after: &Current,
    bytes: &mut usize,
) -> Result<Option<Conflict>, Error> {
    if before.character != after.character {
        return Err(Error::Contract("affine immutable scalar changed"));
    }
    if before.binding.domain != after.binding.domain {
        return Ok(Some(Conflict::DomainChanged));
    }
    if before.binding.kind != after.binding.kind {
        return Ok(Some(Conflict::KindChanged));
    }
    let width = u32::try_from(before.character.len_utf16()).map_err(|_| Error::Offset)?;
    if let Some(last) = segments.last_mut()
        && last.source.block.as_str() == before.block.as_ref()
        && last.source.offset.checked_add(last.length) == Some(before.offset)
        && last.current.block.as_str() == after.block.as_ref()
        && last.current.offset.checked_add(last.length) == Some(after.offset)
        && last.source_formats == *before.formats
        && last.current_formats == *after.formats
        && last.domain == before.binding.domain
    {
        let length = last.length.checked_add(width).ok_or(Error::Offset)?;
        let added = super::budget::json_size(&before.character, 8)? - 2 + length.to_string().len()
            - last.length.to_string().len();
        *bytes = bytes
            .checked_add(added)
            .filter(|value| *value <= MAX_BYTES)
            .ok_or(Error::Limit("affine segment JSON bytes"))?;
        last.length = length;
        last.text.push(before.character);
        return Ok(None);
    }
    if segments.len() >= MAX_SEGMENTS {
        return Err(Error::Limit("affine resolved segments"));
    }
    let view = SegmentView {
        source: point(&before.block, before.offset, Affinity::After),
        current: point(&after.block, after.offset, Affinity::After),
        length: width,
        text: before.character,
        source_formats: before.formats.as_slice(),
        current_formats: after.formats.as_slice(),
        domain: &before.binding.domain,
    };
    let comma = usize::from(!segments.is_empty());
    let remaining =
        MAX_BYTES.checked_sub(*bytes + comma).ok_or(Error::Limit("affine segment JSON bytes"))?;
    *bytes += super::budget::json_size(&view, remaining)? + comma;
    segments.push(AffineTextSegment {
        source: view.source,
        current: view.current,
        length: width,
        text: before.character.to_string(),
        source_formats: before.formats.as_ref().clone(),
        current_formats: after.formats.as_ref().clone(),
        domain: before.binding.domain.clone(),
    });
    Ok(None)
}
impl RichReplica {
    /// Resolve an original character set across newer insertions and native flow splits/joins.
    /// Every original scalar must still be visible, in order and in its original kind/domain.
    /// New text is excluded, and source/current marks remain separate for future edit policy.
    /// This is a pure read, not a Ready preview, structural deletion plan or Accept credential.
    /// # Errors
    /// Forged source coordinates, noncausal cuts, malformed native flows or budgets refuse.
    pub fn resolve_affine_text_range(&self, input: &str) -> Result<Resolution, Error> {
        let packet = Packet::read(self, input)?;
        let Some(historical) = self.historical_review_document(&packet.data.source_anchor_json)?
        else {
            return Ok(Resolution::Pending {
                missing: self
                    .review_anchor_missing_dependencies(&packet.data.source_anchor_json)?,
            });
        };
        let Selection::TextRange { anchor, focus } = &packet.data.selection else {
            return Err(Error::Contract("affine text scope"));
        };
        if super::packet::document_digest(&historical.canonical)?
            != packet.data.source_document_digest
        {
            return Err(Error::Contract("affine original document witness"));
        }
        let original =
            source::capture(&historical.doc, &historical.document, &packet.data.selection)?;
        let ids = original
            .iter()
            .enumerate()
            .map(|(index, scalar)| (scalar.identity.clone(), index))
            .collect::<BTreeMap<_, _>>();
        let index = source::bindings(&self.document)?;
        let (blocks, bindings) = (index.blocks, index.values);
        let mut current = (0..original.len()).map(|_| None).collect::<Vec<Option<Current>>>();
        let mut order = vec![];
        let mut formats = FormatCache::new();
        text_flow::visit_scalars(&self.doc, &blocks, |scalar| {
            let Some(index) = ids.get(&scalar.identity).copied() else {
                return Ok(());
            };
            if current[index].is_some() {
                return Err(Error::Contract("affine duplicate current scalar"));
            }
            current[index] = Some(Current {
                block: Arc::clone(&bindings[scalar.block].block),
                offset: scalar.offset,
                character: scalar.character,
                formats: formats.capture(scalar.formats)?,
                binding: bindings[scalar.block].clone(),
            });
            order.push(index);
            Ok(())
        })?;
        if order.len() != original.len() {
            return Ok(conflict(Conflict::CharactersDeleted));
        }
        if order.iter().enumerate().any(|(index, actual)| index != *actual) {
            return Ok(conflict(Conflict::CharactersReordered));
        }
        let mut segments: Vec<AffineTextSegment> = vec![];
        let mut bytes = 2usize;
        for (before, after) in original.iter().zip(current) {
            let after = after.ok_or(Error::Contract("affine scalar coverage"))?;
            if let Some(reason) = append_segment(&mut segments, before, &after, &mut bytes)? {
                return Ok(conflict(reason));
            }
        }
        let Some(mapped_anchor) = endpoint(self, &historical.doc, anchor)? else {
            return Ok(conflict(Conflict::BoundaryDeleted));
        };
        let Some(mapped_focus) = endpoint(self, &historical.doc, focus)? else {
            return Ok(conflict(Conflict::BoundaryDeleted));
        };
        let source_bindings = source::bindings(&historical.document)?.values;
        for (before, after) in [(anchor, &mapped_anchor), (focus, &mapped_focus)] {
            let Some(old) = source_bindings.get(&before.block) else {
                return Err(Error::Contract("affine source endpoint binding"));
            };
            let Some(new) = bindings.get(&after.block) else {
                return Ok(conflict(Conflict::BoundaryDeleted));
            };
            if old.domain != new.domain {
                return Ok(conflict(Conflict::DomainChanged));
            }
            if old.kind != new.kind {
                return Ok(conflict(Conflict::KindChanged));
            }
        }
        let result = Resolution::Resolved {
            info: Box::new(packet.info()),
            anchor: mapped_anchor,
            focus: mapped_focus,
            segments,
            clocks: historical.clocks,
        };
        super::budget::json_size(&result, MAX_BYTES)?;
        Ok(result)
    }
}
