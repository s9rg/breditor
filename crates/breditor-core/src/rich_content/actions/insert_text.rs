//! Insert canonical rich text at a stable block-relative scalar-aligned position.

use super::{RichActionError, RichEdit, text_patch::TextPatch};
use crate::{
    document::TextFragment,
    rich_content::{RichDocument, RichTextPoint},
    state::EditorContext,
};

/// One guarded rich-text insertion, including paragraphs inside cells, lists and captions.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertText {
    pub(super) patch: TextPatch,
}

impl InsertText {
    /// Capture an insertion without normalizing text or discarding canonical formats.
    ///
    /// # Errors
    /// Rejects absent/non-text blocks, out-of-range positions or half-surrogate boundaries.
    pub fn capture(
        document: &RichDocument,
        point: &RichTextPoint,
        text: &TextFragment,
    ) -> Result<Self, RichActionError> {
        Ok(Self {
            patch: TextPatch::capture(
                document,
                point.block(),
                point.offset(),
                point.offset(),
                text,
            )?,
        })
    }

    /// Publish inserted text, its witnessed selection map and exact inverse as one edit.
    ///
    /// # Errors
    /// Rejects stale blocks, inadmissible formats or active schema/resource policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document)
    }
}
