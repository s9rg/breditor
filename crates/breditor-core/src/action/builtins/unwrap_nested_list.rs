//! Remove selected nested item wrappers without losing reading order.
use super::{
    flat_list_support::{evaluation, list_kind, state_spec},
    nested_list_format::capture_selection,
    nested_list_support::plan_span,
    outdent_list_items::suffix,
    support::{disabled, fault, require_operation_budget},
};
use crate::{
    action::{
        Action, ActionActivation, ActionEvaluation, ActionFault, ActionStateSpec,
        text_position::normalize_nested_list_range_selection,
    },
    document::NodeRef,
    position::{NodePath, TextOffset},
    state::EditorState,
};
use std::collections::BTreeSet;

/// Removes list membership from touched leading blocks at every nesting depth.
/// Selected blocks become bare root blocks with their exact kind/text/formats.
/// Unselected descendants retain their marker families and original ordinals.
/// Ancestors split at extracted blocks: preceding children remain attached,
/// following sections rise as separate lists so reading order never changes.
/// Bare blocks are unchanged; later endpoints at zero are excluded. One atomic
/// reframe relocates selection, preserves pending formats and supports V7 undo.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct UnwrapNestedListAction;
impl Action for UnwrapNestedListAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        if !state.context().schema().supports_nested_list_reframe() {
            return Ok(evaluation(
                disabled("breditor/unsupported-schema"),
                ActionActivation::Inactive,
            ));
        }
        if state.selection().is_none() {
            return Ok(evaluation(disabled("breditor/no-selection"), ActionActivation::Inactive));
        }
        let range = normalize_nested_list_range_selection(state)
            .map_err(|_| fault("breditor/nested-unwrap-selection-fault"))?;
        let (mut spans, _) = capture_selection(state, &range)?;
        if !range.is_same_paragraph() && range.end().offset() == TextOffset::ZERO {
            spans.pop();
        }
        let selected = spans.iter().map(|s| s.container_path().clone()).collect::<BTreeSet<_>>();
        let matched = selected.iter().filter(|p| p.len() > 1).count();
        let activation = if matched == 0 {
            ActionActivation::Inactive
        } else if matched == selected.len() {
            ActionActivation::Active
        } else {
            ActionActivation::Mixed
        };
        if matched == 0 {
            return Ok(evaluation(disabled("breditor/list-unchanged"), activation));
        }
        if let Some(decision) = require_operation_budget(state, 1) {
            return Ok(evaluation(decision, activation));
        }
        let first = selected
            .first()
            .ok_or_else(|| fault("breditor/nested-unwrap-selection-fault"))?
            .as_slice()[0];
        let last = selected
            .last()
            .ok_or_else(|| fault("breditor/nested-unwrap-selection-fault"))?
            .as_slice()[0];
        let mut output = Vec::new();
        for index in first..=last {
            let path = NodePath::try_from_indices(vec![index])
                .map_err(|_| fault("breditor/nested-unwrap-path-fault"))?;
            let node = state
                .document()
                .node_at(&path)
                .map_err(|_| fault("breditor/nested-unwrap-path-fault"))?;
            if list_kind(node)?.is_none() {
                output.push(node.clone());
            } else {
                output.extend(extract(node, &path, &selected)?);
            }
        }
        let count = last
            .checked_sub(first)
            .and_then(|n| n.checked_add(1))
            .ok_or_else(|| fault("breditor/nested-unwrap-path-fault"))?;
        Ok(evaluation(plan_span(state, first, count, output)?, activation))
    }
}

/// A returned bare block must bubble through every ancestor to the root.
/// Lists preceding it can stay attached; sections after it cannot jump ahead.
fn extract(
    node: &NodeRef,
    path: &NodePath,
    selected: &BTreeSet<NodePath>,
) -> Result<Vec<NodeRef>, ActionFault> {
    let element = node.as_element().ok_or_else(|| fault("breditor/nested-unwrap-source-fault"))?;
    let mut output = Vec::new();
    let mut pending = Vec::new();
    let mut start = 0;
    for (index, item) in element.children().iter().enumerate() {
        let index = u32::try_from(index).map_err(|_| fault("breditor/nested-unwrap-path-fault"))?;
        let item_path =
            path.try_child(index).map_err(|_| fault("breditor/nested-unwrap-path-fault"))?;
        let item = item.as_element().ok_or_else(|| fault("breditor/nested-unwrap-source-fault"))?;
        let leading = item
            .children()
            .iter()
            .next()
            .ok_or_else(|| fault("breditor/nested-unwrap-source-fault"))?;
        let mut sections = Vec::new();
        for (section, child) in item.children().iter().enumerate().skip(1) {
            let child_path = item_path
                .try_child(
                    u32::try_from(section)
                        .map_err(|_| fault("breditor/nested-unwrap-path-fault"))?,
                )
                .map_err(|_| fault("breditor/nested-unwrap-path-fault"))?;
            sections.extend(extract(child, &child_path, selected)?);
        }
        if selected.contains(
            &item_path.try_child(0).map_err(|_| fault("breditor/nested-unwrap-path-fault"))?,
        ) {
            flush(node, start, &mut pending, &mut output)?;
            output.push(leading.clone());
            output.extend(sections);
        } else {
            let mut boundary = sections.len();
            for (index, section) in sections.iter().enumerate() {
                if list_kind(section)?.is_none() {
                    boundary = index;
                    break;
                }
            }
            let mut children = vec![leading.clone()];
            children.extend(sections[..boundary].iter().cloned());
            if pending.is_empty() {
                start = index;
            }
            pending.push(NodeRef::element(
                item.try_with_children(children)
                    .map_err(|_| fault("breditor/nested-unwrap-build-fault"))?,
            ));
            if boundary < sections.len() {
                flush(node, start, &mut pending, &mut output)?;
                output.extend(sections[boundary..].iter().cloned());
            }
        }
    }
    flush(node, start, &mut pending, &mut output)?;
    Ok(output)
}
fn flush(
    node: &NodeRef,
    start: u32,
    pending: &mut Vec<NodeRef>,
    output: &mut Vec<NodeRef>,
) -> Result<(), ActionFault> {
    if !pending.is_empty() {
        output.push(suffix(node, start, std::mem::take(pending))?);
    }
    Ok(())
}
