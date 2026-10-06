//! Lift a sibling run while preserving depth-first reading order.
use super::{
    flat_list_support, nested_list_support,
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

/// Lifts selected nested siblings to become siblings of their parent item.
///
/// Trailing siblings and later child-list sections move beneath the last lifted
/// item, after its existing descendants. Earlier sections remain with the parent.
/// Promoted items use the destination list's markers. Retained numbered sections
/// keep explicit starts. Root-level outdent is disabled (use Remove list).
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct OutdentListItemsAction;
impl Action for OutdentListItemsAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        flat_list_support::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        Ok(flat_list_support::evaluation(evaluate(state)?, ActionActivation::Inactive))
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
    if run.list_path().len() == 1 {
        return Ok(disabled("breditor/list-already-root"));
    }
    let parent_path = run.list_path().parent().ok_or_else(|| fault("breditor/list-path-fault"))?;
    let outer_path = parent_path.parent().ok_or_else(|| fault("breditor/list-path-fault"))?;
    let section = usize::try_from(
        run.list_path().last_index().ok_or_else(|| fault("breditor/list-path-fault"))?,
    )
    .map_err(|_| fault("breditor/list-path-fault"))?;
    let parent_index =
        usize::try_from(parent_path.last_index().ok_or_else(|| fault("breditor/list-path-fault"))?)
            .map_err(|_| fault("breditor/list-path-fault"))?;
    let outer =
        state.document().node_at(&outer_path).map_err(|_| fault("breditor/list-source-fault"))?;
    let replacement = lift(outer, parent_index, section, run.items())?;
    nested_list_support::plan(state, outer_path, replacement)
}

fn lift(
    outer: &NodeRef,
    parent_index: usize,
    section: usize,
    range: std::ops::Range<u32>,
) -> Result<NodeRef, ActionFault> {
    let outer = outer.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let mut siblings: Vec<_> = outer.children().iter().cloned().collect();
    let parent = siblings
        .get(parent_index)
        .and_then(NodeRef::as_element)
        .ok_or_else(|| fault("breditor/list-source-fault"))?;
    let sections: Vec<_> = parent.children().iter().cloned().collect();
    let source = sections.get(section).ok_or_else(|| fault("breditor/list-source-fault"))?;
    let container = source.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let items: Vec<_> = container.children().iter().cloned().collect();
    let first = usize::try_from(range.start).map_err(|_| fault("breditor/list-source-fault"))?;
    let end = usize::try_from(range.end).map_err(|_| fault("breditor/list-source-fault"))?;
    let mut promoted =
        items.get(first..end).ok_or_else(|| fault("breditor/list-source-fault"))?.to_vec();
    let mut retained =
        sections.get(..section).ok_or_else(|| fault("breditor/list-source-fault"))?.to_vec();
    if first > 0 {
        retained.push(NodeRef::element(
            container
                .try_with_children(items[..first].to_vec())
                .map_err(|_| fault("breditor/list-build-fault"))?,
        ));
    }
    let last = promoted.pop().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let last = last.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let mut descendants: Vec<_> = last.children().iter().cloned().collect();
    if end < items.len() {
        descendants.push(suffix(source, range.end, items[end..].to_vec())?);
    }
    descendants.extend(sections.iter().skip(section + 1).cloned());
    promoted.push(NodeRef::element(
        last.try_with_children(descendants).map_err(|_| fault("breditor/list-build-fault"))?,
    ));
    let parent = NodeRef::element(
        parent.try_with_children(retained).map_err(|_| fault("breditor/list-build-fault"))?,
    );
    siblings.splice(parent_index..=parent_index, std::iter::once(parent).chain(promoted));
    Ok(NodeRef::element(
        outer.try_with_children(siblings).map_err(|_| fault("breditor/list-build-fault"))?,
    ))
}

pub(super) fn suffix(
    source: &NodeRef,
    offset: u32,
    items: Vec<NodeRef>,
) -> Result<NodeRef, ActionFault> {
    let container = source.as_element().ok_or_else(|| fault("breditor/list-source-fault"))?;
    let mut properties = container.properties().clone();
    if let Some(ListKind::Ordered(start)) = flat_list_support::list_kind(source)? {
        let ordinal =
            start.ordinal_at(offset).ok_or_else(|| fault("breditor/list-ordinal-fault"))?;
        properties = PropertyMap::try_from_sorted(vec![(
            QualifiedName::from_known_static("breditor/start"),
            PropertyValue::from_integer(
                PropertyInteger::try_new(i64::from(ordinal))
                    .map_err(|_| fault("breditor/list-ordinal-fault"))?,
            ),
        )])
        .map_err(|_| fault("breditor/list-ordinal-fault"))?;
    }
    Ok(NodeRef::element(
        ElementNode::try_new(container.kind().clone(), None, properties, items)
            .map_err(|_| fault("breditor/list-build-fault"))?,
    ))
}
