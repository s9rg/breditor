//! Structural Backspace/Delete in depth-first text-block order.
use super::{
    OutdentListItemsAction,
    delete_flat_list_support::Deletion,
    insert_nested_list_structure::{CaretPolicy, capture, plan_with_policy},
    support::{disabled, fault},
};
use crate::{
    action::{
        Action, ActionDecision, ActionFault,
        text_position::{
            normalize_nested_list_explicit_range, point_at_nested_list_fragment_offset,
        },
    },
    document::TextFragment,
    position::{Affinity, NodePath, TextOffset},
    selection::RangeSelection,
    state::EditorState,
    transaction::PendingFormatsUpdate,
};

/// First-item Backspace removes one level of list structure. Other boundaries
/// join adjacent depth-first blocks using the exact selected-range retention
/// policy. Forward Delete never implicitly outdents.
pub(super) fn boundary(
    state: &EditorState,
    path: &NodePath,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    let indexes = path.as_slice();
    if matches!(direction, Deletion::Backward)
        && indexes.len() >= 3
        && indexes[indexes.len() - 2] == 0
    {
        if indexes.len() > 3 {
            return Ok(OutdentListItemsAction.evaluate(state, &())?.decision().clone());
        }
        let (block, _) = capture(state, path)?;
        let (roots, _) = super::insert_nested_list_break::exit_root_item(state, path, &block)?;
        return super::nested_list_support::plan_roots(state, indexes[0], roots);
    }
    let paths = block_paths(state)?;
    let current = paths
        .iter()
        .position(|candidate| candidate == path)
        .ok_or_else(|| fault("breditor/nested-delete-path-fault"))?;
    let (left, right) = match direction {
        Deletion::Backward if current > 0 => (&paths[current - 1], path),
        Deletion::Forward if current + 1 < paths.len() => (path, &paths[current + 1]),
        Deletion::Backward | Deletion::Forward => {
            return Ok(disabled("breditor/document-boundary"));
        }
        Deletion::Selection => return Err(fault("breditor/nested-delete-direction-fault")),
    };
    let (_, first) = capture(state, left)?;
    let (_, last) = capture(state, right)?;
    let start =
        point_at_nested_list_fragment_offset(left, &first, first.utf16_len(), Affinity::After)
            .map_err(|_| fault("breditor/nested-delete-point-fault"))?;
    let end =
        point_at_nested_list_fragment_offset(right, &last, TextOffset::ZERO, Affinity::Before)
            .map_err(|_| fault("breditor/nested-delete-point-fault"))?;
    let range = normalize_nested_list_explicit_range(state, &RangeSelection::new(start, end))
        .map_err(|_| fault("breditor/nested-delete-range-fault"))?;
    plan_with_policy(
        state,
        &range,
        &TextFragment::empty(),
        CaretPolicy::Directional(direction),
        PendingFormatsUpdate::Preserve,
    )
}

/// Iterative traversal of an already validated, resource-bounded nested document.
fn block_paths(state: &EditorState) -> Result<Vec<NodePath>, ActionFault> {
    let mut stack = vec![(NodePath::root(), state.document().root())];
    let mut result = Vec::new();
    while let Some((path, node)) = stack.pop() {
        let element =
            node.as_element().ok_or_else(|| fault("breditor/nested-delete-tree-fault"))?;
        if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
            result.push(path);
            continue;
        }
        for (index, child) in element.children().iter().enumerate().rev() {
            let index =
                u32::try_from(index).map_err(|_| fault("breditor/nested-delete-path-fault"))?;
            stack.push((
                path.try_child(index).map_err(|_| fault("breditor/nested-delete-path-fault"))?,
                child,
            ));
        }
    }
    Ok(result)
}
