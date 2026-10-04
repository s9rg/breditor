//! Cross-block typing with explicit list-retention and formatting policy.
use super::{
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextInput,
    flat_list_text_support::{capture, first_middle_formats, joined_layout, result_path},
    insert_text::{ReplacementError, concat_result, replacement_fragment},
    support::{collapsed_selection, disabled, fault, strict_relocation},
};
use crate::{
    action::{
        ActionDecision, ActionFault, ActionPlan,
        text_position::{TextRangeSelection, point_at_flat_list_fragment_offset},
    },
    document::NodeRef,
    identity::QualifiedName,
    operation::{FlatListTextRange, FlatListTextReplace, FlatListTextReplaceError, Operation},
    position::Affinity,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn evaluate(
    state: &EditorState,
    input: &InsertTextInput,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    let first = capture(state, range.start().paragraph_path())?;
    let last = capture(state, range.end().paragraph_path())?;
    let (prefix, selected_first) = first
        .text
        .split_at(range.start().offset())
        .map_err(|_| fault("breditor/list-type-over-range-fault"))?;
    let (selected_last, suffix) = last
        .text
        .split_at(range.end().offset())
        .map_err(|_| fault("breditor/list-type-over-range-fault"))?;
    let formats = match selected_first.iter().next() {
        Some(run) => Some(run.formats().clone()),
        None => first_middle_formats(state, range)?,
    }
    .or_else(|| selected_last.iter().next().map(|run| run.formats().clone()))
    .or_else(|| prefix.iter().next_back().map(|run| run.formats().clone()))
    .or_else(|| suffix.iter().next().map(|run| run.formats().clone()))
    .unwrap_or_default();
    let replacement = match replacement_fragment(input, formats) {
        Ok(fragment) => fragment,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => return Err(fault("breditor/list-text-input-fault")),
    };
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let children =
        replacement.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
    let inserted = first
        .node
        .as_element()
        .ok_or_else(|| fault("breditor/list-text-source-fault"))?
        .try_with_children(children)
        .map_err(|_| fault("breditor/list-type-over-node-fault"))?;
    let layout = joined_layout(&first, &last)?;
    let path = result_path(first.root, &layout, first.item)?;
    let operation_range = FlatListTextRange::try_new(
        range.start().paragraph_path().clone(),
        range.start().offset(),
        range.end().paragraph_path().clone(),
        range.end().offset(),
    )
    .map_err(|_| fault("breditor/list-type-over-range-fault"))?;
    let operation = FlatListTextReplace::capture(
        state.context(),
        state.document(),
        operation_range,
        vec![NodeRef::element(inserted)],
        layout,
    )
    .and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let operation = match operation {
        Ok(op) => op,
        Err(FlatListTextReplaceError::RootChildLimit | FlatListTextReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(FlatListTextReplaceError::OrdinalOverflow) => {
            return Ok(disabled("breditor/list-ordinal-overflow"));
        }
        Err(_) => return Err(fault("breditor/list-type-over-plan-fault")),
    };
    let offset = range
        .start()
        .offset()
        .checked_add(u64::from(input.utf16_len()))
        .map_err(|_| fault("breditor/list-text-caret-fault"))?;
    let caret = point_at_flat_list_fragment_offset(&path, &result, offset, Affinity::Before)
        .map_err(|_| fault("breditor/list-text-caret-fault"))?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(collapsed_selection(caret))),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
    )))
}
