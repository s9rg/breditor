use crate::{
    action::{ActionDecision, ActionFault, DisabledReason},
    document::{FormatSet, TextFragment},
    identity::QualifiedName,
    operation::{ParagraphSplit, SelectionRelocationPolicy},
    position::{Affinity, NodePath, Point, TextOffset},
    selection::{RangeSelection, Selection},
    state::EditorState,
};

use super::super::text_position::{
    TextPositionError, TextRangeSelection, normalize_range_selection,
    normalize_same_paragraph_selection, point_at_fragment_offset,
};

pub(super) fn require_base_range(
    state: &EditorState,
) -> Result<Result<TextRangeSelection, DisabledReason>, ActionFault> {
    if !state.context().schema().is_exact_breditor_base() {
        return Ok(Err(disabled_reason("breditor/unsupported-schema")));
    }
    match normalize_same_paragraph_selection(state) {
        Ok(range) => Ok(Ok(range)),
        Err(error) => map_text_position_error(error),
    }
}

pub(super) fn require_base_text_range(
    state: &EditorState,
) -> Result<Result<TextRangeSelection, DisabledReason>, ActionFault> {
    if !state.context().schema().is_exact_breditor_base() {
        return Ok(Err(disabled_reason("breditor/unsupported-schema")));
    }
    match normalize_range_selection(state) {
        Ok(range) => Ok(Ok(range)),
        Err(error) => map_text_position_error(error),
    }
}

fn map_text_position_error(
    error: TextPositionError,
) -> Result<Result<TextRangeSelection, DisabledReason>, ActionFault> {
    match error {
        TextPositionError::NoSelection => Ok(Err(disabled_reason("breditor/no-selection"))),
        TextPositionError::UnsupportedSelection => {
            Ok(Err(disabled_reason("breditor/unsupported-selection")))
        }
        TextPositionError::CrossParagraph { .. } => {
            Ok(Err(disabled_reason("breditor/cross-paragraph-selection")))
        }
        TextPositionError::UnsupportedPosition { .. }
        | TextPositionError::NotDirectRootParagraph { .. } => {
            Ok(Err(disabled_reason("breditor/unsupported-text-position")))
        }
        error => Err(fault_with_error("breditor/text-position-fault", &error)),
    }
}

pub(super) fn require_operation_budget(
    state: &EditorState,
    required: usize,
) -> Option<ActionDecision> {
    (required > state.context().max_operations_per_transaction())
        .then(|| ActionDecision::Disabled(disabled_reason("breditor/operation-budget-exceeded")))
}

pub(super) fn paragraph_fragment(
    state: &EditorState,
    paragraph_path: &NodePath,
    boundary: TextOffset,
) -> Result<TextFragment, ActionFault> {
    ParagraphSplit::capture(state.context(), state.document(), paragraph_path.clone(), boundary)
        .map(|operation| operation.expected().clone())
        .map_err(|error| fault_with_error("breditor/paragraph-capture-fault", &error))
}

pub(super) fn fragment_range_parts(
    fragment: &TextFragment,
    start: TextOffset,
    end: TextOffset,
) -> Result<(TextFragment, TextFragment, TextFragment), ActionFault> {
    if end < start {
        return Err(fault("breditor/reversed-action-range"));
    }
    let (prefix, tail) = fragment
        .split_at(start)
        .map_err(|error| fault_with_error("breditor/fragment-split-fault", &error))?;
    let selected_length = end
        .get()
        .checked_sub(start.get())
        .ok_or_else(|| fault("breditor/reversed-action-range"))?;
    let (selected, suffix) = tail
        .split_at(
            TextOffset::try_new(selected_length)
                .map_err(|error| fault_with_error("breditor/text-offset-fault", &error))?,
        )
        .map_err(|error| fault_with_error("breditor/fragment-split-fault", &error))?;
    Ok((prefix, selected, suffix))
}

pub(super) fn effective_typing_formats(
    state: &EditorState,
    fragment: &TextFragment,
    offset: TextOffset,
    affinity: Affinity,
) -> Result<FormatSet, ActionFault> {
    match state.pending_formats() {
        Some(formats) => Ok(formats.clone()),
        None => contextual_formats(fragment, offset, affinity),
    }
}

pub(super) fn contextual_formats(
    fragment: &TextFragment,
    offset: TextOffset,
    affinity: Affinity,
) -> Result<FormatSet, ActionFault> {
    let mut cursor = 0_u64;
    let mut left = None;
    let mut right = None;
    for run in fragment {
        let end = cursor
            .checked_add(u64::from(run.utf16_len()))
            .ok_or_else(|| fault("breditor/contextual-format-offset-fault"))?;
        if cursor < offset.get() && offset.get() <= end {
            left = Some(run.formats().clone());
        }
        if cursor <= offset.get() && offset.get() < end {
            right = Some(run.formats().clone());
        }
        cursor = end;
    }
    if offset.get() > cursor {
        return Err(fault("breditor/contextual-format-offset-fault"));
    }
    Ok(match affinity {
        Affinity::Before => left.or(right).unwrap_or_default(),
        Affinity::After => right.or(left).unwrap_or_default(),
    })
}

pub(super) fn base_shape_fits(
    state: &EditorState,
    removed_paragraphs: usize,
    removed_text_runs: usize,
    result_paragraphs: &[&TextFragment],
) -> bool {
    let limits = state.context().limits();
    if result_paragraphs.iter().any(|fragment| {
        fragment.len() > limits.max_children_per_element()
            || u32::try_from(fragment.len()).is_err()
            || fragment.iter().any(|run| {
                run.text().len() > limits.max_text_bytes()
                    || run.formats().len() > limits.max_formats_per_text()
            })
    }) {
        return false;
    }

    let Some(root) = state.document().root().as_element() else {
        return false;
    };
    let Some(retained_root_children) = root.children().len().checked_sub(removed_paragraphs) else {
        return false;
    };
    let Some(result_root_children) = retained_root_children.checked_add(result_paragraphs.len())
    else {
        return false;
    };
    if result_root_children > limits.max_children_per_element()
        || u32::try_from(result_root_children).is_err()
    {
        return false;
    }

    let Ok(current_nodes) = usize::try_from(state.document().summary().node_count()) else {
        return false;
    };
    let Some(removed_nodes) = removed_paragraphs.checked_add(removed_text_runs) else {
        return false;
    };
    let Some(retained_nodes) = current_nodes.checked_sub(removed_nodes) else {
        return false;
    };
    let Some(result_text_runs) = result_paragraphs
        .iter()
        .try_fold(0_usize, |total, fragment| total.checked_add(fragment.len()))
    else {
        return false;
    };
    let Some(added_nodes) = result_paragraphs.len().checked_add(result_text_runs) else {
        return false;
    };
    let Some(result_nodes) = retained_nodes.checked_add(added_nodes) else {
        return false;
    };
    result_nodes <= limits.max_nodes()
}

pub(super) fn base_total_text_fits(
    state: &EditorState,
    removed_text_bytes: usize,
    result_text_bytes: usize,
) -> bool {
    let Ok(removed) = u64::try_from(removed_text_bytes) else {
        return false;
    };
    let Ok(result) = u64::try_from(result_text_bytes) else {
        return false;
    };
    let maximum =
        u64::try_from(state.context().limits().max_total_text_bytes()).unwrap_or(u64::MAX);
    state
        .document()
        .summary()
        .total_text_bytes()
        .checked_sub(removed)
        .and_then(|retained| retained.checked_add(result))
        .is_some_and(|total| total <= maximum)
}

pub(super) fn collapsed_selection_at(
    paragraph_path: &NodePath,
    fragment: &TextFragment,
    offset: TextOffset,
) -> Result<Selection, ActionFault> {
    collapsed_selection_at_with_affinity(paragraph_path, fragment, offset, Affinity::After)
}

pub(super) fn collapsed_selection_at_with_affinity(
    paragraph_path: &NodePath,
    fragment: &TextFragment,
    offset: TextOffset,
    affinity: Affinity,
) -> Result<Selection, ActionFault> {
    let point = point_at_fragment_offset(paragraph_path, fragment, offset, affinity)
        .map_err(|error| fault_with_error("breditor/caret-construction-fault", &error))?;
    Ok(collapsed_selection(point))
}

pub(super) fn collapsed_selection(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

pub(super) const fn strict_relocation() -> SelectionRelocationPolicy {
    SelectionRelocationPolicy::new(
        crate::operation::DeletedPointPolicy::Reject,
        crate::operation::DeletedPointPolicy::Reject,
    )
}

pub(super) fn disabled(reason: &'static str) -> ActionDecision {
    ActionDecision::Disabled(disabled_reason(reason))
}

pub(super) fn disabled_reason(reason: &'static str) -> DisabledReason {
    DisabledReason::new(QualifiedName::from_known_static(reason), None)
}

pub(super) fn fault(code: &'static str) -> ActionFault {
    ActionFault::new(QualifiedName::from_known_static(code), None)
}

fn fault_with_error(code: &'static str, _error: &impl std::error::Error) -> ActionFault {
    // Human error text is intentionally not copied into a machine-readable
    // decision. The stable code is the current control-flow contract; more
    // granular typed mappings can be added without turning Display text into a
    // protocol.
    fault(code)
}
