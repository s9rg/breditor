//! Nested-aware list wrapping and marker conversion in one guarded reframe.
use super::{
    flat_list_support::{evaluation, list, list_kind, same_marker, state_spec},
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
    block::ListKind,
    document::NodeRef,
    position::{NodePath, TextOffset},
    state::EditorState,
};
use std::collections::BTreeSet;

/// Wraps selected bare blocks and converts touched items' marker families.
/// Children remain nested; only selected leading blocks change their own list
/// family. Matching ordered lists retain their starts. Split unselected sections
/// retain original ordinals; newly numbered sections use the configured start.
/// Later endpoints at zero exclude that block. Selection relocates exactly,
/// pending formats survive, and the edit is one independently undoable reframe.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WrapNestedListAction {
    target: ListKind,
}
impl WrapNestedListAction {
    /// Sets the marker family and the start for newly numbered sections.
    #[must_use]
    pub const fn new(target: ListKind) -> Self {
        Self { target }
    }
    /// Returns the configured marker family and start.
    #[must_use]
    pub const fn target(&self) -> ListKind {
        self.target
    }
}
impl Action for WrapNestedListAction {
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
            .map_err(|_| fault("breditor/nested-wrap-selection-fault"))?;
        let (mut spans, _) = capture_selection(state, &range)?;
        if !range.is_same_paragraph() && range.end().offset() == TextOffset::ZERO {
            spans.pop();
        }
        let selected =
            spans.iter().map(|span| span.container_path().clone()).collect::<BTreeSet<_>>();
        let mut matched = 0;
        for path in &selected {
            if path.len() > 1 {
                let container = path
                    .parent()
                    .and_then(|p| p.parent())
                    .ok_or_else(|| fault("breditor/nested-wrap-path-fault"))?;
                let node = state
                    .document()
                    .node_at(&container)
                    .map_err(|_| fault("breditor/nested-wrap-path-fault"))?;
                matched += usize::from(
                    list_kind(node)?.is_some_and(|kind| same_marker(kind, self.target)),
                );
            }
        }
        let activation = if matched == 0 {
            ActionActivation::Inactive
        } else if matched == selected.len() {
            ActionActivation::Active
        } else {
            ActionActivation::Mixed
        };
        if activation == ActionActivation::Active {
            return Ok(evaluation(disabled("breditor/list-unchanged"), activation));
        }
        if let Some(decision) = require_operation_budget(state, 1) {
            return Ok(evaluation(decision, activation));
        }
        let first = selected
            .first()
            .ok_or_else(|| fault("breditor/nested-wrap-selection-fault"))?
            .as_slice()[0];
        let last = selected
            .last()
            .ok_or_else(|| fault("breditor/nested-wrap-selection-fault"))?
            .as_slice()[0];
        let mut output = Vec::new();
        let mut bare = Vec::new();
        for index in first..=last {
            let path = NodePath::try_from_indices(vec![index])
                .map_err(|_| fault("breditor/nested-wrap-path-fault"))?;
            let node = state
                .document()
                .node_at(&path)
                .map_err(|_| fault("breditor/nested-wrap-path-fault"))?;
            if list_kind(node)?.is_none() && selected.contains(&path) {
                bare.push(node.clone());
                continue;
            }
            if !bare.is_empty() {
                output.push(list(self.target, std::mem::take(&mut bare))?);
            }
            if list_kind(node)?.is_some() {
                output.extend(convert(node, &path, &selected, self.target)?);
            } else {
                output.push(node.clone());
            }
        }
        if !bare.is_empty() {
            output.push(list(self.target, bare)?);
        }
        let count = last
            .checked_sub(first)
            .and_then(|n| n.checked_add(1))
            .ok_or_else(|| fault("breditor/nested-wrap-path-fault"))?;
        Ok(evaluation(plan_span(state, first, count, output)?, activation))
    }
}

/// Rebuild child sections before splitting this container. All paths refer to
/// the source snapshot, so earlier section splits cannot retarget later items.
fn convert(
    node: &NodeRef,
    path: &NodePath,
    selected: &BTreeSet<NodePath>,
    target: ListKind,
) -> Result<Vec<NodeRef>, ActionFault> {
    let element = node.as_element().ok_or_else(|| fault("breditor/nested-wrap-source-fault"))?;
    let kind = list_kind(node)?.ok_or_else(|| fault("breditor/nested-wrap-source-fault"))?;
    let mut items = Vec::new();
    let mut flags = Vec::new();
    for (index, item) in element.children().iter().enumerate() {
        let item_path = path
            .try_child(u32::try_from(index).map_err(|_| fault("breditor/nested-wrap-path-fault"))?)
            .map_err(|_| fault("breditor/nested-wrap-path-fault"))?;
        let item_element =
            item.as_element().ok_or_else(|| fault("breditor/nested-wrap-source-fault"))?;
        let mut children = Vec::new();
        for (section, child) in item_element.children().iter().enumerate() {
            if section == 0 {
                children.push(child.clone());
            } else {
                let child_path = item_path
                    .try_child(
                        u32::try_from(section)
                            .map_err(|_| fault("breditor/nested-wrap-path-fault"))?,
                    )
                    .map_err(|_| fault("breditor/nested-wrap-path-fault"))?;
                children.extend(convert(child, &child_path, selected, target)?);
            }
        }
        flags.push(
            !same_marker(kind, target)
                && selected.contains(
                    &item_path
                        .try_child(0)
                        .map_err(|_| fault("breditor/nested-wrap-path-fault"))?,
                ),
        );
        items.push(NodeRef::element(
            item_element
                .try_with_children(children)
                .map_err(|_| fault("breditor/nested-wrap-build-fault"))?,
        ));
    }
    let mut output = Vec::new();
    let mut start = 0;
    while start < items.len() {
        let changed = flags[start];
        let mut end = start + 1;
        while end < items.len() && flags[end] == changed {
            end += 1;
        }
        let section = items[start..end].to_vec();
        if changed {
            // The shared constructor supplies marker metadata; replace its raw
            // children with the original items, including rebuilt descendants.
            let template = list(target, Vec::new())?;
            output.push(NodeRef::element(
                template
                    .as_element()
                    .ok_or_else(|| fault("breditor/nested-wrap-build-fault"))?
                    .try_with_children(section)
                    .map_err(|_| fault("breditor/nested-wrap-build-fault"))?,
            ));
        } else {
            output.push(suffix(
                node,
                u32::try_from(start).map_err(|_| fault("breditor/nested-wrap-path-fault"))?,
                section,
            )?);
        }
        start = end;
    }
    Ok(output)
}
