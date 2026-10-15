//! Indent tasks without converting completion state or discarding rich item bodies.
use super::{
    OutdentTaskItems, RichAction, RichActionError, RichEdit,
    branch_patch::BranchPatch,
    list_helpers::{children, id, interval, with_children},
    node_patch::NodePatch,
    task_list_helpers::{task_list, task_list_node},
};
use crate::{
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One guarded contiguous task indentation with exact source restoration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndentTaskItems {
    patch: BranchPatch,
}
impl IndentTaskItems {
    /// Nest the selected tasks after the preceding task's complete rich tail.
    ///
    /// Append to its trailing task list when present; then `new_nested` must be
    /// absent. Otherwise provide its fresh explicit identity. Checked values and
    /// all descendant identities remain unchanged. Ordinary lists are not merged.
    ///
    /// # Errors
    /// Rejects non-task targets, reversed/absent items, the first task and unused/missing IDs.
    pub fn capture(
        document: &RichDocument,
        container: &BlockId,
        first: &BlockId,
        last: &BlockId,
        new_nested: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let source = task_list_node(document, container)?;
        let (first, last) = interval(source, first, last)?;
        let previous = first.checked_sub(1).ok_or(RichActionError::ListBoundary)?;
        let mut items = children(source)?.to_vec();
        let selected = items[first..=last].to_vec();
        let parent = items[previous].clone();
        let mut body = children(&parent)?.to_vec();
        let existing = body.last().is_some_and(|node| {
            node.as_element().is_some_and(|node| node.kind().as_str() == "breditor/task-list")
        });
        if existing {
            if new_nested.is_some() {
                return Err(RichActionError::ListShape);
            }
            let old = body.pop().ok_or(RichActionError::ListShape)?;
            let mut nested = children(&old)?.to_vec();
            nested.extend(selected);
            body.push(with_children(&old, nested)?);
        } else {
            body.push(task_list(new_nested.ok_or(RichActionError::ListShape)?, selected)?);
        }
        items[previous] = with_children(&parent, body)?;
        items.drain(first..=last);
        Ok(Self {
            patch: BranchPatch::Node(NodePatch::capture(
                document,
                &id(source)?,
                with_children(source, items)?,
            )?),
        })
    }
    pub(super) fn from_inverse(patch: BranchPatch) -> Self {
        Self { patch }
    }
    /// Publish one validated indentation and an exact inverse outdent.
    ///
    /// # Errors
    /// Rejects stale branches, reused IDs, invalid resulting grammar or active limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::OutdentTaskItems(OutdentTaskItems::from_inverse(self.patch.inverse())),
        )
    }
}
