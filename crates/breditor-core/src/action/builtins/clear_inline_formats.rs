use crate::{
    action::{
        Action, ActionDecision, ActionEffects, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateContract, ActionStateDomains, ActionStateSpec,
    },
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, RootTextReplace, TextRange, TextSplice},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::TextRangeSelection,
    support::{
        CrossParagraphTextSourceError, base_shape_fits, base_total_text_fits,
        capture_cross_paragraph_text_source, concat_format_rewrite_result,
        cross_format_rewrite_result_fragments, disabled, effective_typing_formats, fault,
        format_rewrite_source_range, fragment_range_parts, property_fragment_delta_fits,
        property_result_fits, rebuild_cross_format_rewrite_selection,
        rebuild_format_rewrite_selection, require_operation_budget, require_text_splice_range,
        strict_relocation, text_splice_paragraph_fragment,
    },
};

/// Stable qualified name of the built-in clear-inline-formats action.
pub const CLEAR_INLINE_FORMATS_ACTION_NAME: &str = "breditor/clear-inline-formats";

/// Core-owned action that removes every inline format from the selected text.
///
/// A collapsed range changes only the effective pending typing set. An
/// extended same-paragraph range emits one guarded [`TextSplice`], while a
/// cross-paragraph range emits one same-count guarded [`RootTextReplace`].
/// Text, paragraph boundaries, selection direction, and endpoint affinities
/// remain semantic invariants. No format-specific identity is enumerated: each
/// selected run receives the canonical empty [`FormatSet`].
#[derive(Clone, Copy, Debug, Default)]
pub struct ClearInlineFormatsAction;

/// Returns the stable built-in clear-inline-formats action identity.
#[must_use]
pub fn clear_inline_formats_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        CLEAR_INLINE_FORMATS_ACTION_NAME,
    ))
}

impl Action for ClearInlineFormatsAction {
    type Input = ();

    fn state_spec() -> ActionStateSpec {
        clear_inline_formats_state_spec()
    }

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_clear_inline_formats(state)
    }
}

pub(super) fn clear_inline_formats_state_spec() -> ActionStateSpec {
    let reads = ActionStateDomains::DOCUMENT
        | ActionStateDomains::SELECTION
        | ActionStateDomains::PENDING_FORMATS
        | ActionStateDomains::CONTEXT
        | ActionStateDomains::SNAPSHOT;
    let may_write = ActionStateDomains::DOCUMENT
        | ActionStateDomains::SELECTION
        | ActionStateDomains::PENDING_FORMATS
        | ActionStateDomains::HISTORY
        | ActionStateDomains::SNAPSHOT;
    ActionStateSpec::new(ActionStateContract::stateless(), ActionEffects::new(reads, may_write))
}

fn evaluate_clear_inline_formats(state: &EditorState) -> Result<ActionEvaluation, ActionFault> {
    let range = match require_text_splice_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionEvaluation::stateless(ActionDecision::Disabled(reason))),
    };
    if !range.is_same_paragraph()
        && !state.context().schema().supports_paragraph_structure_operations()
    {
        return Ok(ActionEvaluation::stateless(disabled("breditor/unsupported-schema")));
    }
    if range.is_collapsed() {
        return evaluate_collapsed(state, &range);
    }
    if range.is_same_paragraph() {
        return evaluate_same_paragraph(state, &range);
    }
    evaluate_cross_paragraph(state, &range)
}

fn evaluate_collapsed(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionEvaluation, ActionFault> {
    let fragment = text_splice_paragraph_fragment(state, range.start().paragraph_path())?;
    let focus_affinity =
        format_rewrite_source_range(state, "breditor/clear-inline-formats-selection-fault")?
            .focus()
            .affinity();
    let formats =
        effective_typing_formats(state, &fragment, range.start().offset(), focus_affinity)?;
    if formats.is_empty() {
        return Ok(ActionEvaluation::stateless(disabled("breditor/inline-format-unchanged")));
    }
    Ok(ActionEvaluation::stateless(ActionDecision::Enabled(ActionPlan::new(
        Vec::new(),
        strict_relocation(),
        SelectionUpdate::Set(state.selection().cloned()),
        PendingFormatsUpdate::Set(Some(FormatSet::default())),
        HistoryIntent::Record,
    ))))
}

fn evaluate_same_paragraph(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionEvaluation, ActionFault> {
    let paragraph_path = range.start().paragraph_path();
    let source = text_splice_paragraph_fragment(state, paragraph_path)?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    if selected.is_empty() {
        return Ok(ActionEvaluation::stateless(disabled("breditor/no-selected-text")));
    }
    if !fragment_has_formats(&selected) {
        return Ok(ActionEvaluation::stateless(disabled("breditor/inline-format-unchanged")));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(ActionEvaluation::stateless(decision));
    }

    let Some(replacement) = clear_fragment(&selected, state.context().limits().max_text_bytes())?
    else {
        return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
    };
    let Some(result) = concat_format_rewrite_result(
        &prefix,
        &replacement,
        &suffix,
        "breditor/clear-inline-formats-result-fold-fault",
    )?
    else {
        return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result])
        || !property_result_fits(
            state,
            &source,
            &result,
            "breditor/clear-inline-formats-property-validation-fault",
            "breditor/clear-inline-formats-property-budget-fault",
        )?
    {
        return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
    }

    let splice_range =
        TextRange::try_new(paragraph_path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/clear-inline-formats-range-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, replacement)
        .map_err(|_| fault("breditor/clear-inline-formats-splice-fault"))?;
    let result_selection = rebuild_format_rewrite_selection(
        state,
        range,
        &result,
        "breditor/clear-inline-formats-selection-order-fault",
        "breditor/clear-inline-formats-selection-fault",
    )?;
    Ok(ActionEvaluation::stateless(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::from(splice)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    ))))
}

fn evaluate_cross_paragraph(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionEvaluation, ActionFault> {
    let source = capture_cross_paragraph_text_source(state, range)
        .map_err(map_cross_paragraph_source_error)?;
    if !source.selected_fragments().any(|fragment| !fragment.is_empty()) {
        return Ok(ActionEvaluation::stateless(disabled("breditor/no-selected-text")));
    }
    if !source.selected_fragments().any(fragment_has_formats) {
        return Ok(ActionEvaluation::stateless(disabled("breditor/inline-format-unchanged")));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(ActionEvaluation::stateless(decision));
    }

    let maximum_text_bytes = state.context().limits().max_text_bytes();
    let mut replacements = Vec::with_capacity(source.guards().len());
    for selected in source.selected_fragments() {
        let Some(replacement) = clear_fragment(selected, maximum_text_bytes)? else {
            return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
        };
        replacements.push(replacement);
    }
    let Some(results) = cross_format_rewrite_result_fragments(
        &source,
        &replacements,
        "breditor/clear-inline-formats-cross-result-fault",
        "breditor/clear-inline-formats-result-fold-fault",
    )?
    else {
        return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
    };
    let Some(result_text_bytes) =
        results.iter().try_fold(0_usize, |total, result| total.checked_add(result.text_bytes()))
    else {
        return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
    };
    let result_fragments = results.iter().collect::<Vec<_>>();
    if !base_shape_fits(state, source.guards().len(), source.guard_run_count(), &result_fragments)
        || !base_total_text_fits(state, source.guard_text_bytes(), result_text_bytes)
        || !property_fragment_delta_fits(
            state,
            source.guards().iter(),
            results.iter(),
            "breditor/clear-inline-formats-property-validation-fault",
            "breditor/clear-inline-formats-property-budget-fault",
        )?
    {
        return Ok(ActionEvaluation::stateless(disabled("breditor/result-limit-exceeded")));
    }

    let result_selection = rebuild_cross_format_rewrite_selection(
        state,
        range,
        &results,
        "breditor/clear-inline-formats-selection-order-fault",
        "breditor/clear-inline-formats-selection-fault",
    )?;
    let (operation_range, guards) = source.into_range_and_guards();
    let operation = RootTextReplace::try_new(operation_range, guards, replacements)
        .map_err(|_| fault("breditor/clear-inline-formats-root-replace-fault"))?;
    Ok(ActionEvaluation::stateless(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::from(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    ))))
}

fn clear_fragment(
    fragment: &TextFragment,
    maximum_text_bytes: usize,
) -> Result<Option<TextFragment>, ActionFault> {
    if fragment.is_empty() {
        return Ok(Some(TextFragment::empty()));
    }
    if fragment.text_bytes() > maximum_text_bytes {
        return Ok(None);
    }
    if fragment.utf16_len().get() > u64::from(u32::MAX) {
        return Ok(None);
    }
    let mut text = String::with_capacity(fragment.text_bytes());
    for run in fragment {
        text.push_str(run.text());
    }
    TextRun::try_new(text, FormatSet::default())
        .map(TextFragment::from)
        .map(Some)
        .map_err(|_| fault("breditor/clear-inline-formats-run-fault"))
}

fn fragment_has_formats(fragment: &TextFragment) -> bool {
    fragment.iter().any(|run| !run.formats().is_empty())
}

fn map_cross_paragraph_source_error(error: CrossParagraphTextSourceError) -> ActionFault {
    match error {
        CrossParagraphTextSourceError::Span => {
            fault("breditor/clear-inline-formats-cross-span-fault")
        }
        CrossParagraphTextSourceError::Range => {
            fault("breditor/clear-inline-formats-root-range-fault")
        }
        CrossParagraphTextSourceError::Source => {
            fault("breditor/clear-inline-formats-cross-source-fault")
        }
        CrossParagraphTextSourceError::Paragraph(fault) => fault,
    }
}

#[cfg(test)]
mod tests {
    use crate::action::{Action, ActionActivationContract};

    use super::{
        CLEAR_INLINE_FORMATS_ACTION_NAME, ClearInlineFormatsAction, clear_inline_formats_action_id,
    };

    #[test]
    fn public_identity_and_stateless_contract_are_exact() {
        assert_eq!(clear_inline_formats_action_id().as_str(), CLEAR_INLINE_FORMATS_ACTION_NAME,);
        let spec = ClearInlineFormatsAction::state_spec();
        assert_eq!(spec.contract().activation_contract(), ActionActivationContract::Stateless,);
        assert!(spec.contract().value_contract().is_none());
    }
}
