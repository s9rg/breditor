//! One atomic format rewrite across headings and paragraphs, with no transient
//! per-block budget overshoot. Pure run rewrites are shared with legacy actions.
use super::{
    super::text_position::TextRangeSelection,
    delete_text_block_structure::root_range,
    support::{
        disabled, effective_typing_formats, fault, format_rewrite_source_range,
        format_set_property_fits, fragment_range_parts, require_operation_budget,
        require_text_block_range, strict_relocation,
    },
    text_block_format_request::{FormatRequest, FormatRewrite},
    text_block_support::text_block_source,
};
use crate::{
    action::{
        ActionActivation, ActionDecision, ActionEvaluation, ActionFault, ActionPlan,
        ActionStateIndicator,
    },
    document::{NodeRef, TextFragment},
    operation::{Operation, RootTextRange, TextBlockReplace, TextBlockReplaceError},
    position::{NodePath, TextOffset},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn evaluate(
    state: &EditorState,
    request: &FormatRequest<'_>,
) -> Result<ActionEvaluation, ActionFault> {
    let range = match require_text_block_range(state)? {
        Ok(range) => range,
        Err(reason) => {
            return Ok(ActionEvaluation::new(
                ActionDecision::Disabled(reason),
                request.unavailable(),
            ));
        }
    };
    if !request.supported(state) {
        return Ok(ActionEvaluation::new(
            disabled("breditor/unsupported-inline-format"),
            request.unavailable(),
        ));
    }
    if range.is_collapsed() {
        return collapsed(state, &range, request);
    }
    let source = FormatSource::capture(state, &range)?;
    let indicator = request.indicator(&source.selected)?;
    if !request.valid(state) {
        return Ok(invalid_properties(&indicator));
    }
    let decision = if source.selected.iter().all(TextFragment::is_empty) {
        disabled("breditor/no-selected-text")
    } else if let Some(decision) = require_operation_budget(state, 1) {
        decision
    } else {
        extended(state, &source, &request.rewrite(indicator.activation()))?
    };
    Ok(ActionEvaluation::new(decision, indicator))
}

fn invalid_properties(indicator: &ActionStateIndicator) -> ActionEvaluation {
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
    let (_, source) = text_block_source(state, range.start().paragraph_path())?;
    let affinity =
        format_rewrite_source_range(state, "breditor/text-block-format-selection-fault")?
            .focus()
            .affinity();
    let formats = effective_typing_formats(state, &source, range.start().offset(), affinity)?;
    let indicator = request.collapsed_indicator(&formats)?;
    if !request.valid(state) {
        return Ok(invalid_properties(&indicator));
    }
    let replacement = request.rewrite(indicator.activation()).formats(state, &formats)?;
    let decision = match replacement {
        None => disabled("breditor/result-limit-exceeded"),
        Some(replaced) if replaced == formats => disabled("breditor/inline-format-unchanged"),
        Some(replaced) => {
            if format_set_property_fits(
                state,
                &replaced,
                "breditor/text-block-format-validation-fault",
                "breditor/text-block-format-property-budget-fault",
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

struct FormatSource {
    range: RootTextRange,
    guards: Vec<NodeRef>,
    selected: Vec<TextFragment>,
}

impl FormatSource {
    fn capture(state: &EditorState, range: &TextRangeSelection) -> Result<Self, ActionFault> {
        let range = root_range(
            range.start().paragraph_path(),
            range.start().offset(),
            range.end().paragraph_path(),
            range.end().offset(),
        )?;
        let start = range.start().paragraph_index();
        let end = range.end().paragraph_index();
        let mut guards = Vec::new();
        let mut selected = Vec::new();
        // The normalized selection has already resolved against this document.
        for index in start..=end {
            let path = NodePath::try_from_indices(vec![index])
                .map_err(|_| fault("breditor/text-block-format-path-fault"))?;
            let (guard, source) = text_block_source(state, &path)?;
            let left = if index == start { range.start().offset() } else { TextOffset::ZERO };
            let right = if index == end { range.end().offset() } else { source.utf16_len() };
            let (_, fragment, _) = fragment_range_parts(&source, left, right)?;
            guards.push(guard);
            selected.push(fragment);
        }
        Ok(Self { range, guards, selected })
    }
}

fn extended(
    state: &EditorState,
    source: &FormatSource,
    rewrite: &FormatRewrite<'_>,
) -> Result<ActionDecision, ActionFault> {
    let mut replacement = Vec::with_capacity(source.guards.len());
    let mut changed = false;
    for (guard, selected) in source.guards.iter().zip(&source.selected) {
        let Some(fragment) = rewrite.fragment(state, selected)? else {
            return Ok(disabled("breditor/result-limit-exceeded"));
        };
        changed |= &fragment != selected;
        let children =
            fragment.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
        let node = guard
            .as_element()
            .ok_or_else(|| fault("breditor/text-block-format-node-fault"))?
            .try_with_children(children)
            .map_err(|_| fault("breditor/text-block-format-node-fault"))?;
        replacement.push(NodeRef::element(node));
    }
    if !changed {
        return Ok(disabled("breditor/inline-format-unchanged"));
    }
    let operation =
        TextBlockReplace::try_new(source.range.clone(), source.guards.clone(), replacement)
            .and_then(|operation| {
                operation.apply(state.context(), state.document())?;
                Ok(operation)
            });
    let operation = match operation {
        Ok(operation) => operation,
        Err(TextBlockReplaceError::RootChildLimit | TextBlockReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/text-block-format-plan-fault")),
    };
    // The primitive's text-identity map preserves all selection/bookmark offsets
    // through run splitting/merging; no endpoint-loss policy is needed.
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}
