//! Atomic Enter semantics across bare blocks and nested item text ranges.
use super::{
    InsertTextAction, OutdentListItemsAction,
    flat_list_text_support::empty_block,
    nested_list_range_layout::replacement_roots,
    outdent_list_items::suffix,
    support::{disabled, fault, require_operation_budget, strict_relocation},
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec, text_position::normalize_nested_list_range_selection,
    },
    block::TextBlockKind,
    document::{NodeRef, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        NestedListTextRange, NestedListTextReplace, NestedListTextReplaceError, Operation,
        block_kind,
    },
    position::{Affinity, NodePath, Point},
    selection::RangeSelection,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Replaces the selected text range with a break; descendants stay beneath the right item so
/// reading order is unchanged. An empty nested item outdents one level. An empty
/// root item exits the list, promoting its child lists after the bare paragraph
/// and retaining any following ordered section's original starting ordinal.
/// Middle heading splits retain rank; an empty right suffix becomes a paragraph.
/// Pending formats survive and each edit is one undo unit with exact V7 recovery.
/// Cross-block ranges retain the left location, use the right endpoint's block
/// kind, and preserve surviving child sections through the shared range policy.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertNestedListBreakAction;
/// Returns the opt-in nested Enter identity.
#[must_use]
pub fn insert_nested_list_break_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-nested-list-break",
    ))
}
impl Action for InsertNestedListBreakAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        InsertTextAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state).map(ActionEvaluation::stateless)
    }
}
fn evaluate(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/nested-break-selection-fault"))?;
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let path = range.start().paragraph_path();
    let node =
        state.document().node_at(path).map_err(|_| fault("breditor/nested-break-source-fault"))?;
    let text = fragment(node)?;
    let last = state
        .document()
        .node_at(range.end().paragraph_path())
        .map_err(|_| fault("breditor/nested-break-source-fault"))?;
    let last_text = fragment(last)?;
    let empty = range.is_collapsed() && text.is_empty();
    if empty && path.len() > 3 {
        return Ok(OutdentListItemsAction.evaluate(state, &())?.decision().clone());
    }
    let exit =
        empty && (path.len() == 3 || matches!(block_kind(node), Ok(TextBlockKind::Heading(_))));
    let inserted = if exit {
        vec![empty_block(node, true)?]
    } else {
        vec![
            empty_block(node, false)?,
            empty_block(last, range.end().offset() == last_text.utf16_len())?,
        ]
    };
    let (roots, caret) = if exit && path.len() == 3 {
        exit_root_item(state, path, &inserted[0])?
    } else {
        let roots = replacement_roots(state, &range, &inserted)?;
        let caret = if exit { path.clone() } else { right_block_path(path)? };
        (roots, caret)
    };
    let range = NestedListTextRange::try_new(
        path.clone(),
        range.start().offset(),
        range.end().paragraph_path().clone(),
        range.end().offset(),
    )
    .map_err(|_| fault("breditor/nested-break-range-fault"))?;
    let operation = NestedListTextReplace::capture_layout(&roots)
        .and_then(|layout| {
            NestedListTextReplace::capture(
                state.context(),
                state.document(),
                range,
                inserted,
                layout,
            )
        })
        .and_then(|op| {
            op.apply(state.context(), state.document())?;
            Ok(op)
        });
    let operation = match operation {
        Ok(op) => op,
        Err(
            NestedListTextReplaceError::Validation(_) | NestedListTextReplaceError::RootChildLimit,
        ) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(NestedListTextReplaceError::OrdinalOverflow) => {
            return Ok(disabled("breditor/list-ordinal-overflow"));
        }
        Err(_) => return Err(fault("breditor/nested-break-plan-fault")),
    };
    let caret = Point::Children { parent_path: caret, child_index: 0, affinity: Affinity::After };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::NestedListTextReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(RangeSelection::new(caret.clone(), caret).into())),
        PendingFormatsUpdate::Preserve,
        HistoryIntent::Record,
    )))
}
fn fragment(node: &NodeRef) -> Result<TextFragment, ActionFault> {
    let runs = node
        .as_element()
        .ok_or_else(|| fault("breditor/nested-break-source-fault"))?
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/nested-break-source-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    TextFragment::try_from_runs(runs).map_err(|_| fault("breditor/nested-break-source-fault"))
}
fn right_block_path(path: &NodePath) -> Result<NodePath, ActionFault> {
    let mut indexes = path.to_vec();
    let at = if indexes.len() == 1 { 0 } else { indexes.len() - 2 };
    indexes[at] =
        indexes[at].checked_add(1).ok_or_else(|| fault("breditor/nested-break-path-fault"))?;
    NodePath::try_from_indices(indexes).map_err(|_| fault("breditor/nested-break-path-fault"))
}
fn exit_root_item(
    state: &EditorState,
    path: &NodePath,
    paragraph: &NodeRef,
) -> Result<(Vec<NodeRef>, NodePath), ActionFault> {
    let root_index = path.as_slice()[0];
    let index = path.as_slice()[1];
    let root_path = NodePath::try_from_indices(vec![root_index])
        .map_err(|_| fault("breditor/nested-break-path-fault"))?;
    let source = state
        .document()
        .node_at(&root_path)
        .map_err(|_| fault("breditor/nested-break-path-fault"))?;
    let list = source.as_element().ok_or_else(|| fault("breditor/nested-break-source-fault"))?;
    let native = usize::try_from(index).map_err(|_| fault("breditor/nested-break-path-fault"))?;
    let item = list
        .children()
        .get(native)
        .and_then(NodeRef::as_element)
        .ok_or_else(|| fault("breditor/nested-break-source-fault"))?;
    let mut roots = Vec::new();
    if index > 0 {
        roots.push(suffix(source, 0, list.children().iter().take(native).cloned().collect())?);
    }
    let caret_index = root_index
        .checked_add(u32::from(index > 0))
        .ok_or_else(|| fault("breditor/nested-break-path-fault"))?;
    roots.push(paragraph.clone());
    roots.extend(item.children().iter().skip(1).cloned());
    if native + 1 < list.children().len() {
        roots.push(suffix(
            source,
            index.checked_add(1).ok_or_else(|| fault("breditor/nested-break-path-fault"))?,
            list.children().iter().skip(native + 1).cloned().collect(),
        )?);
    }
    Ok((
        roots,
        NodePath::try_from_indices(vec![caret_index])
            .map_err(|_| fault("breditor/nested-break-path-fault"))?,
    ))
}
