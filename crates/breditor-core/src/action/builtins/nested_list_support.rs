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
    mut path: NodePath,
    mut replacement: NodeRef,
) -> Result<ActionDecision, ActionFault> {
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
    let operation = match NestedListReframe::capture(
        state.context(),
        state.document(),
        root_index,
        1,
        vec![replacement],
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
