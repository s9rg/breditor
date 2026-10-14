//! Delete one checked UTF-16 range inside a stable rich text block, retaining formats for undo.

use super::{RichActionError, RichEdit, text_patch::TextPatch};
use crate::{
    document::TextFragment,
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One guarded same-block rich-text deletion; the empty paragraph remains addressable.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteText {
    pub(super) patch: TextPatch,
}

impl DeleteText {
    /// Capture an ordered range without removing the owning paragraph/heading.
    ///
    /// # Errors
    /// Rejects missing/wrong-kind blocks, reversed ranges or non-scalar boundaries.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        start: TextOffset,
        end: TextOffset,
    ) -> Result<Self, RichActionError> {
        Ok(Self { patch: TextPatch::capture(document, block, start, end, &TextFragment::empty())? })
    }

    /// Publish the whole deletion with exact inverse and checked position mapping.
    ///
    /// # Errors
    /// Rejects stale blocks or active schema/resource policy failure.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document)
    }
}
