//! Replace one rich text range with a canonical fragment as one local undo unit.

use super::{RichActionError, RichEdit, text_patch::TextPatch};
use crate::{
    document::TextFragment,
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One guarded range replacement; insertion/deletion inverses use this exact recipe.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaceText {
    pub(super) patch: TextPatch,
}

impl ReplaceText {
    /// Capture an ordered scalar-aligned range and canonical replacement fragment.
    ///
    /// # Errors
    /// Rejects missing/wrong-kind blocks, invalid boundaries or fragment invariants.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        start: TextOffset,
        end: TextOffset,
        replacement: &TextFragment,
    ) -> Result<Self, RichActionError> {
        Ok(Self { patch: TextPatch::capture(document, block, start, end, replacement)? })
    }
    pub(super) fn from_inverse(patch: TextPatch) -> Self {
        Self { patch }
    }

    /// Publish replacement and checked forward/inverse text maps, preserving block identity.
    ///
    /// # Errors
    /// Rejects stale blocks, unsupported formats or active schema/resource policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document)
    }
}
