//! Atomic nesting of a sibling run, carrying complete item descendants.
use super::{
    flat_list_support,
    support::{disabled, fault, require_operation_budget},
};
use crate::{
    action::{
        Action, ActionActivation, ActionDecision, ActionEvaluation, ActionFault, ActionStateSpec,
    },
    block::{ListKind, NestedListItemRange, NestedListSelectionError},
    document::{ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    identity::QualifiedName,
    selection::Selection,
    state::EditorState,
};

/// Moves selected sibling items beneath their preceding sibling.
///
/// Descendants and leading blocks remain intact. First-item and cross-container
/// selections are disabled. Ordered child sections begin at the moved item's
/// original ordinal; compatible trailing sections merge only when contiguous.
/// The result is one atomic history unit with exact selection relocation.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct IndentListItemsAction;

impl Action for IndentListItemsAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        flat_list_support::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        let decision = evaluate(state)?;
        Ok(flat_list_support::evaluation(decision, ActionActivation::Inactive))
    }
}

fn evaluate(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let Some(Selection::Range(selection)) = state.selection() else {
        return Ok(disabled("breditor/no-selection"));
    };
    let run =
        match NestedListItemRange::resolve(state.context().schema(), state.document(), selection) {
            Ok(run) => run,
            Err(
                NestedListSelectionError::DifferentLists | NestedListSelectionError::NotListItem,
            ) => return Ok(disabled("breditor/incompatible-list-selection")),
            Err(_) => return Err(fault("breditor/list-selection-fault")),
        };
    let range = run.items();
    if range.start == 0 {
        return Ok(disabled("breditor/no-preceding-list-item"));
    }
    let source = state
        .document()
        .node_at(run.list_path())
        .map_err(|_| fault("breditor/list-source-fault"))?;
    let replacement = indent_fragment(source, range)?;
    super::nested_list_support::plan(state, run.list_path().clone(), replacement)
}

fn indent_fragment(source: &NodeRef, range: std::ops::Range<u32>) -> Result<NodeRef, ActionFault> {
    let list = source.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let first = usize::try_from(range.start).map_err(|_| fault("breditor/list-source-fault"))?;
    let end = usize::try_from(range.end).map_err(|_| fault("breditor/list-source-fault"))?;
    let mut items: Vec<_> = list.children().iter().cloned().collect();
    let parent = items
        .get(first - 1)
        .and_then(NodeRef::as_element)
        .ok_or_else(|| fault("breditor/list-source-fault"))?;
    let mut children: Vec<_> = parent.children().iter().cloned().collect();
    let moved = items.get(first..end).ok_or_else(|| fault("breditor/list-source-fault"))?.to_vec();
    let kind =
        flat_list_support::list_kind(source)?.ok_or_else(|| fault("breditor/list-source-fault"))?;
    let mut properties = list.properties().clone();
    let moved_start = match kind {
        ListKind::Bullet => None,
        ListKind::Ordered(start) => {
            let ordinal = start
                .ordinal_at(range.start)
                .ok_or_else(|| fault("breditor/list-ordinal-fault"))?;
            properties = PropertyMap::try_from_sorted(vec![(
                QualifiedName::from_known_static("breditor/start"),
                PropertyValue::from_integer(
                    PropertyInteger::try_new(i64::from(ordinal))
                        .map_err(|_| fault("breditor/list-ordinal-fault"))?,
                ),
            )])
            .map_err(|_| fault("breditor/list-ordinal-fault"))?;
            Some(ordinal)
        }
    };
    let merge = if children.len() > 1 {
        let trailing = children.last().ok_or_else(|| fault("breditor/list-source-fault"))?;
        match (kind, flat_list_support::list_kind(trailing)?) {
            (ListKind::Bullet, Some(ListKind::Bullet)) => true,
            (ListKind::Ordered(_), Some(ListKind::Ordered(start))) => {
                let count = trailing
                    .as_element()
                    .ok_or_else(|| fault("breditor/list-source-fault"))?
                    .children()
                    .len();
                u32::try_from(count).ok().and_then(|count| start.ordinal_at(count)) == moved_start
            }
            _ => false,
        }
    } else {
        false
    };
    if merge {
        let trailing = children.pop().ok_or_else(|| fault("breditor/list-source-fault"))?;
        let trailing = trailing.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
        let combined = trailing.children().iter().cloned().chain(moved).collect();
        children.push(NodeRef::element(
            trailing.try_with_children(combined).map_err(|_| fault("breditor/list-build-fault"))?,
        ));
    } else {
        children.push(NodeRef::element(
            ElementNode::try_new(list.kind().clone(), None, properties, moved)
                .map_err(|_| fault("breditor/list-build-fault"))?,
        ));
    }
    let parent = NodeRef::element(
        parent.try_with_children(children).map_err(|_| fault("breditor/list-build-fault"))?,
    );
    items.splice(first - 1..end, [parent]);
    let replacement = NodeRef::element(
        list.try_with_children(items).map_err(|_| fault("breditor/list-build-fault"))?,
    );
    Ok(replacement)
}
