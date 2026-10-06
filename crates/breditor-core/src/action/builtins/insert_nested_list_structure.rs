//! Cross-block typing with explicit nested container retention.
use super::{
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextInput,
    insert_text::{ReplacementError, concat_result, replacement_fragment},
    nested_list_range_layout::replacement_roots,
    support::{disabled, fault, strict_relocation},
};
use crate::{
    action::{
        ActionDecision, ActionFault, ActionPlan,
        text_position::{TextRangeSelection, point_at_nested_list_fragment_offset},
    },
    document::{NodeRef, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        NestedListTextRange, NestedListTextReplace, NestedListTextReplaceError, Operation,
    },
    position::{Affinity, NodePath},
    selection::RangeSelection,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn capture(
    state: &EditorState,
    path: &NodePath,
) -> Result<(NodeRef, TextFragment), ActionFault> {
    let node =
        state.document().node_at(path).map_err(|_| fault("breditor/nested-text-source-fault"))?;
    let runs = node
        .as_element()
        .ok_or_else(|| fault("breditor/nested-text-source-fault"))?
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/nested-text-source-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok((
        node.clone(),
        TextFragment::try_from_runs(runs)
            .map_err(|_| fault("breditor/nested-text-source-fault"))?,
    ))
}
pub(super) fn evaluate(
    state: &EditorState,
    input: &InsertTextInput,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    let (_, first) = capture(state, range.start().paragraph_path())?;
    let (_, last) = capture(state, range.end().paragraph_path())?;
    let (prefix, _) = first
        .split_at(range.start().offset())
        .map_err(|_| fault("breditor/nested-text-range-fault"))?;
    let (_, suffix) = last
        .split_at(range.end().offset())
        .map_err(|_| fault("breditor/nested-text-range-fault"))?;
    let (_, selected) = super::nested_list_format::capture_selection(state, range)?;
    let formats = selected
        .iter()
        .flat_map(TextFragment::iter)
        .next()
        .map(|run| run.formats().clone())
        .or_else(|| prefix.iter().next_back().map(|run| run.formats().clone()))
        .or_else(|| suffix.iter().next().map(|run| run.formats().clone()))
        .unwrap_or_default();
    let replacement = match replacement_fragment(input, formats) {
        Ok(value) => value,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => return Err(fault("breditor/nested-text-input-fault")),
    };
    plan(
        state,
        range,
        &replacement,
        Affinity::Before,
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
        PendingFormatsUpdate::Set(None),
    )
}

/// Shared exact replacement publication for typing and selected-range deletion.
pub(super) fn plan(
    state: &EditorState,
    range: &TextRangeSelection,
    replacement: &TextFragment,
    affinity: Affinity,
    history: HistoryIntent,
    pending: PendingFormatsUpdate,
) -> Result<ActionDecision, ActionFault> {
    let (node, first) = capture(state, range.start().paragraph_path())?;
    let (_, last) = capture(state, range.end().paragraph_path())?;
    let (prefix, _) = first
        .split_at(range.start().offset())
        .map_err(|_| fault("breditor/nested-text-range-fault"))?;
    let (_, suffix) = last
        .split_at(range.end().offset())
        .map_err(|_| fault("breditor/nested-text-range-fault"))?;
    let inserted_length = replacement.utf16_len();
    let Some(result) = concat_result(&prefix, replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let children =
        replacement.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
    let inserted = vec![NodeRef::element(
        node.as_element()
            .ok_or_else(|| fault("breditor/nested-text-source-fault"))?
            .try_with_children(children)
            .map_err(|_| fault("breditor/nested-text-build-fault"))?,
    )];
    let roots = replacement_roots(state, range, &inserted)?;
    let source_range = NestedListTextRange::try_new(
        range.start().paragraph_path().clone(),
        range.start().offset(),
        range.end().paragraph_path().clone(),
        range.end().offset(),
    )
    .map_err(|_| fault("breditor/nested-text-range-fault"))?;
    let op = NestedListTextReplace::capture_layout(&roots)
        .and_then(|layout| {
            NestedListTextReplace::capture(
                state.context(),
                state.document(),
                source_range,
                inserted,
                layout,
            )
        })
        .and_then(|op| {
            op.apply(state.context(), state.document())?;
            Ok(op)
        });
    let op = match op {
        Ok(op) => op,
        Err(
            NestedListTextReplaceError::Validation(_) | NestedListTextReplaceError::RootChildLimit,
        ) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(_) => return Err(fault("breditor/nested-text-plan-fault")),
    };
    let offset = range
        .start()
        .offset()
        .checked_add(inserted_length.get())
        .map_err(|_| fault("breditor/nested-text-caret-fault"))?;
    let caret = point_at_nested_list_fragment_offset(
        range.start().paragraph_path(),
        &result,
        offset,
        affinity,
    )
    .map_err(|_| fault("breditor/nested-text-caret-fault"))?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::NestedListTextReplace(op)],
        strict_relocation(),
        SelectionUpdate::Set(Some(RangeSelection::new(caret.clone(), caret).into())),
        pending,
        history,
    )))
}
