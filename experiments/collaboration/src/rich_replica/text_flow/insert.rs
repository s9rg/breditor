//! Logical insertion routes to an existing source and explicitly owns observed seams.
use super::{graph, index::Index, markers};
use crate::{
    Error,
    anchor::{Affinity, event_offset},
    register::Stamp,
};
use loro::{LoroDoc, TextDelta, ToJson};

/// Insert into logical text without creating a replacement text container.
///
/// # Errors
/// Rejects invalid scalar coordinates and over-budget text before writing. Engine
/// errors after writes require discarding the caller's disposable staged document.
pub fn insert(
    doc: &LoroDoc,
    block: &str,
    offset: u32,
    affinity: Affinity,
    content: &str,
) -> Result<(), Error> {
    insert_with_activation(doc, block, offset, affinity, content, None)
}

pub(in crate::rich_replica) fn insert_with_activation(
    doc: &LoroDoc,
    block: &str,
    offset: u32,
    affinity: Affinity,
    content: &str,
    activation: Option<Stamp>,
) -> Result<(), Error> {
    if content.len() > 64 * 1024 {
        return Err(Error::Limit("text-flow insertion bytes"));
    }
    let index = Index::read(doc)?;
    let point = index.point(doc, block, offset, affinity)?;
    if content.is_empty() {
        return Ok(());
    }
    let stamp = Stamp::next(doc)?;
    let text = super::super::model::existing_text(doc, &point.source).ok_or(Error::Anchor)?;
    event_offset(&text, point.offset)?;
    text.insert_utf16(usize::try_from(point.offset).map_err(|_| Error::Offset)?, content)?;
    let length = u32::try_from(content.encode_utf16().count()).map_err(|_| Error::Offset)?;
    let mut needs_marker = point.fragment != graph::birth(&point.source);
    let mut position = 0u32;
    // Do not stamp ordinary unfragmented typing unnecessarily: an unobserved
    // concurrent split must be able to assign inherited inserted characters.
    // At an observed seam, correct any inherited owner that is not this target.
    for run in text.to_delta() {
        let TextDelta::Insert { insert, attributes } = run else {
            return Err(Error::Contract("text-flow insertion delta"));
        };
        let count = u32::try_from(insert.encode_utf16().count()).map_err(|_| Error::Offset)?;
        if position < point.offset + length && position + count > point.offset {
            let values: Vec<_> = attributes
                .unwrap_or_default()
                .into_iter()
                .map(|(key, value)| (key, value.to_json_value()))
                .collect();
            let owner =
                markers::selected(doc, &values)?.unwrap_or_else(|| graph::birth(&point.source));
            needs_marker |= owner != point.fragment;
        }
        position += count;
    }
    if needs_marker {
        markers::mark(
            doc,
            &point.source,
            point.offset,
            length,
            &point.fragment,
            markers::MarkerClock { stamp, activation: activation.unwrap_or(stamp), ordinal: 0 },
        )?;
    }
    Ok(())
}
