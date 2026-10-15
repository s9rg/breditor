//! Source-preserving rich range replacement with one admitted core semantic result.
use super::super::{
    selection::{Selection, TextPoint},
    text_flow,
};
use crate::{Error, anchor::Affinity, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    document::{TextFragment, TextRun},
    rich_content::{RichDocument, actions::ReplaceTextRange as CoreReplace},
};
use loro::{LoroDoc, ToJson};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// A homogeneous inserted run; formats use the original schema-bound literal codec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RangeTextRun {
    /// Exact Unicode text, without normalization.
    pub text: String,
    /// Complete desired formats, not an inherited-style toggle.
    pub formats: Vec<Value>,
}
/// Replace a directional text range in one block, sibling flow, or sibling list heads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplaceTextRange {
    /// Original directional anchor; scalar-aligned decimal UTF-16 coordinate.
    pub anchor: TextPoint,
    /// Original directional focus; order is resolved against the staged document.
    pub focus: TextPoint,
    /// Rich insertion; an empty vector deletes the selected range.
    pub runs: Vec<RangeTextRun>,
}
impl ReplaceTextRange {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        text_flow::prepare_root(doc, &self.anchor.block)?;
        text_flow::prepare_root(doc, &self.focus.block)?;
        // Earlier commands can change the supported flow/list range. Reserve canonical field
        // containers for known identities outside undo; actual targets come from the core preview.
        let raw = doc.get_map("metadata").get_deep_value().to_json_value();
        let owners = raw.as_object().ok_or(Error::Contract("range metadata directory"))?;
        if owners.len() > 20_000 {
            return Err(Error::Limit("range metadata owners"));
        }
        for id in owners.keys() {
            let meta = super::super::model::metadata(doc, id)?;
            meta.ensure_mergeable_map("deletions")?;
            meta.ensure_mergeable_map("placements")?;
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let fragment = self.fragment(codec)?;
        let selection =
            Selection::TextRange { anchor: self.anchor.clone(), focus: self.focus.clone() }
                .admit(document)?;
        let action = CoreReplace::capture(document, &selection, &fragment)
            .map_err(|_| Error::Contract("shared range capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared range admission"))?
        else {
            return Ok(());
        };
        let (start, end) = super::super::range_plan::ordered(document, &self.anchor, &self.focus)?;
        let plan = super::super::range_plan::RangePlan::capture(
            codec,
            document,
            edit.document(),
            &end.block,
        )?;
        if start.block == end.block {
            if end.offset > start.offset {
                text_flow::delete(doc, &start.block, start.offset, end.offset - start.offset)?;
            }
        } else {
            let length = text_flow::view(doc, &start.block)?.len()?;
            if start.offset < length {
                text_flow::delete(doc, &start.block, start.offset, length - start.offset)?;
            }
            if end.offset > 0 {
                text_flow::delete(doc, &end.block, 0, end.offset)?;
            }
            doc.commit();
            text_flow::PreparedJoin::prepare(doc, &start.block, &end.block)?.apply_staged(doc)?;
        }
        doc.commit();
        for (index, (block, parent, before)) in plan.moves.iter().enumerate() {
            super::super::placement::move_block(
                doc,
                block,
                parent.as_deref(),
                before.as_deref(),
                stamp,
                index,
            )?;
        }
        for block in plan.deletes {
            super::DeleteBlock { block }.apply(doc, stamp)?;
        }
        doc.commit();
        self.insert(doc, &start.block, start.offset, stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
    fn fragment(&self, codec: &DocumentJsonCodecV2) -> Result<TextFragment, Error> {
        if self.runs.len() > 1000
            || self.runs.iter().map(|run| run.text.len()).sum::<usize>() > 64 * 1024
        {
            return Err(Error::Limit("shared range insertion"));
        }
        let formats = RichFormatsJsonCodec::new(super::super::paragraphs::context(codec));
        let mut fragment = TextFragment::empty();
        for run in &self.runs {
            let marks = formats
                .decode(&serde_json::to_string(&run.formats)?)
                .map_err(|_| Error::Contract("range formats"))?;
            if !run.text.is_empty() {
                fragment = fragment
                    .try_concat(
                        &TextRun::try_new(&run.text, marks)
                            .map_err(|_| Error::Contract("range run"))?
                            .into(),
                    )
                    .map_err(|_| Error::Contract("range fragment"))?;
            }
        }
        Ok(fragment)
    }
    fn insert(
        &self,
        doc: &LoroDoc,
        block: &str,
        mut offset: u32,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let mut ordinal = 0;
        for run in &self.runs {
            if run.text.is_empty() {
                continue;
            }
            let length =
                u32::try_from(run.text.encode_utf16().count()).map_err(|_| Error::Offset)?;
            text_flow::insert_with_activation(
                doc,
                block,
                offset,
                Affinity::After,
                &run.text,
                Some(stamp),
            )?;
            doc.commit();
            let desired: BTreeMap<_, _> = run
                .formats
                .iter()
                .map(|value| Ok((format_kind(value)?, value.clone())))
                .collect::<Result<_, Error>>()?;
            let inherited: BTreeMap<_, _> = text_flow::intervals(doc, block, offset, length)?
                .iter()
                .flat_map(|chunk| &chunk.formats)
                .map(|value| Ok((format_kind(value)?, value.clone())))
                .collect::<Result<_, Error>>()?;
            for (kind, format) in inherited {
                if !desired.contains_key(&kind) {
                    mark(doc, block, offset, length, format, false, stamp, &mut ordinal)?;
                }
            }
            for format in desired.into_values() {
                mark(doc, block, offset, length, format, true, stamp, &mut ordinal)?;
            }
            doc.commit();
            offset = offset.checked_add(length).ok_or(Error::Offset)?;
        }
        Ok(())
    }
}
fn format_kind(value: &Value) -> Result<String, Error> {
    Ok(value["type"].as_str().ok_or(Error::Contract("range format kind"))?.into())
}
#[allow(clippy::too_many_arguments)]
fn mark(
    doc: &LoroDoc,
    block: &str,
    offset: u32,
    length: u32,
    format: Value,
    enabled: bool,
    stamp: Stamp,
    ordinal: &mut usize,
) -> Result<(), Error> {
    if *ordinal >= 1000 {
        return Err(Error::Limit("range format contributions"));
    }
    super::SetFormat { block: block.into(), offset, length, format, enabled }
        .apply(doc, stamp, *ordinal)?;
    *ordinal += 1;
    Ok(())
}
