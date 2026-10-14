//! Change one semantic format across a checked nonempty range inside a rich text block.

use super::{
    RichAction, RichActionError, RichEdit,
    node_patch::NodePatch,
    text_patch::{block_node, fragment, text_node},
};
use crate::{
    document::{Format, FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};
use std::collections::BTreeMap;

/// Explicit semantic format change; properties are fully admitted before publication.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichFormatChange {
    /// Set/replace one typed semantic format with its exact properties.
    Set(Format),
    /// Remove one format kind while preserving every other format.
    Remove(QualifiedName),
}

/// One exact guarded inline-format action in a paragraph, heading, cell or caption.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetInlineFormat {
    patch: NodePatch,
}

impl SetInlineFormat {
    /// Change one format across a scalar-aligned nonempty range.
    ///
    /// Collapsed caret formatting is pending-format state, not a text mutation.
    ///
    /// # Errors
    /// Rejects reversed/empty/non-scalar ranges, absent/non-text blocks or local invariants.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        start: TextOffset,
        end: TextOffset,
        change: &RichFormatChange,
    ) -> Result<Self, RichActionError> {
        if start >= end {
            return Err(RichActionError::TextRange);
        }
        let source = block_node(document, block)?;
        let (head, rest) =
            fragment(source)?.split_at(start).map_err(|_| RichActionError::TextRange)?;
        let (middle, tail) = rest
            .split_at(
                TextOffset::try_new(end.get() - start.get())
                    .map_err(|_| RichActionError::TextRange)?,
            )
            .map_err(|_| RichActionError::TextRange)?;
        let mut runs: Vec<(String, FormatSet)> = Vec::new();
        for run in &middle {
            let mut formats: BTreeMap<_, _> = run
                .formats()
                .iter()
                .map(|format| (format.kind().clone(), format.clone()))
                .collect();
            match change {
                RichFormatChange::Set(format) => {
                    formats.insert(format.kind().clone(), format.clone());
                }
                RichFormatChange::Remove(kind) => {
                    formats.remove(kind);
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
        Ok(Self { patch: NodePatch::capture(document, block, text_node(source, &text)?)? })
    }

    /// Publish canonical format runs without changing Unicode text or stable positions.
    ///
    /// # Errors
    /// Rejects stale blocks, unsupported format properties or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetInlineFormat(Self { patch: self.patch.inverse() }),
        )
    }
}
