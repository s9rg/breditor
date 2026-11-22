//! V4: add or remove a table's trailing paragraph caption as one guarded edit.

use super::{
    RichAction, RichActionError, RichEdit,
    table_patch::{TablePatch, table_node},
};
use crate::{
    document::NodeRef,
    rich_content::{
        RichBlockDraft, RichDocument, RichDraftError, TableId, table_caption::is_caption_child,
    },
    state::EditorContext,
};

/// Exact guarded whole-caption change; ordinary caption typing uses text actions.
///
/// Rows, cells, merges, columns and every identity are untouched. Old profiles reject
/// the resulting grammar at admission, so the action never widens V1–V3.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetTableCaption {
    patch: TablePatch,
}

impl SetTableCaption {
    /// Capture one optional paragraph draft (`None` removes the caption).
    ///
    /// A present draft replaces any existing caption; use a fresh block identity for it.
    ///
    /// # Errors
    /// Rejects absent tables, non-paragraph captions or private AST invariants.
    pub fn capture(
        document: &RichDocument,
        table: &TableId,
        caption: Option<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        if caption.as_ref().is_some_and(|draft| !is_caption_child(draft.node())) {
            return Err(RichDraftError::Caption.into());
        }
        let source = table_node(document, table)?;
        let element = source.as_element().ok_or(RichActionError::Rewrite)?;
        let mut children: Vec<NodeRef> = crate::rich_content::table_caption::rows(element).to_vec();
        children.extend(caption.map(RichBlockDraft::into_node));
        let replacement = NodeRef::element(
            element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?,
        );
        Ok(Self { patch: TablePatch::capture(document, table, replacement)? })
    }

    /// Publish the complete caption edit and exact inverse; an unchanged caption is a no-op.
    ///
    /// # Errors
    /// Rejects stale tables, invalid caption formats/IDs, old profiles or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::SetTableCaption(Self { patch: self.patch.inverse() }),
        )
    }
}
