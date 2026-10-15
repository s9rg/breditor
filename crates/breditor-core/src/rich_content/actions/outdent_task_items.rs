//! Promote or unlist tasks with exact completion metadata and depth-first rich body order.
use super::{
    IndentTaskItems, RichAction, RichActionError, RichEdit,
    branch_patch::BranchPatch,
    flow_siblings::FlowSiblings,
    list_helpers::{children, id, with_children},
    node_patch::NodePatch,
    task_list_helpers::task_list_node,
    task_parts::TaskParts,
};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// One guarded nested task promotion or explicit top-level task removal.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OutdentTaskItems {
    patch: BranchPatch,
}

fn nested(
    document: &RichDocument,
    source: &NodeRef,
    container: &BlockId,
    mut parts: TaskParts,
) -> Result<BranchPatch, RichActionError> {
    let path = document.block_path(container).ok_or(RichActionError::MissingTarget)?;
    let parent_path = path.parent().ok_or(RichActionError::ListShape)?;
    let outer_path = parent_path.parent().ok_or(RichActionError::ListShape)?;
    let outer = document.document().node_at(&outer_path).map_err(|_| RichActionError::ListShape)?;
    task_list_node(document, &id(outer)?)?;
    let parent_index = usize::try_from(parent_path.last_index().ok_or(RichActionError::ListShape)?)
        .map_err(|_| RichActionError::ListShape)?;
    let nested_index = usize::try_from(path.last_index().ok_or(RichActionError::ListShape)?)
        .map_err(|_| RichActionError::ListShape)?;
    let mut outer_items = children(outer)?.to_vec();
    let parent = &outer_items[parent_index];
    let body = children(parent)?;
    if body.get(nested_index) != Some(source) {
        return Err(RichActionError::ListShape);
    }
    let mut before = body[..nested_index].to_vec();
    if let Some(prefix) = parts.prefix {
        before.push(prefix);
    }
    let last = parts.selected.last_mut().ok_or(RichActionError::ListShape)?;
    let mut last_body = children(last)?.to_vec();
    if let Some(tail) = parts.tail {
        last_body.push(tail);
    }
    // Following parent flow was after the complete nested list, not before its tasks.
    last_body.extend_from_slice(&body[nested_index + 1..]);
    *last = with_children(last, last_body)?;
    outer_items[parent_index] = with_children(parent, before)?;
    let insertion = parent_index + 1;
    outer_items.splice(insertion..insertion, parts.selected);
    Ok(BranchPatch::Node(NodePatch::capture(
        document,
        &id(outer)?,
        with_children(outer, outer_items)?,
    )?))
}
impl OutdentTaskItems {
    /// Promote nested tasks into their outer task list, or unwrap selected bodies.
    ///
    /// A nonempty prefix and suffix require exactly one fresh suffix identity.
    /// Nested promotion preserves checked values. Top-level removal preserves all
    /// body blocks and keeps removed task metadata in the exact inverse. The last
    /// promoted task receives the nested suffix followed by later parent flow.
    ///
    /// # Errors
    /// Rejects non-task targets, invalid boundaries, missing/unused IDs or illegal flow parents.
    pub fn capture(
        document: &RichDocument,
        container: &BlockId,
        first: &BlockId,
        last: &BlockId,
        fresh_tail: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let source = task_list_node(document, container)?;
        let parts = TaskParts::capture(source, first, last, fresh_tail)?;
        let location = document.block_path(container).ok_or(RichActionError::MissingTarget)?;
        let parent = location
            .parent()
            .and_then(|path| document.document().node_at(&path).ok())
            .and_then(NodeRef::as_element)
            .ok_or(RichActionError::ListShape)?;
        let patch = if parent.kind().as_str() == "breditor/task-item" {
            nested(document, source, container, parts)?
        } else {
            let mut replacement = Vec::new();
            if let Some(prefix) = parts.prefix {
                replacement.push(prefix);
            }
            for item in parts.selected {
                replacement.extend_from_slice(children(&item)?);
            }
            if let Some(tail) = parts.tail {
                replacement.push(tail);
            }
            BranchPatch::Flow(
                FlowSiblings::capture(document, container, container)?
                    .splice(document, replacement)?,
            )
        };
        Ok(Self { patch })
    }
    pub(super) fn from_inverse(patch: BranchPatch) -> Self {
        Self { patch }
    }
    /// Publish one complete outdent/unlist with an exact inverse, not a compensating move.
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
            RichAction::IndentTaskItems(IndentTaskItems::from_inverse(self.patch.inverse())),
        )
    }
}
