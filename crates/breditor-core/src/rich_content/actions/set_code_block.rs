//! Explicit code conversion with a declared formatting-loss policy and exact local inverse.

use super::{
    RichAction, RichActionError, RichEdit,
    node_patch::NodePatch,
    text_patch::{block_node, fragment},
};
use crate::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::{BlockId, CodeLanguage, RichBlockDraft, RichDocument, RichDraftError},
    state::EditorContext,
};

/// Explicit treatment of inline formats during prose-to-code conversion.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CodeFormatPolicy {
    /// Reject formatted source instead of silently stripping its semantic styles.
    RejectFormatted,
    /// Remove all inline formats in this one undoable conversion, retaining exact characters.
    RemoveFormats,
}
/// Stable text identity converted to plain-text code and an optional inert language.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetCodeBlock {
    patch: NodePatch,
}
impl SetCodeBlock {
    /// Convert paragraph/heading/code with an explicit format policy; Unicode and line endings are exact.
    ///
    /// # Errors
    /// Rejects a non-text target or formatted source under `RejectFormatted`.
    /// V2 parent/profile and resource proof runs during apply.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        language: Option<&CodeLanguage>,
        policy: CodeFormatPolicy,
    ) -> Result<Self, RichActionError> {
        let source_node = block_node(document, block)?;
        let source = fragment(source_node)?;
        let formatted = source.iter().any(|run| !run.formats().is_empty());
        if formatted && policy == CodeFormatPolicy::RejectFormatted {
            return Err(RichDraftError::CodeFormats.into());
        }
        let text = if formatted {
            let plain: String = source.iter().map(TextRun::text).collect();
            if plain.is_empty() {
                TextFragment::empty()
            } else {
                TextRun::try_new(plain, FormatSet::default())
                    .map_err(|_| RichActionError::TextPrimitive)?
                    .into()
            }
        } else {
            source
        };
        let draft = RichBlockDraft::code_block(block, language, &text)?;
        let replacement =
            super::rewrite_properties::inherit_layout(source_node, draft.into_node())?;
        Ok(Self { patch: NodePatch::capture(document, block, replacement)? })
    }
    /// Publish one admitted conversion and preserve the exact original styled node for Undo.
    ///
    /// # Errors
    /// Rejects stale target/binding, non-V2 grammar or active resource policy before publication.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetCodeBlock(Self { patch: self.patch.inverse() }),
        )
    }
}
