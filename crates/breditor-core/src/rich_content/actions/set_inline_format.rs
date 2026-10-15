//! Guarded semantic formatting across a checked nonempty range inside a rich text block.

use super::{RichAction, RichActionError, RichEdit, node_patch::NodePatch};
use crate::{
    document::Format,
    identity::QualifiedName,
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

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
        Self::capture_changes(document, block, start, end, std::slice::from_ref(change))
    }

    /// Apply simultaneous changes to distinct format kinds, preserving all others.
    ///
    /// Each selected run is constructed once with its final canonical format set.
    /// Array order has no semantic effect; duplicate kinds are rejected, including
    /// a set and removal of the same kind. Text and positions remain unchanged.
    /// The normal guarded `apply` checks the final schema and host limits.
    ///
    /// # Errors
    /// Rejects empty/ambiguous changes, invalid ranges or non-text targets.
    pub fn capture_changes(
        document: &RichDocument,
        block: &BlockId,
        start: TextOffset,
        end: TextOffset,
        changes: &[RichFormatChange],
    ) -> Result<Self, RichActionError> {
        Ok(Self {
            patch: super::change_inline_formats::capture(document, block, start, end, changes)?,
        })
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
