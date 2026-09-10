use crate::{
    action::{
        Action, ActionActivation, ActionActivationContract, ActionDecision, ActionEffects,
        ActionEvaluation, ActionFault, ActionPlan, ActionStateContract, ActionStateDomains,
        ActionStateIndicator, ActionStateSpec, ActionStateValue,
    },
    document::{Format, FormatSet, TextFragment, TextFragmentError, TextRun},
    identity::QualifiedName,
    operation::{Operation, RootTextReplace, TextRange, TextSplice},
    selection::{RangeOrder, RangeSelection, Selection},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::{TextRangeSelection, point_at_fragment_offset},
    SetInlineFormatInput,
    inline_format_properties_state::{
        InlineFormatPropertiesScan, inline_format_properties_state_contract,
        properties_state_for_formats,
    },
    support::{
        CrossParagraphTextSource, CrossParagraphTextSourceError, base_shape_fits,
        base_total_text_fits, capture_cross_paragraph_text_source, disabled, fault,
        format_set_property_fits, fragment_range_parts, property_fragment_delta_fits,
        property_result_fits, require_operation_budget, require_text_splice_range,
        strict_relocation, text_splice_paragraph_fragment,
    },
};

/// Semantic action that sets or removes one registration-configured inline format.
///
/// The action identity belongs to its [`crate::action::ActionRegistration`];
/// this handler owns only the immutable inline-format kind. That makes the
/// behavior reusable for links, colors, annotations, and future extension
/// formats without assigning any of those concepts a core identity.
///
/// A non-collapsed selection in one direct-root paragraph is rewritten through
/// one exact guarded [`TextSplice`]. A cross-paragraph range preserves every
/// paragraph boundary through one same-count [`RootTextReplace`]. A collapsed
/// range updates the exact pending typing formats without rewriting the
/// document. `Set` replaces the configured format's complete property map on
/// all selected text, while `Remove` removes that format regardless of its
/// current properties. Structural-only selections remain mutation-disabled.
///
/// Every requested format instance is admitted through the schema's shared
/// validator. Result node, text, property-value, and property-string budgets
/// are checked before an action plan is published. Durable operation codecs
/// remain an independent versioned boundary: V3 preserves the resulting
/// property-bearing operation, while V1/V2 reject it rather than losing data.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetInlineFormatAction {
    format_kind: QualifiedName,
}

impl SetInlineFormatAction {
    /// Creates a handler permanently configured for `format_kind`.
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

impl Action for SetInlineFormatAction {
    type Input = SetInlineFormatInput;

    fn state_spec() -> ActionStateSpec {
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
            ActionStateContract::new(
                ActionActivationContract::Tracked,
                Some(inline_format_properties_state_contract()),
            ),
            ActionEffects::new(reads, may_write),
        )
    }

    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_set_inline_format(state, &self.format_kind, input)
    }
}

fn evaluate_set_inline_format(
    state: &EditorState,
    format_kind: &QualifiedName,
    input: &SetInlineFormatInput,
) -> Result<ActionEvaluation, ActionFault> {
    let range = match require_text_splice_range(state)? {
        Ok(range) => range,
        Err(reason) => {
            return Ok(evaluation(ActionDecision::Disabled(reason), unavailable_indicator()));
        }
    };
    if !state.context().schema().allows_text_format(format_kind) {
        return Ok(evaluation(
            disabled("breditor/unsupported-inline-format"),
            unavailable_indicator(),
        ));
    }

    let desired = match input {
        SetInlineFormatInput::Set(properties) => {
            let format = Format::new(format_kind.clone(), properties.clone());
            if state
                .context()
                .schema()
                .validate_inline_format_instance(state.context().limits(), &format)
                .is_err()
            {
                return Ok(evaluation(
                    disabled("breditor/invalid-inline-format-properties"),
                    ActionStateIndicator::new(
                        ActionActivation::Inactive,
                        state_value_for_range(state, &range, format_kind)?,
                    ),
                ));
            }
            Some(format)
        }
        SetInlineFormatInput::Remove => None,
    };

    if !range.is_same_paragraph()
        && !state.context().schema().supports_paragraph_structure_operations()
    {
        return Ok(evaluation(disabled("breditor/unsupported-schema"), unavailable_indicator()));
    }
    if !range.is_same_paragraph() {
        return evaluate_cross_paragraph(state, &range, format_kind, desired.as_ref());
    }
    if range.is_collapsed() {
        return evaluate_collapsed(state, &range, format_kind, desired.as_ref());
    }
    evaluate_extended(state, &range, format_kind, desired.as_ref())
}

fn evaluate_collapsed(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
) -> Result<ActionEvaluation, ActionFault> {
    let source = text_splice_paragraph_fragment(state, range.start().paragraph_path())?;
    let focus_affinity = source_range(state)?.focus().affinity();
    let formats = super::support::effective_typing_formats(
        state,
        &source,
        range.start().offset(),
        focus_affinity,
    )?;
    let indicator = indicator_for_formats(&formats, format_kind, desired)?;
    let Some(replaced) = replace_format(
        &formats,
        format_kind,
        desired,
        state.context().limits().max_formats_per_text(),
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    };
    if replaced == formats {
        return Ok(evaluation(disabled("breditor/inline-format-unchanged"), indicator));
    }
    if !format_set_property_fits(
        state,
        &replaced,
        "breditor/set-inline-format-validation-fault",
        "breditor/set-inline-format-property-budget-fault",
    )? {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    }
    let plan = ActionPlan::new(
        Vec::new(),
        strict_relocation(),
        SelectionUpdate::Set(state.selection().cloned()),
        PendingFormatsUpdate::Set(Some(replaced)),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), indicator))
}

fn evaluate_extended(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
) -> Result<ActionEvaluation, ActionFault> {
    let paragraph_path = range.start().paragraph_path();
    let source = text_splice_paragraph_fragment(state, paragraph_path)?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let indicator = indicator_for_fragment(&selected, format_kind, desired)?;

    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, indicator));
    }
    let limits = state.context().limits();
    let Some(replacement) = replace_fragment_format(
        &selected,
        format_kind,
        desired,
        limits.max_formats_per_text(),
        limits.max_text_bytes(),
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    };
    if replacement == selected {
        return Ok(evaluation(disabled("breditor/inline-format-unchanged"), indicator));
    }
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result])
        || !property_result_fits(
            state,
            &source,
            &result,
            "breditor/set-inline-format-validation-fault",
            "breditor/set-inline-format-property-budget-fault",
        )?
    {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    }

    let splice_range =
        TextRange::try_new(paragraph_path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/set-inline-format-range-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, replacement)
        .map_err(|_| fault("breditor/set-inline-format-splice-fault"))?;
    let result_selection = rebuild_selection(state, range, &result)?;
    let plan = ActionPlan::new(
        vec![Operation::from(splice)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), indicator))
}

fn evaluate_cross_paragraph(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
) -> Result<ActionEvaluation, ActionFault> {
    let source = capture_cross_paragraph_text_source(state, range)
        .map_err(map_set_inline_format_cross_source_error)?;
    let mut scan = SetInlineFormatScan::default();
    for selected in source.selected_fragments() {
        scan.observe_fragment(selected, format_kind, desired);
    }
    let activation = scan.activation();
    let is_empty = scan.is_empty();
    let indicator = scan.finish()?;
    if is_empty {
        return Ok(evaluation(disabled("breditor/no-selected-text"), indicator));
    }
    let is_exact_noop = match desired {
        Some(_) => activation == ActionActivation::Active,
        None => activation == ActionActivation::Inactive,
    };
    if is_exact_noop {
        return Ok(evaluation(disabled("breditor/inline-format-unchanged"), indicator));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, indicator));
    }

    let limits = state.context().limits();
    let mut replacements = Vec::with_capacity(source.guards().len());
    let mut changed = false;
    for selected in source.selected_fragments() {
        let Some(replacement) = replace_fragment_format(
            selected,
            format_kind,
            desired,
            limits.max_formats_per_text(),
            limits.max_text_bytes(),
        )?
        else {
            return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
        };
        changed |= replacement != *selected;
        replacements.push(replacement);
    }
    if !changed {
        return Ok(evaluation(disabled("breditor/inline-format-unchanged"), indicator));
    }

    let Some(results) = cross_result_fragments(&source, &replacements)? else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    };
    let Some(result_text_bytes) =
        results.iter().try_fold(0_usize, |total, result| total.checked_add(result.text_bytes()))
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    };
    let result_fragments = results.iter().collect::<Vec<_>>();
    if !base_shape_fits(state, source.guards().len(), source.guard_run_count(), &result_fragments)
        || !base_total_text_fits(state, source.guard_text_bytes(), result_text_bytes)
        || !property_fragment_delta_fits(
            state,
            source.guards().iter(),
            results.iter(),
            "breditor/set-inline-format-validation-fault",
            "breditor/set-inline-format-property-budget-fault",
        )?
    {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), indicator));
    }

    let result_selection = rebuild_cross_selection(state, range, &results)?;
    let (operation_range, guards) = source.into_range_and_guards();
    let operation = RootTextReplace::try_new(operation_range, guards, replacements)
        .map_err(|_| fault("breditor/set-inline-format-root-replace-fault"))?;
    let plan = ActionPlan::new(
        vec![Operation::from(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), indicator))
}

fn map_set_inline_format_cross_source_error(error: CrossParagraphTextSourceError) -> ActionFault {
    match error {
        CrossParagraphTextSourceError::Span => fault("breditor/set-inline-format-cross-span-fault"),
        CrossParagraphTextSourceError::Range => {
            fault("breditor/set-inline-format-root-range-fault")
        }
        CrossParagraphTextSourceError::Source => {
            fault("breditor/set-inline-format-cross-source-fault")
        }
        CrossParagraphTextSourceError::Paragraph(fault) => fault,
    }
}

fn evaluation(decision: ActionDecision, indicator: ActionStateIndicator) -> ActionEvaluation {
    ActionEvaluation::new(decision, indicator)
}

fn unavailable_indicator() -> ActionStateIndicator {
    ActionStateIndicator::new(
        ActionActivation::Inactive,
        ActionStateValue::unset(inline_format_properties_state_contract()),
    )
}

fn indicator_for_fragment(
    fragment: &TextFragment,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
) -> Result<ActionStateIndicator, ActionFault> {
    let mut scan = SetInlineFormatScan::default();
    scan.observe_fragment(fragment, format_kind, desired);
    scan.finish()
}

fn indicator_for_formats(
    formats: &FormatSet,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
) -> Result<ActionStateIndicator, ActionFault> {
    Ok(ActionStateIndicator::new(
        activation_for_formats(formats, format_kind, desired),
        properties_state_for_formats(formats, format_kind)
            .map_err(|_| fault("breditor/set-inline-format-state-value-fault"))?,
    ))
}

#[derive(Default)]
struct SetInlineFormatScan {
    matching: bool,
    other: bool,
    properties: InlineFormatPropertiesScan,
}

impl SetInlineFormatScan {
    fn observe_fragment(
        &mut self,
        fragment: &TextFragment,
        format_kind: &QualifiedName,
        desired: Option<&Format>,
    ) {
        for run in fragment {
            let current = run.formats().get(format_kind);
            let is_match = match desired {
                Some(desired) => current == Some(desired),
                None => current.is_some(),
            };
            self.matching |= is_match;
            self.other |= !is_match;
            self.properties.observe_format(current);
        }
    }

    fn finish(self) -> Result<ActionStateIndicator, ActionFault> {
        let activation = self.activation();
        let value = self
            .properties
            .finish()
            .map_err(|_| fault("breditor/set-inline-format-state-value-fault"))?;
        Ok(ActionStateIndicator::new(activation, value))
    }

    const fn activation(&self) -> ActionActivation {
        match (self.matching, self.other) {
            (true, true) => ActionActivation::Mixed,
            (true, false) => ActionActivation::Active,
            (false, true | false) => ActionActivation::Inactive,
        }
    }

    const fn is_empty(&self) -> bool {
        !self.matching && !self.other
    }
}

fn state_value_for_range(
    state: &EditorState,
    range: &TextRangeSelection,
    format_kind: &QualifiedName,
) -> Result<ActionStateValue, ActionFault> {
    if !range.is_same_paragraph() {
        let source = capture_cross_paragraph_text_source(state, range)
            .map_err(map_set_inline_format_cross_source_error)?;
        let mut scan = InlineFormatPropertiesScan::default();
        for selected in source.selected_fragments() {
            for run in selected {
                scan.observe_format(run.formats().get(format_kind));
            }
        }
        return scan.finish().map_err(|_| fault("breditor/set-inline-format-state-value-fault"));
    }
    if range.is_collapsed() {
        let source = text_splice_paragraph_fragment(state, range.start().paragraph_path())?;
        let focus_affinity = source_range(state)?.focus().affinity();
        let formats = super::support::effective_typing_formats(
            state,
            &source,
            range.start().offset(),
            focus_affinity,
        )?;
        return properties_state_for_formats(&formats, format_kind)
            .map_err(|_| fault("breditor/set-inline-format-state-value-fault"));
    }
    let source = text_splice_paragraph_fragment(state, range.start().paragraph_path())?;
    let (_, selected, _) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let mut scan = InlineFormatPropertiesScan::default();
    for run in &selected {
        scan.observe_format(run.formats().get(format_kind));
    }
    scan.finish().map_err(|_| fault("breditor/set-inline-format-state-value-fault"))
}

fn activation_for_formats(
    formats: &FormatSet,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
) -> ActionActivation {
    let current = formats.get(format_kind);
    let active = match desired {
        Some(desired) => current == Some(desired),
        None => current.is_some(),
    };
    if active { ActionActivation::Active } else { ActionActivation::Inactive }
}

fn replace_fragment_format(
    fragment: &TextFragment,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
    maximum_formats: usize,
    maximum_text_bytes: usize,
) -> Result<Option<TextFragment>, ActionFault> {
    let mut result = Vec::with_capacity(fragment.len());
    let mut group_text = String::new();
    let mut group_utf16 = 0_u64;
    let mut group_formats: Option<FormatSet> = None;
    for run in fragment {
        let Some(formats) = replace_format(run.formats(), format_kind, desired, maximum_formats)?
        else {
            return Ok(None);
        };
        if group_formats.as_ref().is_some_and(|current| current != &formats) {
            push_group(&mut result, &mut group_text, &mut group_formats)?;
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
    if group_formats.is_some() {
        push_group(&mut result, &mut group_text, &mut group_formats)?;
    }
    TextFragment::try_from_runs(result)
        .map(Some)
        .map_err(|_| fault("breditor/set-inline-format-fold-fault"))
}

fn push_group(
    result: &mut Vec<TextRun>,
    group_text: &mut String,
    group_formats: &mut Option<FormatSet>,
) -> Result<(), ActionFault> {
    let formats =
        group_formats.take().ok_or_else(|| fault("breditor/set-inline-format-group-fault"))?;
    result.push(
        TextRun::try_new(std::mem::take(group_text), formats)
            .map_err(|_| fault("breditor/set-inline-format-run-fault"))?,
    );
    Ok(())
}

fn replace_format(
    formats: &FormatSet,
    format_kind: &QualifiedName,
    desired: Option<&Format>,
    maximum_formats: usize,
) -> Result<Option<FormatSet>, ActionFault> {
    let has_format = formats.get(format_kind).is_some();
    let result_len = match (desired.is_some(), has_format) {
        (true, false) => formats.len().checked_add(1),
        (false, true) => formats.len().checked_sub(1),
        (true, true) | (false, false) => Some(formats.len()),
    };
    let Some(result_len) = result_len else {
        return Err(fault("breditor/set-inline-format-format-count-fault"));
    };
    if result_len > maximum_formats {
        return Ok(None);
    }

    let mut replaced = Vec::with_capacity(result_len);
    let mut inserted = false;
    for format in formats {
        if format.kind() == format_kind {
            if let Some(desired) = desired {
                replaced.push(desired.clone());
                inserted = true;
            }
            continue;
        }
        if let Some(desired) = desired
            && !inserted
            && format.kind() > format_kind
        {
            replaced.push(desired.clone());
            inserted = true;
        }
        replaced.push(format.clone());
    }
    if let Some(desired) = desired
        && !inserted
    {
        replaced.push(desired.clone());
    }
    FormatSet::try_from_formats(replaced)
        .map(Some)
        .map_err(|_| fault("breditor/set-inline-format-format-set-fault"))
}

fn concat_result(
    prefix: &TextFragment,
    replacement: &TextFragment,
    suffix: &TextFragment,
) -> Result<Option<TextFragment>, ActionFault> {
    let with_replacement = match prefix.try_concat(replacement) {
        Ok(result) => result,
        Err(error) if fragment_error_is_capacity(&error) => return Ok(None),
        Err(_) => return Err(fault("breditor/set-inline-format-result-fold-fault")),
    };
    match with_replacement.try_concat(suffix) {
        Ok(result) => Ok(Some(result)),
        Err(error) if fragment_error_is_capacity(&error) => Ok(None),
        Err(_) => Err(fault("breditor/set-inline-format-result-fold-fault")),
    }
}

fn cross_result_fragments(
    source: &CrossParagraphTextSource,
    replacements: &[TextFragment],
) -> Result<Option<Vec<TextFragment>>, ActionFault> {
    if replacements.len() != source.guards().len() || replacements.len() < 2 {
        return Err(fault("breditor/set-inline-format-cross-result-fault"));
    }
    let last_index = replacements
        .len()
        .checked_sub(1)
        .ok_or_else(|| fault("breditor/set-inline-format-cross-result-fault"))?;
    let mut results = Vec::with_capacity(replacements.len());
    for (index, replacement) in replacements.iter().enumerate() {
        let folded = if index == 0 {
            source.prefix().try_concat(replacement)
        } else if index == last_index {
            replacement.try_concat(source.suffix())
        } else {
            results.push(replacement.clone());
            continue;
        };
        match folded {
            Ok(result) => results.push(result),
            Err(error) if fragment_error_is_capacity(&error) => return Ok(None),
            Err(_) => return Err(fault("breditor/set-inline-format-result-fold-fault")),
        }
    }
    Ok(Some(results))
}

const fn fragment_error_is_capacity(error: &TextFragmentError) -> bool {
    matches!(
        error,
        TextFragmentError::TextOffset(_)
            | TextFragmentError::TextByteLengthOverflow
            | TextFragmentError::TextRun(_)
    )
}

fn rebuild_selection(
    state: &EditorState,
    range: &TextRangeSelection,
    result: &TextFragment,
) -> Result<Selection, ActionFault> {
    let source = source_range(state)?;
    let (anchor_offset, focus_offset) = match range.order() {
        RangeOrder::Collapsed => {
            return Err(fault("breditor/set-inline-format-selection-order-fault"));
        }
        RangeOrder::Forward => (range.start().offset(), range.end().offset()),
        RangeOrder::Backward => (range.end().offset(), range.start().offset()),
    };
    let anchor = point_at_fragment_offset(
        range.start().paragraph_path(),
        result,
        anchor_offset,
        source.anchor().affinity(),
    )
    .map_err(|_| fault("breditor/set-inline-format-selection-fault"))?;
    let focus = point_at_fragment_offset(
        range.start().paragraph_path(),
        result,
        focus_offset,
        source.focus().affinity(),
    )
    .map_err(|_| fault("breditor/set-inline-format-selection-fault"))?;
    Ok(RangeSelection::new(anchor, focus).into())
}

fn rebuild_cross_selection(
    state: &EditorState,
    range: &TextRangeSelection,
    results: &[TextFragment],
) -> Result<Selection, ActionFault> {
    let source = source_range(state)?;
    let first =
        results.first().ok_or_else(|| fault("breditor/set-inline-format-selection-fault"))?;
    let last = results.last().ok_or_else(|| fault("breditor/set-inline-format-selection-fault"))?;
    let (anchor_path, anchor_fragment, anchor_offset, focus_path, focus_fragment, focus_offset) =
        match range.order() {
            RangeOrder::Collapsed => {
                return Err(fault("breditor/set-inline-format-selection-order-fault"));
            }
            RangeOrder::Forward => (
                range.start().paragraph_path(),
                first,
                range.start().offset(),
                range.end().paragraph_path(),
                last,
                range.end().offset(),
            ),
            RangeOrder::Backward => (
                range.end().paragraph_path(),
                last,
                range.end().offset(),
                range.start().paragraph_path(),
                first,
                range.start().offset(),
            ),
        };
    let anchor = point_at_fragment_offset(
        anchor_path,
        anchor_fragment,
        anchor_offset,
        source.anchor().affinity(),
    )
    .map_err(|_| fault("breditor/set-inline-format-selection-fault"))?;
    let focus = point_at_fragment_offset(
        focus_path,
        focus_fragment,
        focus_offset,
        source.focus().affinity(),
    )
    .map_err(|_| fault("breditor/set-inline-format-selection-fault"))?;
    Ok(RangeSelection::new(anchor, focus).into())
}

fn source_range(state: &EditorState) -> Result<&RangeSelection, ActionFault> {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(fault("breditor/set-inline-format-selection-fault"));
    };
    Ok(range)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        document::{Format, FormatSet, PropertyMap, PropertyValue},
        identity::QualifiedName,
    };

    use super::{SetInlineFormatAction, replace_format};

    fn properties(name: &str, value: &str) -> Result<PropertyMap, Box<dyn Error>> {
        PropertyMap::try_from_sorted(vec![(
            QualifiedName::try_new(name)?,
            PropertyValue::from_string(value),
        )])
        .map_err(Into::into)
    }

    #[test]
    fn configured_kind_is_owned_and_observable() -> Result<(), Box<dyn Error>> {
        let kind = QualifiedName::try_new("example/link")?;
        let action = SetInlineFormatAction::new(kind.clone());
        assert_eq!(action.format_kind(), &kind);
        Ok(())
    }

    #[test]
    fn exact_replacement_preserves_canonical_order_and_unrelated_formats()
    -> Result<(), Box<dyn Error>> {
        let strong =
            Format::new(QualifiedName::try_new("breditor/strong")?, PropertyMap::default());
        let link_kind = QualifiedName::try_new("example/link")?;
        let old_link =
            Format::new(link_kind.clone(), properties("example/href", "https://old.example")?);
        let new_link =
            Format::new(link_kind.clone(), properties("example/href", "https://new.example")?);
        let source = FormatSet::try_from_formats(vec![strong.clone(), old_link])?;

        let replaced =
            replace_format(&source, &link_kind, Some(&new_link), 2)?.ok_or("format limit")?;
        assert_eq!(replaced.iter().collect::<Vec<_>>(), vec![&strong, &new_link]);
        let removed = replace_format(&replaced, &link_kind, None, 2)?.ok_or("format limit")?;
        assert_eq!(removed.iter().collect::<Vec<_>>(), vec![&strong]);
        Ok(())
    }
}
