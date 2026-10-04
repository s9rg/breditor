//! Cross-block type-over, retaining the spatial start block kind.
use super::{
    super::text_position::TextRangeSelection,
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextInput,
    delete_text_block_structure::root_range,
    insert_text::{ReplacementError, concat_result, replacement_fragment},
    support::{collapsed_selection_at_with_affinity, disabled, fault, strict_relocation},
    text_block_support::text_block_source,
};
use crate::{
    action::{ActionDecision, ActionFault, ActionPlan},
    document::{FormatSet, NodeRef},
    identity::QualifiedName,
    operation::{Operation, TextBlockReplace, TextBlockReplaceError},
    position::Affinity,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn evaluate(
    state: &EditorState,
    input: &InsertTextInput,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    let path = range.start().paragraph_path();
    let (first, source) = text_block_source(state, path)?;
    let (_, tail) = text_block_source(state, range.end().paragraph_path())?;
    let (prefix, selected_first) = source
        .split_at(range.start().offset())
        .map_err(|_| fault("breditor/text-block-type-over-range-fault"))?;
    let (selected_last, suffix) = tail
        .split_at(range.end().offset())
        .map_err(|_| fault("breditor/text-block-type-over-range-fault"))?;
    let first_formats = match selected_first.iter().next() {
        Some(run) => Some(run.formats().clone()),
        None => first_middle_formats(state, range)?,
    };
    let formats = first_formats
        .or_else(|| selected_last.iter().next().map(|run| run.formats().clone()))
        .or_else(|| prefix.iter().next_back().map(|run| run.formats().clone()))
        .or_else(|| suffix.iter().next().map(|run| run.formats().clone()))
        .unwrap_or_default();
    let replacement = match replacement_fragment(input, formats) {
        Ok(fragment) => fragment,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => {
            return Err(fault("breditor/insert-text-input-invariant-fault"));
        }
    };
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let children =
        replacement.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
    let inserted = first
        .as_element()
        .ok_or_else(|| fault("breditor/text-block-source-fault"))?
        .try_with_children(children)
        .map_err(|_| fault("breditor/text-block-type-over-node-fault"))?;
    let operation_range = root_range(
        path,
        range.start().offset(),
        range.end().paragraph_path(),
        range.end().offset(),
    )?;
    let operation = TextBlockReplace::capture(
        state.context(),
        state.document(),
        operation_range,
        vec![NodeRef::element(inserted)],
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
        Err(_) => return Err(fault("breditor/text-block-type-over-plan-fault")),
    };
    let caret = range
        .start()
        .offset()
        .checked_add(u64::from(input.utf16_len()))
        .map_err(|_| fault("breditor/insert-text-caret-offset-fault"))?;
    let selection = collapsed_selection_at_with_affinity(path, &result, caret, Affinity::Before)?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
    )))
}

/// Empty boundary fragments must not hide selected text in a middle block.
pub(super) fn first_middle_formats(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<Option<FormatSet>, ActionFault> {
    let index = |path: &crate::position::NodePath| {
        path.last_index()
            .and_then(|n| usize::try_from(n).ok())
            .ok_or_else(|| fault("breditor/text-block-source-fault"))
    };
    let start = index(range.start().paragraph_path())?;
    let end = index(range.end().paragraph_path())?;
    let count = end
        .checked_sub(start)
        .and_then(|n| n.checked_sub(1))
        .ok_or_else(|| fault("breditor/text-block-type-over-range-fault"))?;
    let root = state
        .document()
        .root()
        .as_element()
        .ok_or_else(|| fault("breditor/text-block-source-fault"))?;
    Ok(root
        .children()
        .iter()
        .skip(start + 1)
        .take(count)
        .filter_map(NodeRef::as_element)
        .flat_map(|node| node.children().iter())
        .find_map(NodeRef::as_text)
        .map(|text| text.formats().clone()))
}
