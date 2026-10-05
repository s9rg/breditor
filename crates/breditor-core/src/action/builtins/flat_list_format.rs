//! Atomic inline formatting across real bare/list paths with shared format policy.
use super::{
    flat_list_format_source::FormatSource,
    flat_list_text_support::capture,
    support::{
        disabled, effective_typing_formats, fault, format_rewrite_source_range,
        format_set_property_fits, fragment_range_parts, require_operation_budget,
        strict_relocation,
    },
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{
        ActionActivation, ActionDecision, ActionEvaluation, ActionFault, ActionPlan,
        ActionStateIndicator,
        text_position::{TextRangeSelection, normalize_flat_list_range_selection},
    },
    document::{NodeRef, TextFragment},
    operation::{FlatListTextRange, FlatListTextReplace, FlatListTextReplaceError, Operation},
    position::TextOffset,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn evaluate(
    state: &EditorState,
    request: &FormatRequest<'_>,
) -> Result<ActionEvaluation, ActionFault> {
    let unavailable = |code| ActionEvaluation::new(disabled(code), request.unavailable());
    if !state.context().schema().supports_flat_list_operations() {
        return Ok(unavailable("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(unavailable("breditor/no-selection"));
    }
    if !request.supported(state) {
        return Ok(unavailable("breditor/unsupported-inline-format"));
    }
    let range = normalize_flat_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if range.is_collapsed() {
        return collapsed(state, &range, request);
    }
    let source = FormatSource::capture(state, &range)?;
    let mut guards = Vec::new();
    let mut selected = Vec::new();
    for block in &source.blocks {
        if block.path < *range.start().paragraph_path()
            || block.path > *range.end().paragraph_path()
        {
            continue;
        }
        let left = if block.path == *range.start().paragraph_path() {
            range.start().offset()
        } else {
            TextOffset::ZERO
        };
        let right = if block.path == *range.end().paragraph_path() {
            range.end().offset()
        } else {
            block.text.utf16_len()
        };
        let (_, fragment, _) = fragment_range_parts(&block.text, left, right)?;
        guards.push(&block.node);
        selected.push(fragment);
    }
    let indicator = request.indicator(&selected)?;
    if !request.valid(state) {
        return Ok(invalid_properties(&indicator));
    }
    let decision = if selected.iter().all(TextFragment::is_empty) {
        disabled("breditor/no-selected-text")
    } else if let Some(decision) = require_operation_budget(state, 1) {
        decision
    } else {
        let rewrite = request.rewrite(indicator.activation());
        let mut replacement = Vec::new();
        let mut changed = false;
        for (node, selected) in guards.iter().zip(&selected) {
            let Some(fragment) = rewrite.fragment(state, selected)? else {
                return Ok(ActionEvaluation::new(
                    disabled("breditor/result-limit-exceeded"),
                    indicator,
                ));
            };
            changed |= &fragment != selected;
            let children =
                fragment.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
            replacement.push(NodeRef::element(
                node.as_element()
                    .ok_or_else(|| fault("breditor/list-format-node-fault"))?
                    .try_with_children(children)
                    .map_err(|_| fault("breditor/list-format-node-fault"))?,
            ));
        }
        if changed {
            let operation_range = FlatListTextRange::try_new(
                range.start().paragraph_path().clone(),
                range.start().offset(),
                range.end().paragraph_path().clone(),
                range.end().offset(),
            )
            .map_err(|_| fault("breditor/list-format-range-fault"))?;
            let op = FlatListTextReplace::try_new(
                source.start,
                operation_range,
                source.roots,
                replacement,
                source.layout,
            );
            plan(state, op)?
        } else {
            disabled("breditor/inline-format-unchanged")
        }
    };
    Ok(ActionEvaluation::new(decision, indicator))
}

fn plan(
    state: &EditorState,
    op: Result<FlatListTextReplace, FlatListTextReplaceError>,
) -> Result<ActionDecision, ActionFault> {
    let op = op.and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let op = match op {
        Ok(op) => op,
        Err(FlatListTextReplaceError::Validation(_) | FlatListTextReplaceError::RootChildLimit) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/list-format-plan-fault")),
    };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextReplace(op)],
        strict_relocation(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}
pub(super) fn invalid_properties(indicator: &ActionStateIndicator) -> ActionEvaluation {
    ActionEvaluation::new(
        disabled("breditor/invalid-inline-format-properties"),
        ActionStateIndicator::new(ActionActivation::Inactive, indicator.value().clone()),
    )
}
fn collapsed(
    state: &EditorState,
    range: &TextRangeSelection,
    request: &FormatRequest<'_>,
) -> Result<ActionEvaluation, ActionFault> {
    let source = capture(state, range.start().paragraph_path())?;
    collapsed_fragment(state, range, request, &source.text)
}

/// Shared format policy only; callers independently admit their structural scope.
pub(super) fn collapsed_fragment(
    state: &EditorState,
    range: &TextRangeSelection,
    request: &FormatRequest<'_>,
    source: &TextFragment,
) -> Result<ActionEvaluation, ActionFault> {
    let affinity = format_rewrite_source_range(state, "breditor/list-format-selection-fault")?
        .focus()
        .affinity();
    let formats = effective_typing_formats(state, source, range.start().offset(), affinity)?;
    let indicator = request.collapsed_indicator(&formats)?;
    if !request.valid(state) {
        return Ok(invalid_properties(&indicator));
    }
    let decision = match request.rewrite(indicator.activation()).formats(state, &formats)? {
        None => disabled("breditor/result-limit-exceeded"),
        Some(replaced) if replaced == formats => disabled("breditor/inline-format-unchanged"),
        Some(replaced) => {
            if format_set_property_fits(
                state,
                &replaced,
                "breditor/list-format-validation-fault",
                "breditor/list-format-property-budget-fault",
            )? {
                ActionDecision::Enabled(ActionPlan::new(
                    vec![],
                    strict_relocation(),
                    SelectionUpdate::Set(state.selection().cloned()),
                    PendingFormatsUpdate::Set(Some(replaced)),
                    HistoryIntent::Record,
                ))
            } else {
                disabled("breditor/result-limit-exceeded")
            }
        }
    };
    Ok(ActionEvaluation::new(decision, indicator))
}
