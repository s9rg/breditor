//! Wrap prose-led rich groups into explicit task items without flattening their tails.

use super::{
    RichAction, RichActionError, RichEdit, UnwrapTaskList, flow_patch::FlowPatch,
    flow_siblings::FlowSiblings, list_helpers::is_text,
};
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::{BlockId, RichDocument, drafts::element},
    state::EditorContext,
};

/// Exact task-list creation with one explicit identity/checked value per leading prose block.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WrapTaskList {
    patch: FlowPatch,
}
impl WrapTaskList {
    /// Each paragraph/heading begins a task; following non-prose flow stays in that task's body.
    ///
    /// # Errors
    /// Rejects a non-prose first child, incorrect item count or invalid sibling boundaries.
    pub fn capture(
        document: &RichDocument,
        first: &BlockId,
        last: &BlockId,
        container: &BlockId,
        items: &[(BlockId, bool)],
    ) -> Result<Self, RichActionError> {
        let siblings = FlowSiblings::capture(document, first, last)?;
        let selected = &siblings.children[siblings.first..=siblings.last];
        if !is_text(&selected[0])
            || selected.iter().filter(|node| is_text(node)).count() != items.len()
        {
            return Err(RichActionError::ListShape);
        }
        let mut groups: Vec<Vec<NodeRef>> = vec![];
        for node in selected {
            if is_text(node) {
                groups.push(vec![node.clone()]);
            } else {
                groups.last_mut().ok_or(RichActionError::ListShape)?.push(node.clone());
            }
        }
        let items = groups
            .into_iter()
            .zip(items)
            .map(|(body, (id, checked))| {
                element(
                    "task-item",
                    vec![
                        ("block-id", PropertyValue::from_string(id.as_str())),
                        ("checked", PropertyValue::boolean(*checked)),
                    ],
                    body,
                )
            })
            .collect::<Result<_, _>>()?;
        let node = element(
            "task-list",
            vec![("block-id", PropertyValue::from_string(container.as_str()))],
            items,
        )?;
        Ok(Self { patch: siblings.splice(document, vec![node])? })
    }
    pub(super) fn from_inverse(patch: FlowPatch) -> Self {
        Self { patch }
    }
    /// Publish a complete list and exact inverse without inventing any body or checked state.
    ///
    /// # Errors
    /// Rejects stale parents, invalid V2 grammar, duplicate IDs or active host limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::UnwrapTaskList(UnwrapTaskList::from_inverse(self.patch.inverse())),
        )
    }
}
