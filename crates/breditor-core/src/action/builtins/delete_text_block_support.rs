//! Shared same-block deletion semantics; boundary joins remain a separate primitive.
use super::{
    grapheme_boundary::{
        grapheme_boundary_at_or_after, grapheme_boundary_at_or_before, next_grapheme_boundary,
        previous_grapheme_boundary,
    },
    support::{
        collapsed_selection_at_with_affinity, disabled, fault, fragment_range_parts,
        require_operation_budget, require_text_block_range, strict_relocation,
    },
    text_block_support::{preview_splice, text_block_source},
};
use crate::{
    action::{ActionDecision, ActionFault, ActionPlan},
    document::TextFragment,
    identity::QualifiedName,
    operation::{Operation, TextBlockSplice, TextRange},
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
    let range = match require_text_block_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if !range.is_same_paragraph() {
        return Ok(disabled("breditor/unsupported-cross-block-selection"));
    }
    if range.is_collapsed() && matches!(direction, Deletion::Selection) {
        return Ok(disabled("breditor/collapsed-selection"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let path = range.start().paragraph_path();
    let (guard, source) = text_block_source(state, path)?;
    let start = range.start().offset();
    let end = range.end().offset();
    let (start, end, history, affinity) = if range.is_collapsed() {
        match direction {
            Deletion::Backward => {
                if start == TextOffset::ZERO {
                    return Ok(disabled(if path.last_index() == Some(0) {
                        "breditor/at-document-start"
                    } else {
                        "breditor/unsupported-block-boundary"
                    }));
                }
                let Some(previous) = previous_grapheme_boundary(&source, start)? else {
                    return Ok(disabled("breditor/caret-not-grapheme-boundary"));
                };
                (previous, end, merge("breditor/delete-backward"), Affinity::After)
            }
            Deletion::Forward => {
                if end == source.utf16_len() {
                    let count = state
                        .document()
                        .root()
                        .as_element()
                        .ok_or_else(|| fault("breditor/text-block-source-fault"))?
                        .children()
                        .len();
                    let index = path
                        .last_index()
                        .ok_or_else(|| fault("breditor/text-block-source-fault"))?;
                    return Ok(disabled(
                        if u64::from(index) + 1 == u64::try_from(count).unwrap_or(u64::MAX) {
                            "breditor/at-document-end"
                        } else {
                            "breditor/unsupported-block-boundary"
                        },
                    ));
                }
                let Some(next) = next_grapheme_boundary(&source, end)? else {
                    return Ok(disabled("breditor/caret-not-grapheme-boundary"));
                };
                (start, next, merge("breditor/delete-forward"), Affinity::Before)
            }
            Deletion::Selection => return Err(fault("breditor/text-block-delete-range-fault")),
        }
    } else {
        (start, end, HistoryIntent::Record, Affinity::After)
    };
    let (prefix, _, suffix) = fragment_range_parts(&source, start, end)?;
    let Ok(result) = prefix.try_concat(&suffix) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let operation = TextBlockSplice::try_new(
        TextRange::try_new(path.clone(), start, end)
            .map_err(|_| fault("breditor/text-block-delete-range-fault"))?,
        guard,
        TextFragment::empty(),
    )
    .map_err(|_| fault("breditor/text-block-splice-fault"))?;
    if let Some(decision) = preview_splice(state, &operation)? {
        return Ok(decision);
    }
    // Only directional single-grapheme deletion snaps a newly formed cluster.
    // An explicit range is exact scalar-aligned content, like paragraph deletion.
    let caret = if range.is_collapsed() {
        match direction {
            Deletion::Backward => grapheme_boundary_at_or_after(&result, start)?,
            Deletion::Forward => grapheme_boundary_at_or_before(&result, start)?,
            Deletion::Selection => start,
        }
    } else {
        start
    };
    let selection = collapsed_selection_at_with_affinity(path, &result, caret, affinity)?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockSplice(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        history,
    )))
}

fn merge(group: &'static str) -> HistoryIntent {
    HistoryIntent::Merge { group: QualifiedName::from_known_static(group) }
}
