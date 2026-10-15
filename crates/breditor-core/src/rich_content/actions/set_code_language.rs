//! One guarded code-language property change, independent of source text.

use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties, text_patch::block_node,
};
use crate::{
    document::PropertyValue,
    rich_content::{BlockId, CodeLanguage, RichDocument},
    state::EditorContext,
};

/// Exact optional language-token change for an existing V2 code block.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetCodeLanguage {
    patch: NodePatch,
}
impl SetCodeLanguage {
    /// Set an already admitted token or explicitly remove it with `None`.
    ///
    /// # Errors
    /// Rejects an absent/non-code target; no text or formatting is transformed.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        language: Option<&CodeLanguage>,
    ) -> Result<Self, RichActionError> {
        let node = block_node(document, block)?;
        if node.as_element().is_none_or(|node| node.kind().as_str() != "breditor/code-block") {
            return Err(RichActionError::CodeTarget);
        }
        let replacement = with_properties(
            node,
            [("language", language.map(|value| PropertyValue::from_string(value.as_str())))],
        )?;
        Ok(Self { patch: NodePatch::capture(document, block, replacement)? })
    }
    /// Publish an admitted optional metadata update with an exact inverse.
    ///
    /// # Errors
    /// Rejects a stale node, changed schema/document or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetCodeLanguage(Self { patch: self.patch.inverse() }),
        )
    }
}
