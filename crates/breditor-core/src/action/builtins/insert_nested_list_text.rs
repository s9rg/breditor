//! Single-block typing in bare blocks and nested-list items.
use super::{
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextAction, InsertTextInput,
    insert_text::{ReplacementError, concat_result, replacement_fragment, source_range},
    support::{
        disabled, effective_typing_formats, fault, fragment_range_parts, require_operation_budget,
        strict_relocation,
    },
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec,
        text_position::{
            normalize_nested_list_range_selection, point_at_nested_list_fragment_offset,
        },
    },
    identity::QualifiedName,
    operation::{
        AppliedOperation, NestedListTextSplice, NestedListTextSpliceError, Operation, TextRange,
        TextSpliceApplyError,
    },
    position::Affinity,
    selection::RangeSelection,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Inserts exact text in one paragraph or heading at any admitted nesting depth.
///
/// Preserves wrappers and descendants, inherits pending/focus formats for carets
/// and first-selected-run formats for type-over. Places a Before-affinity caret
/// after insertion and offers the existing typing history group. Cross-block
/// replacement is explicitly disabled pending nested structural edit support.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertNestedListTextAction;

/// Returns the opt-in nested-list typing action identity.
#[must_use]
pub fn insert_nested_list_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-nested-list-text",
    ))
}

impl Action for InsertNestedListTextAction {
    type Input = InsertTextInput;
    fn state_spec() -> ActionStateSpec {
        InsertTextAction::state_spec()
    }
    fn evaluate(
        &self,
        state: &EditorState,
        input: &InsertTextInput,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, input).map(ActionEvaluation::stateless)
    }
}
fn evaluate(state: &EditorState, input: &InsertTextInput) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    if !range.is_same_paragraph() {
        return Ok(disabled("breditor/cross-block-edit-not-yet-supported"));
    }
    let path = range.start().paragraph_path();
    let node =
        state.document().node_at(path).map_err(|_| fault("breditor/nested-text-source-fault"))?;
    let runs = node
        .as_element()
        .ok_or_else(|| fault("breditor/nested-text-source-fault"))?
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(crate::document::TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/nested-text-source-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let source = crate::document::TextFragment::try_from_runs(runs)
        .map_err(|_| fault("breditor/nested-text-source-fault"))?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let formats = if range.is_collapsed() {
        effective_typing_formats(
            state,
            &source,
            range.start().offset(),
            source_range(state)?.focus().affinity(),
        )?
    } else {
        selected
            .iter()
            .next()
            .map(|run| run.formats().clone())
            .ok_or_else(|| fault("breditor/list-text-selected-format-fault"))?
    };
    let replacement = match replacement_fragment(input, formats) {
        Ok(fragment) => fragment,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => return Err(fault("breditor/list-text-input-fault")),
    };
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let text_range = TextRange::try_new(path.clone(), range.start().offset(), range.end().offset())
        .map_err(|_| fault("breditor/list-text-range-fault"))?;
    let operation = match NestedListTextSplice::capture(
        state.context(),
        state.document(),
        text_range,
        replacement,
    ) {
        Ok(op) => op,
        Err(error) if is_limit(&error) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(_) => return Err(fault("breditor/list-text-capture-fault")),
    };
    match operation.apply(state.context(), state.document()) {
        Ok(AppliedOperation::Changed(_) | AppliedOperation::Unchanged) => {}
        Err(error) if is_limit(&error) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(_) => return Err(fault("breditor/list-text-preview-fault")),
    }
    let offset = range
        .start()
        .offset()
        .checked_add(u64::from(input.utf16_len()))
        .map_err(|_| fault("breditor/list-text-caret-fault"))?;
    let point = point_at_nested_list_fragment_offset(path, &result, offset, Affinity::Before)
        .map_err(|_| fault("breditor/list-text-caret-fault"))?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::NestedListTextSplice(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(RangeSelection::new(point.clone(), point).into())),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
    )))
}
pub(super) fn is_limit(error: &NestedListTextSpliceError) -> bool {
    matches!(
        error,
        NestedListTextSpliceError::Validation(_)
            | NestedListTextSpliceError::Text(
                TextSpliceApplyError::FragmentRunCountLimit { .. }
                    | TextSpliceApplyError::FragmentTotalTextBytesLimit { .. }
                    | TextSpliceApplyError::FragmentTextBytesLimit { .. }
                    | TextSpliceApplyError::FragmentFormatCountLimit { .. }
                    | TextSpliceApplyError::FragmentPropertyValueCountLimit { .. }
                    | TextSpliceApplyError::FragmentPropertyStringBytesLimit { .. }
            )
    )
}
