//! Nested directional deletion with grapheme-safe seams and structural routing.
use super::{
    grapheme_boundary::{next_grapheme_boundary, previous_grapheme_boundary},
    insert_nested_list_structure::capture,
    support::{
        collapsed_selection, disabled, fault, fragment_range_parts, require_operation_budget,
        strict_relocation,
    },
};
use crate::{
    action::{
        ActionDecision, ActionFault, ActionPlan,
        text_position::{
            normalize_nested_list_range_selection, point_at_nested_list_fragment_offset,
        },
    },
    document::TextFragment,
    operation::{NestedListTextSplice, Operation, TextRange},
    position::TextOffset,
    state::EditorState,
    transaction::{PendingFormatsUpdate, SelectionUpdate},
};

use super::delete_flat_list_support::{Deletion, seam};

pub(super) fn evaluate(
    state: &EditorState,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if range.is_collapsed() && matches!(direction, Deletion::Selection) {
        return Ok(disabled("breditor/collapsed-selection"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let path = range.start().paragraph_path();
    if !range.is_collapsed() {
        return super::delete_nested_list_selection::evaluate(state);
    }
    let (_, source) = capture(state, path)?;
    let start = range.start().offset();
    let end = range.end().offset();
    let (start, end) = if range.is_collapsed() {
        match direction {
            Deletion::Backward => {
                if start == TextOffset::ZERO {
                    return super::delete_nested_list_structure::boundary(state, path, direction);
                }
                let Some(previous) = previous_grapheme_boundary(&source, start)? else {
                    return Ok(disabled("breditor/caret-not-grapheme-boundary"));
                };
                (previous, end)
            }
            Deletion::Forward => {
                if end == source.utf16_len() {
                    return super::delete_nested_list_structure::boundary(state, path, direction);
                }
                let Some(next) = next_grapheme_boundary(&source, end)? else {
                    return Ok(disabled("breditor/caret-not-grapheme-boundary"));
                };
                (start, next)
            }
            Deletion::Selection => return Err(fault("breditor/list-delete-range-fault")),
        }
    } else {
        (start, end)
    };
    let (prefix, _, suffix) = fragment_range_parts(&source, start, end)?;
    let Ok(result) = prefix.try_concat(&suffix) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let operation = NestedListTextSplice::capture(
        state.context(),
        state.document(),
        TextRange::try_new(path.clone(), start, end)
            .map_err(|_| fault("breditor/list-delete-range-fault"))?,
        TextFragment::empty(),
    )
    .and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let operation = match operation {
        Ok(op) => op,
        Err(error) if super::insert_nested_list_text::is_limit(&error) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/list-delete-plan-fault")),
    };
    let (offset, affinity, history) =
        seam(&result, start, if range.is_collapsed() { direction } else { Deletion::Selection })?;
    let caret = point_at_nested_list_fragment_offset(path, &result, offset, affinity)
        .map_err(|_| fault("breditor/list-delete-caret-fault"))?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::NestedListTextSplice(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(collapsed_selection(caret))),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        history,
    )))
}
