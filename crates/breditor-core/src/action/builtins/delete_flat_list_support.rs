//! Shared flat-list deletion routing and single-block grapheme semantics.
use super::{
    delete_flat_list_structure,
    flat_list_text_support::capture,
    grapheme_boundary::{
        grapheme_boundary_at_or_after, grapheme_boundary_at_or_before, next_grapheme_boundary,
        previous_grapheme_boundary,
    },
    support::{
        collapsed_selection, disabled, fault, fragment_range_parts, require_operation_budget,
        strict_relocation,
    },
};
use crate::{
    action::{
        ActionDecision, ActionFault, ActionPlan,
        text_position::{normalize_flat_list_range_selection, point_at_flat_list_fragment_offset},
    },
    document::TextFragment,
    identity::QualifiedName,
    operation::{
        FlatListTextRange, FlatListTextSplice, FlatListTextSpliceError, Operation, TextRange,
    },
    position::{Affinity, TextOffset},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

#[derive(Clone, Copy)]
pub(super) enum Deletion {
    Backward,
    Forward,
    Selection,
}

pub(super) fn evaluate(
    state: &EditorState,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_flat_list_operations() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_flat_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if range.is_collapsed() && matches!(direction, Deletion::Selection) {
        return Ok(disabled("breditor/collapsed-selection"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let path = range.start().paragraph_path();
    if !range.is_same_paragraph() {
        let range = FlatListTextRange::try_new(
            path.clone(),
            range.start().offset(),
            range.end().paragraph_path().clone(),
            range.end().offset(),
        )
        .map_err(|_| fault("breditor/list-delete-range-fault"))?;
        return delete_flat_list_structure::delete(state, &range, Deletion::Selection);
    }
    let source = capture(state, path)?;
    let start = range.start().offset();
    let end = range.end().offset();
    let (start, end) = if range.is_collapsed() {
        match direction {
            Deletion::Backward => {
                if start == TextOffset::ZERO {
                    return delete_flat_list_structure::boundary(state, path, &source, direction);
                }
                let Some(previous) = previous_grapheme_boundary(&source.text, start)? else {
                    return Ok(disabled("breditor/caret-not-grapheme-boundary"));
                };
                (previous, end)
            }
            Deletion::Forward => {
                if end == source.text.utf16_len() {
                    return delete_flat_list_structure::boundary(state, path, &source, direction);
                }
                let Some(next) = next_grapheme_boundary(&source.text, end)? else {
                    return Ok(disabled("breditor/caret-not-grapheme-boundary"));
                };
                (start, next)
            }
            Deletion::Selection => return Err(fault("breditor/list-delete-range-fault")),
        }
    } else {
        (start, end)
    };
    let (prefix, _, suffix) = fragment_range_parts(&source.text, start, end)?;
    let Ok(result) = prefix.try_concat(&suffix) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let operation = FlatListTextSplice::capture(
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
        Err(FlatListTextSpliceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/list-delete-plan-fault")),
    };
    let (offset, affinity, history) =
        seam(&result, start, if range.is_collapsed() { direction } else { Deletion::Selection })?;
    let caret = point_at_flat_list_fragment_offset(path, &result, offset, affinity)
        .map_err(|_| fault("breditor/list-delete-caret-fault"))?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextSplice(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(collapsed_selection(caret))),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        history,
    )))
}

/// Directional deletion snaps newly joined clusters; explicit scalar ranges do not.
pub(super) fn seam(
    result: &TextFragment,
    offset: TextOffset,
    direction: Deletion,
) -> Result<(TextOffset, Affinity, HistoryIntent), ActionFault> {
    Ok(match direction {
        Deletion::Backward => (
            grapheme_boundary_at_or_after(result, offset)?,
            Affinity::After,
            HistoryIntent::Merge {
                group: QualifiedName::from_known_static("breditor/delete-backward"),
            },
        ),
        Deletion::Forward => (
            grapheme_boundary_at_or_before(result, offset)?,
            Affinity::Before,
            HistoryIntent::Merge {
                group: QualifiedName::from_known_static("breditor/delete-forward"),
            },
        ),
        Deletion::Selection => (offset, Affinity::After, HistoryIntent::Record),
    })
}
