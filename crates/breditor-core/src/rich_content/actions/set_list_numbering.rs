//! Guarded bounded ordered-list numbering change; items, bodies and identities are untouched.
use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties, text_patch::block_node,
};
use crate::{
    rich_content::{
        BlockId, RichDocument, RichListNumbering, RichListNumberingError, RichListNumberingPatch,
    },
    state::EditorContext,
};

/// Exact local numbering patch on one ordered list, with a full-source guard and inverse.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetListNumbering {
    patch: NodePatch,
}

impl SetListNumbering {
    /// Capture only the named numbering changes on one admitted ordered list.
    /// # Errors
    /// Rejects absent or non-ordered targets. Rich V4 proof, the ordinal ceiling and
    /// active limits are checked on apply.
    pub fn capture(
        document: &RichDocument,
        list: &BlockId,
        change: &RichListNumberingPatch,
    ) -> Result<Self, RichActionError> {
        let node = block_node(document, list)?;
        RichListNumbering::from_node(node.as_element().ok_or(RichListNumberingError::Target)?)?;
        let replacement = with_properties(node, change.properties())?;
        Ok(Self { patch: NodePatch::capture(document, list, replacement)? })
    }
    /// Publish one metadata edit or exact no-op; original profiles never widen.
    /// # Errors
    /// Rejects non-V4 context, stale source/binding and complete-tree resource/policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if !context.schema().supports_rich_list_numbering() {
            return Err(RichListNumberingError::Profile.into());
        }
        self.patch.edit(
            context,
            document,
            RichAction::SetListNumbering(Self { patch: self.patch.inverse() }),
        )
    }
}
