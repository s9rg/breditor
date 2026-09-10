use crate::{
    action::{
        Action, ActionActivation, ActionActivationContract, ActionDecision, ActionEffects,
        ActionEvaluation, ActionFault, ActionPlan, ActionStateContract, ActionStateDomains,
        ActionStateIndicator, ActionStateSpec, ActionStateValue,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
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

/// Semantic action that toggles one configured property-free inline format.
///
/// A collapsed range changes the explicit pending typing formats without
/// rewriting content. A same-paragraph extended range rewrites the selected
/// formatted text through one exact guarded splice while preserving complete
/// property-bearing peer formats. A cross-paragraph range preserves every
/// paragraph boundary through one same-count
/// [`RootTextReplace`] and applies one activation-derived add/remove decision to
/// all selected text while preserving property-bearing peer formats.
/// Structural-only selections remain mutation-disabled.
///
/// The configured kind is immutable. Evaluation is enabled only when the
/// active compiled schema admits that kind as a property-free inline format;
/// callers cannot use this action to introduce unknown or property-bearing
/// formats.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ToggleInlineFormatAction {
    format_kind: QualifiedName,
}

impl ToggleInlineFormatAction {
    /// Creates an action permanently configured for `format_kind`.
    #[must_use]
    pub const fn new(format_kind: QualifiedName) -> Self {
        Self { format_kind }
    }

    /// Returns the configured inline-format kind.
    #[must_use]
    pub const fn format_kind(&self) -> &QualifiedName {
        &self.format_kind
    }
}

impl Action for ToggleInlineFormatAction {
    type Input = ();

    fn state_spec() -> ActionStateSpec {
        toggle_inline_format_state_spec()
    }

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_toggle_inline_format(state, &self.format_kind)
    }
}

pub(super) fn toggle_inline_format_state_spec() -> ActionStateSpec {
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
    ActionStateSpec::new(
        ActionStateContract::new(ActionActivationContract::Tracked, None),
        ActionEffects::new(reads, may_write),
    )
}

fn evaluate_toggle_inline_format(
    state: &EditorState,
    format_kind: &QualifiedName,
) -> Result<ActionEvaluation, ActionFault> {
    let range = match require_text_splice_range(state)? {
        Ok(range) => range,
        Err(reason) => {
            return Ok(evaluation(ActionDecision::Disabled(reason), ActionActivation::Inactive));
        }
    };
    if !state.context().schema().is_property_free_inline_format(format_kind) {
        return Ok(evaluation(
            disabled("breditor/unsupported-inline-format"),
            ActionActivation::Inactive,
        ));
    }

    if !range.is_same_paragraph()
        && !state.context().schema().supports_paragraph_structure_operations()
    {
        return Ok(evaluation(disabled("breditor/unsupported-schema"), ActionActivation::Inactive));
    }
    if !range.is_same_paragraph() {
        return evaluate_cross_paragraph(state, &range, format_kind);
    }
    if range.is_collapsed() {
        return evaluate_collapsed(state, &range, format_kind);
    }
    evaluate_extended(state, &range, format_kind)
}

fn evaluate_collapsed(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
) -> Result<ActionEvaluation, ActionFault> {
    let fragment = text_splice_paragraph_fragment(state, range.start().paragraph_path())?;
    let focus_affinity =
        format_rewrite_source_range(state, "breditor/toggle-inline-format-selection-fault")?
            .focus()
            .affinity();
    let formats =
        effective_typing_formats(state, &fragment, range.start().offset(), focus_affinity)?;
    let activation = activation_for_formats(&formats, format_kind);
    let Some(toggled) = toggle_formats(
        &formats,
        format_kind,
        !matches!(activation, ActionActivation::Active),
        state.context().limits().max_formats_per_text(),
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    let plan = ActionPlan::new(
        Vec::new(),
        strict_relocation(),
        SelectionUpdate::Set(state.selection().cloned()),
        PendingFormatsUpdate::Set(Some(toggled)),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), activation))
}

fn evaluate_extended(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
) -> Result<ActionEvaluation, ActionFault> {
    let paragraph_path = range.start().paragraph_path();
    let source = text_splice_paragraph_fragment(state, paragraph_path)?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let activation = activation_for_fragment(&selected, format_kind);

    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, activation));
    }
    let add_format = !matches!(activation, ActionActivation::Active);
    let limits = state.context().limits();
    let Some(replacement) = toggle_fragment(
        &selected,
        format_kind,
        add_format,
        limits.max_formats_per_text(),
        limits.max_text_bytes(),
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    let Some(result) = concat_format_rewrite_result(
        &prefix,
        &replacement,
        &suffix,
        "breditor/toggle-inline-format-result-fold-fault",
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result])
        || !property_result_fits(
            state,
            &source,
            &result,
            "breditor/toggle-inline-format-property-validation-fault",
            "breditor/toggle-inline-format-property-budget-fault",
        )?
    {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    }

    let splice_range =
        TextRange::try_new(paragraph_path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/toggle-inline-format-range-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, replacement)
        .map_err(|_| fault("breditor/toggle-inline-format-splice-fault"))?;
    let result_selection = rebuild_format_rewrite_selection(
        state,
        range,
        &result,
        "breditor/toggle-inline-format-selection-order-fault",
        "breditor/toggle-inline-format-selection-fault",
    )?;
    let plan = ActionPlan::new(
        vec![Operation::from(splice)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), activation))
}

fn evaluate_cross_paragraph(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
) -> Result<ActionEvaluation, ActionFault> {
    let source = capture_cross_paragraph_text_source(state, range)
        .map_err(map_toggle_inline_format_cross_source_error)?;
    let mut scan = ActivationScan::default();
    for selected in source.selected_fragments() {
        scan.observe(selected, format_kind);
    }
    let activation = scan.activation();
    if scan.is_empty() {
        return Ok(evaluation(disabled("breditor/no-selected-text"), activation));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, activation));
    }

    let add_format = !matches!(activation, ActionActivation::Active);
    let limits = state.context().limits();
    let mut replacements = Vec::with_capacity(source.guards().len());
    for selected in source.selected_fragments() {
        let Some(replacement) = toggle_fragment(
            selected,
            format_kind,
            add_format,
            limits.max_formats_per_text(),
            limits.max_text_bytes(),
        )?
        else {
            return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
        };
        replacements.push(replacement);
    }

    let Some(results) = cross_format_rewrite_result_fragments(
        &source,
        &replacements,
        "breditor/toggle-inline-format-cross-result-fault",
        "breditor/toggle-inline-format-result-fold-fault",
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    let Some(result_text_bytes) =
        results.iter().try_fold(0_usize, |total, result| total.checked_add(result.text_bytes()))
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    let result_fragments = results.iter().collect::<Vec<_>>();
    if !base_shape_fits(state, source.guards().len(), source.guard_run_count(), &result_fragments)
        || !base_total_text_fits(state, source.guard_text_bytes(), result_text_bytes)
        || !property_fragment_delta_fits(
            state,
            source.guards().iter(),
            results.iter(),
            "breditor/toggle-inline-format-property-validation-fault",
            "breditor/toggle-inline-format-property-budget-fault",
        )?
    {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    }

    let result_selection = rebuild_cross_format_rewrite_selection(
        state,
        range,
        &results,
        "breditor/toggle-inline-format-selection-order-fault",
        "breditor/toggle-inline-format-selection-fault",
    )?;
    let (operation_range, guards) = source.into_range_and_guards();
    let operation = RootTextReplace::try_new(operation_range, guards, replacements)
        .map_err(|_| fault("breditor/toggle-inline-format-root-replace-fault"))?;
    let plan = ActionPlan::new(
        vec![Operation::from(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), activation))
}

fn map_toggle_inline_format_cross_source_error(
    error: CrossParagraphTextSourceError,
) -> ActionFault {
    match error {
        CrossParagraphTextSourceError::Span => {
            fault("breditor/toggle-inline-format-cross-span-fault")
        }
        CrossParagraphTextSourceError::Range => {
            fault("breditor/toggle-inline-format-root-range-fault")
        }
        CrossParagraphTextSourceError::Source => {
            fault("breditor/toggle-inline-format-cross-source-fault")
        }
        CrossParagraphTextSourceError::Paragraph(fault) => fault,
    }
}

fn evaluation(decision: ActionDecision, activation: ActionActivation) -> ActionEvaluation {
    ActionEvaluation::new(
        decision,
        ActionStateIndicator::new(activation, ActionStateValue::Unsupported),
    )
}

fn activation_for_formats(formats: &FormatSet, format_kind: &QualifiedName) -> ActionActivation {
    if formats.get(format_kind).is_some() {
        ActionActivation::Active
    } else {
        ActionActivation::Inactive
    }
}

fn activation_for_fragment(
    fragment: &TextFragment,
    format_kind: &QualifiedName,
) -> ActionActivation {
    let mut scan = ActivationScan::default();
    scan.observe(fragment, format_kind);
    scan.activation()
}

#[derive(Default)]
struct ActivationScan {
    present: bool,
    absent: bool,
}

impl ActivationScan {
    fn observe(&mut self, fragment: &TextFragment, format_kind: &QualifiedName) {
        for run in fragment {
            if run.formats().get(format_kind).is_some() {
                self.present = true;
            } else {
                self.absent = true;
            }
        }
    }

    const fn activation(&self) -> ActionActivation {
        match (self.present, self.absent) {
            (true, true) => ActionActivation::Mixed,
            (true, false) => ActionActivation::Active,
            (false, true | false) => ActionActivation::Inactive,
        }
    }

    const fn is_empty(&self) -> bool {
        !self.present && !self.absent
    }
}

fn toggle_fragment(
    fragment: &TextFragment,
    format_kind: &QualifiedName,
    add: bool,
    maximum_formats: usize,
    maximum_text_bytes: usize,
) -> Result<Option<TextFragment>, ActionFault> {
    let mut result = Vec::with_capacity(fragment.len());
    let mut group_text = String::new();
    let mut group_utf16 = 0_u64;
    let mut group_formats: Option<FormatSet> = None;
    for run in fragment {
        let Some(formats) = toggle_formats(run.formats(), format_kind, add, maximum_formats)?
        else {
            return Ok(None);
        };
        if group_formats.as_ref().is_some_and(|current| current != &formats) {
            let current = group_formats
                .take()
                .ok_or_else(|| fault("breditor/toggle-inline-format-group-fault"))?;
            result.push(
                TextRun::try_new(std::mem::take(&mut group_text), current)
                    .map_err(|_| fault("breditor/toggle-inline-format-run-fault"))?,
            );
            group_utf16 = 0;
        }
        let Some(group_bytes) = group_text.len().checked_add(run.text().len()) else {
            return Ok(None);
        };
        if group_bytes > maximum_text_bytes {
            return Ok(None);
        }
        let Some(next_utf16) = group_utf16.checked_add(u64::from(run.utf16_len())) else {
            return Ok(None);
        };
        if next_utf16 > u64::from(u32::MAX) {
            return Ok(None);
        }
        group_text.push_str(run.text());
        group_utf16 = next_utf16;
        group_formats = Some(formats);
    }
    if let Some(formats) = group_formats {
        result.push(
            TextRun::try_new(group_text, formats)
                .map_err(|_| fault("breditor/toggle-inline-format-run-fault"))?,
        );
    }
    TextFragment::try_from_runs(result)
        .map(Some)
        .map_err(|_| fault("breditor/toggle-inline-format-fold-fault"))
}

fn toggle_formats(
    formats: &FormatSet,
    format_kind: &QualifiedName,
    add: bool,
    maximum_formats: usize,
) -> Result<Option<FormatSet>, ActionFault> {
    let has_format = formats.get(format_kind).is_some();
    let result_len = match (add, has_format) {
        (true, false) => formats.len().checked_add(1),
        (false, true) => formats.len().checked_sub(1),
        (true, true) | (false, false) => Some(formats.len()),
    };
    let Some(result_len) = result_len else {
        return Err(fault("breditor/toggle-inline-format-format-count-fault"));
    };
    if result_len > maximum_formats {
        return Ok(None);
    }
    if add == has_format {
        return Ok(Some(formats.clone()));
    }

    let mut toggled = Vec::with_capacity(result_len);
    let mut inserted = false;
    for format in formats {
        if format.kind() == format_kind {
            continue;
        }
        if add && !inserted && format.kind() > format_kind {
            toggled.push(property_free_format(format_kind));
            inserted = true;
        }
        toggled.push(format.clone());
    }
    if add && !inserted {
        toggled.push(property_free_format(format_kind));
    }
    FormatSet::try_from_formats(toggled)
        .map(Some)
        .map_err(|_| fault("breditor/toggle-inline-format-format-set-fault"))
}

fn property_free_format(format_kind: &QualifiedName) -> Format {
    Format::new(format_kind.clone(), PropertyMap::default())
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        document::{Format, FormatSet, PropertyMap},
        identity::QualifiedName,
    };

    use super::{ToggleInlineFormatAction, toggle_formats};

    fn property_free(kind: QualifiedName) -> Format {
        Format::new(kind, PropertyMap::default())
    }

    #[test]
    fn configured_kind_is_owned_and_observable() -> Result<(), Box<dyn Error>> {
        let kind = QualifiedName::try_new("example/highlight")?;
        let action = ToggleInlineFormatAction::new(kind.clone());

        assert_eq!(action.format_kind(), &kind);
        Ok(())
    }

    #[test]
    fn toggle_preserves_canonical_order_and_unrelated_formats() -> Result<(), Box<dyn Error>> {
        let strong = QualifiedName::try_new("breditor/strong")?;
        let highlight = QualifiedName::try_new("example/highlight")?;
        let underline = QualifiedName::try_new("example/underline")?;
        let source = FormatSet::try_from_formats(vec![
            property_free(strong.clone()),
            property_free(underline.clone()),
        ])?;

        let added = toggle_formats(&source, &highlight, true, 3)?.ok_or("format limit")?;
        let kinds = added.iter().map(|format| format.kind().as_str()).collect::<Vec<_>>();
        assert_eq!(kinds, ["breditor/strong", "example/highlight", "example/underline"]);

        let removed = toggle_formats(&added, &highlight, false, 3)?.ok_or("format limit")?;
        assert_eq!(removed, source);
        Ok(())
    }

    #[test]
    fn adding_beyond_format_limit_is_an_expected_capacity_result() -> Result<(), Box<dyn Error>> {
        let strong = QualifiedName::try_new("breditor/strong")?;
        let highlight = QualifiedName::try_new("example/highlight")?;
        let source = FormatSet::try_from_formats(vec![property_free(strong)])?;

        assert!(toggle_formats(&source, &highlight, true, 1)?.is_none());
        Ok(())
    }
}
