//! Typing within and across bare blocks and flat-list items.
use super::{
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextAction, InsertTextInput,
    flat_list_text_support::capture,
    insert_text::{ReplacementError, concat_result, replacement_fragment, source_range},
    support::{
        disabled, effective_typing_formats, fault, fragment_range_parts, require_operation_budget,
        strict_relocation,
    },
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionPlan, ActionStateSpec,
        text_position::{normalize_flat_list_range_selection, point_at_flat_list_fragment_offset},
    },
    identity::QualifiedName,
    operation::{
        AppliedOperation, FlatListTextSplice, FlatListTextSpliceError, Operation, TextRange,
        TextSpliceApplyError,
    },
    position::Affinity,
    selection::RangeSelection,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Inserts exact text within or across paragraphs/headings in the flat-list profile.
///
/// Uses the existing bounded `InsertTextInput`. Collapsed typing uses pending
/// formats or focus affinity; type-over uses the first selected run's formats.
/// Single-block typing preserves list structure, numbering and heading rank,
/// consumes pending formats
/// and places a Before-affinity caret after insertion. Adjacent typing offers the
/// existing typing history group. Registration is explicit and experimental.
///
/// Cross-block replacement retains the spatial start block kind and container
/// family. Within one list, its start is retained and later ordinals adjust to
/// the resulting item count. A surviving suffix in a different list remains
/// separate with its original ordinal start. The first selected text run supplies
/// formatting, or the surviving left/right seam when only breaks are selected.
/// There is no implicit adjacent-list merge or numbered-list restart.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertFlatListTextAction;
impl Action for InsertFlatListTextAction {
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
    if !state.context().schema().supports_flat_list_operations() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_flat_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    if !range.is_same_paragraph() {
        return super::insert_flat_list_structure::evaluate(state, input, &range);
    }
    let path = range.start().paragraph_path();
    let source = capture(state, path)?.text;
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
    let operation = match FlatListTextSplice::capture(
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
    let point = point_at_flat_list_fragment_offset(path, &result, offset, Affinity::Before)
        .map_err(|_| fault("breditor/list-text-caret-fault"))?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextSplice(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(RangeSelection::new(point.clone(), point).into())),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
    )))
}
fn is_limit(error: &FlatListTextSpliceError) -> bool {
    matches!(
        error,
        FlatListTextSpliceError::Validation(_)
            | FlatListTextSpliceError::Text(
                TextSpliceApplyError::FragmentRunCountLimit { .. }
                    | TextSpliceApplyError::FragmentTotalTextBytesLimit { .. }
                    | TextSpliceApplyError::FragmentTextBytesLimit { .. }
                    | TextSpliceApplyError::FragmentFormatCountLimit { .. }
                    | TextSpliceApplyError::FragmentPropertyValueCountLimit { .. }
                    | TextSpliceApplyError::FragmentPropertyStringBytesLimit { .. }
            )
    )
}
