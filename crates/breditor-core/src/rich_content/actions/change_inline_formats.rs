//! Simultaneous format changes on one scalar-aligned range.
//!
//! Capture only the final format set for each run. In particular, replacing one
//! format at a tight per-run limit must not admit an oversized intermediate set.
//! The resulting guard/inverse uses the existing `SetInlineFormat` node-patch
//! representation; no persisted action, document or history meaning changes.

use super::{
    RichActionError, RichFormatChange,
    node_patch::NodePatch,
    text_patch::{block_node, fragment, text_node},
};
use crate::{
    document::{FormatSet, TextFragment, TextRun},
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn capture(
    document: &RichDocument,
    block: &BlockId,
    start: TextOffset,
    end: TextOffset,
    changes: &[RichFormatChange],
) -> Result<NodePatch, RichActionError> {
    let mut kinds = BTreeSet::new();
    if changes.is_empty()
        || changes.iter().any(|change| {
            !kinds.insert(match change {
                RichFormatChange::Set(format) => format.kind(),
                RichFormatChange::Remove(kind) => kind,
            })
        })
    {
        return Err(RichActionError::FormatChanges);
    }
    if start >= end {
        return Err(RichActionError::TextRange);
    }
    let source = block_node(document, block)?;
    let (head, rest) = fragment(source)?.split_at(start).map_err(|_| RichActionError::TextRange)?;
    let (middle, tail) = rest
        .split_at(
            TextOffset::try_new(end.get() - start.get()).map_err(|_| RichActionError::TextRange)?,
        )
        .map_err(|_| RichActionError::TextRange)?;
    let mut runs: Vec<(String, FormatSet)> = Vec::new();
    for run in &middle {
        let mut formats: BTreeMap<_, _> =
            run.formats().iter().map(|format| (format.kind().clone(), format.clone())).collect();
        for change in changes {
            match change {
                RichFormatChange::Set(format) => {
                    formats.insert(format.kind().clone(), format.clone());
                }
                RichFormatChange::Remove(kind) => {
                    formats.remove(kind);
                }
            }
        }
        let formats = FormatSet::try_from_formats(formats.into_values().collect())
            .map_err(|_| RichActionError::TextPrimitive)?;
        match runs.last_mut() {
            Some((text, previous)) if previous == &formats => text.push_str(run.text()),
            _ => runs.push((run.text().to_owned(), formats)),
        }
    }
    let formatted = TextFragment::try_from_runs(
        runs.into_iter()
            .map(|(text, formats)| {
                TextRun::try_new(text, formats).map_err(|_| RichActionError::TextPrimitive)
            })
            .collect::<Result<_, _>>()?,
    )
    .map_err(|_| RichActionError::TextPrimitive)?;
    let text = head
        .try_concat(&formatted)
        .and_then(|text| text.try_concat(&tail))
        .map_err(|_| RichActionError::TextPrimitive)?;
    NodePatch::capture(document, block, text_node(source, &text)?)
}
