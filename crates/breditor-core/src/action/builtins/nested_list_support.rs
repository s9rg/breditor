//! Shared atomic planning for nested list container actions.
use super::support::{disabled, fault, strict_relocation};
use crate::{
    action::{ActionDecision, ActionFault, ActionPlan},
    document::NodeRef,
    operation::{NestedListReframe, NestedListReframeError, Operation},
    position::NodePath,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn plan(
    state: &EditorState,
    path: NodePath,
    replacement: NodeRef,
) -> Result<ActionDecision, ActionFault> {
    let (root_index, replacement) = rebuild_root(state, path, replacement)?;
    plan_root(state, root_index, replacement)
}

/// Rebuild only ancestors of a validated path through its containing root child.
pub(super) fn rebuild_root(
    state: &EditorState,
    mut path: NodePath,
    mut replacement: NodeRef,
) -> Result<(u32, NodeRef), ActionFault> {
    // Rebuild only ancestors through the containing root child, preserving all
    // unselected siblings and descendants. The reframe guards that whole root.

    while path.len() > 1 {
        let index =
            usize::try_from(path.last_index().ok_or_else(|| fault("breditor/list-path-fault"))?)
                .map_err(|_| fault("breditor/list-path-fault"))?;
        path = path.parent().ok_or_else(|| fault("breditor/list-path-fault"))?;
        let ancestor = state
            .document()
            .node_at(&path)
            .map_err(|_| fault("breditor/list-path-fault"))?
            .as_element()
            .ok_or_else(|| fault("breditor/list-path-fault"))?;
        let mut children: Vec<_> = ancestor.children().iter().cloned().collect();
        *children.get_mut(index).ok_or_else(|| fault("breditor/list-path-fault"))? = replacement;
        replacement = NodeRef::element(
            ancestor.try_with_children(children).map_err(|_| fault("breditor/list-build-fault"))?,
        );
    }
    let root_index = path.last_index().ok_or_else(|| fault("breditor/list-path-fault"))?;
    Ok((root_index, replacement))
}

fn plan_root(
    state: &EditorState,
    root_index: u32,
    replacement: NodeRef,
) -> Result<ActionDecision, ActionFault> {
    plan_roots(state, root_index, vec![replacement])
}

/// Reframe one guarded root into any valid root sequence, preserving all blocks.
pub(super) fn plan_roots(
    state: &EditorState,
    root_index: u32,
    replacement: Vec<NodeRef>,
) -> Result<ActionDecision, ActionFault> {
    plan_span(state, root_index, 1, replacement)
}

/// Reframe a contiguous root span, validating the complete final document.
pub(super) fn plan_span(
    state: &EditorState,
    root_index: u32,
    count: u32,
    replacement: Vec<NodeRef>,
) -> Result<ActionDecision, ActionFault> {
    let operation = match NestedListReframe::capture(
        state.context(),
        state.document(),
        root_index,
        count,
        replacement,
    ) {
        Ok(operation) => operation,
        Err(NestedListReframeError::Validation(_) | NestedListReframeError::RootChildLimit) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/list-capture-fault")),
    };
    match operation.apply(state.context(), state.document()) {
        Ok(Some(_)) => Ok(ActionDecision::Enabled(ActionPlan::new(
            vec![Operation::NestedListReframe(operation)],
            strict_relocation(),
            SelectionUpdate::Relocate,
            PendingFormatsUpdate::Preserve,
            HistoryIntent::Record,
        ))),
        Ok(None) => Ok(disabled("breditor/list-unchanged")),
        Err(NestedListReframeError::Validation(_) | NestedListReframeError::RootChildLimit) => {
            Ok(disabled("breditor/result-limit-exceeded"))
        }
        Err(_) => Err(fault("breditor/list-preview-fault")),
    }
}
