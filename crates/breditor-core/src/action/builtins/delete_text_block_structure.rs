//! Atomic boundary joins and selected deletion, retaining the spatial left kind.
use super::{
    delete_text_block_support::Deletion,
    grapheme_boundary::{grapheme_boundary_at_or_after, grapheme_boundary_at_or_before},
    support::{collapsed_selection_at_with_affinity, disabled, fault, strict_relocation},
    text_block_support::text_block_source,
};
use crate::{
    action::{ActionDecision, ActionFault, ActionPlan},
    identity::QualifiedName,
    operation::{
        Operation, RootTextBoundary, RootTextRange, TextBlockReplace, TextBlockReplaceError,
    },
    position::{Affinity, NodePath, TextOffset},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn join(
    state: &EditorState,
    left: &NodePath,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    let index = left.last_index().ok_or_else(|| fault("breditor/text-block-join-path-fault"))?;
    let count = state
        .document()
        .root()
        .as_element()
        .ok_or_else(|| fault("breditor/text-block-source-fault"))?
        .children()
        .len();
    let right = index.checked_add(1).ok_or_else(|| fault("breditor/text-block-join-path-fault"))?;
    if u64::from(right) >= u64::try_from(count).unwrap_or(u64::MAX) {
        return Ok(disabled("breditor/at-document-end"));
    }
    let (_, source) = text_block_source(state, left)?;
    let right = NodePath::try_from_indices(vec![right])
        .map_err(|_| fault("breditor/text-block-join-path-fault"))?;
    let range = root_range(left, source.utf16_len(), &right, TextOffset::ZERO)?;
    delete(state, &range, direction)
}

pub(super) fn root_range(
    start_path: &NodePath,
    start: TextOffset,
    end_path: &NodePath,
    end: TextOffset,
) -> Result<RootTextRange, ActionFault> {
    let start = RootTextBoundary::try_new(start_path.clone(), start)
        .map_err(|_| fault("breditor/text-block-delete-range-fault"))?;
    let end = RootTextBoundary::try_new(end_path.clone(), end)
        .map_err(|_| fault("breditor/text-block-delete-range-fault"))?;
    RootTextRange::try_new(start, end).map_err(|_| fault("breditor/text-block-delete-range-fault"))
}

pub(super) fn delete(
    state: &EditorState,
    range: &RootTextRange,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    let path = range.start().paragraph_path();
    let (first, source) = text_block_source(state, path)?;
    let (_, tail) = text_block_source(state, range.end().paragraph_path())?;
    let (prefix, _) = source
        .split_at(range.start().offset())
        .map_err(|_| fault("breditor/text-block-delete-range-fault"))?;
    let (_, suffix) = tail
        .split_at(range.end().offset())
        .map_err(|_| fault("breditor/text-block-delete-range-fault"))?;
    let Ok(result) = prefix.try_concat(&suffix) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let empty = first
        .as_element()
        .ok_or_else(|| fault("breditor/text-block-source-fault"))?
        .try_with_children(vec![])
        .map_err(|_| fault("breditor/text-block-delete-node-fault"))?;
    let operation = TextBlockReplace::capture(
        state.context(),
        state.document(),
        range.clone(),
        vec![crate::document::NodeRef::element(empty)],
    )
    .and_then(|operation| {
        operation.apply(state.context(), state.document())?;
        Ok(operation)
    });
    let operation = match operation {
        Ok(operation) => operation,
        Err(TextBlockReplaceError::RootChildLimit | TextBlockReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/text-block-delete-plan-fault")),
    };
    let seam = range.start().offset();
    let (caret, affinity, history) = match direction {
        Deletion::Backward => (
            grapheme_boundary_at_or_after(&result, seam)?,
            Affinity::After,
            HistoryIntent::Merge {
                group: QualifiedName::from_known_static("breditor/delete-backward"),
            },
        ),
        Deletion::Forward => (
            grapheme_boundary_at_or_before(&result, seam)?,
            Affinity::Before,
            HistoryIntent::Merge {
                group: QualifiedName::from_known_static("breditor/delete-forward"),
            },
        ),
        Deletion::Selection => (seam, Affinity::After, HistoryIntent::Record),
    };
    let selection = collapsed_selection_at_with_affinity(path, &result, caret, affinity)?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        history,
    )))
}
