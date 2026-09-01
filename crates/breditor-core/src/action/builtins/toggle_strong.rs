use crate::{
    action::{
        Action, ActionActivation, ActionActivationContract, ActionDecision, ActionEffects,
        ActionEvaluation, ActionFault, ActionId, ActionPlan, ActionStateContract,
        ActionStateDomains, ActionStateIndicator, ActionStateSpec, ActionStateValue,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment, TextFragmentError, TextRun},
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::{NodePath, TextOffset},
    selection::{RangeOrder, RangeSelection, Selection},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::{TextRangeSelection, direct_paragraph_index, point_at_fragment_offset},
    support::{
        base_shape_fits, disabled, effective_typing_formats, fault, fragment_range_parts,
        paragraph_fragment, require_base_text_range, require_operation_budget, strict_relocation,
    },
};

/// Semantic action that toggles the base schema's strong text format.
///
/// A collapsed range changes the explicit pending typing formats without
/// rewriting content. A same-paragraph extended range rewrites the selected
/// formatted text through one exact guarded splice. Cross-paragraph ranges are
/// observed truthfully but remain unavailable until the core has a native
/// block-range formatting operation.
#[derive(Clone, Copy, Debug, Default)]
pub struct ToggleStrongAction;

/// Returns the stable built-in strong-format action identity.
#[must_use]
pub fn toggle_strong_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static("breditor/toggle-strong"))
}

impl Action for ToggleStrongAction {
    type Input = ();

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
            ActionStateContract::new(ActionActivationContract::Tracked, None),
            ActionEffects::new(reads, may_write),
        )
    }

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_toggle_strong(state)
    }
}

fn evaluate_toggle_strong(state: &EditorState) -> Result<ActionEvaluation, ActionFault> {
    let range = match require_base_text_range(state)? {
        Ok(range) => range,
        Err(reason) => {
            return Ok(evaluation(ActionDecision::Disabled(reason), ActionActivation::Inactive));
        }
    };
    let strong = state.context().schema().strong_kind();

    if !range.is_same_paragraph() {
        let activation = scan_cross_paragraph_activation(state, &range, strong)?;
        return Ok(evaluation(disabled("breditor/cross-paragraph-selection"), activation));
    }
    if range.is_collapsed() {
        return evaluate_collapsed(state, &range, strong);
    }
    evaluate_extended(state, &range, strong)
}

fn evaluate_collapsed(
    state: &EditorState,
    range: &TextRangeSelection,
    strong: &QualifiedName,
) -> Result<ActionEvaluation, ActionFault> {
    let fragment =
        paragraph_fragment(state, range.start().paragraph_path(), range.start().offset())?;
    let focus_affinity = source_range(state)?.focus().affinity();
    let formats =
        effective_typing_formats(state, &fragment, range.start().offset(), focus_affinity)?;
    let activation = activation_for_formats(&formats, strong);
    let Some(toggled) = toggle_formats(
        &formats,
        strong,
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
    strong: &QualifiedName,
) -> Result<ActionEvaluation, ActionFault> {
    let paragraph_path = range.start().paragraph_path();
    let source = paragraph_fragment(state, paragraph_path, range.start().offset())?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let activation = activation_for_fragment(&selected, strong);

    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(evaluation(decision, activation));
    }
    let add_strong = !matches!(activation, ActionActivation::Active);
    let limits = state.context().limits();
    let Some(replacement) = toggle_fragment(
        &selected,
        strong,
        add_strong,
        limits.max_formats_per_text(),
        limits.max_text_bytes(),
    )?
    else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result]) {
        return Ok(evaluation(disabled("breditor/result-limit-exceeded"), activation));
    }

    let splice_range =
        TextRange::try_new(paragraph_path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/toggle-strong-range-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, replacement)
        .map_err(|_| fault("breditor/toggle-strong-splice-fault"))?;
    let result_selection = rebuild_selection(state, range, &result)?;
    let plan = ActionPlan::new(
        vec![Operation::from(splice)],
        strict_relocation(),
        SelectionUpdate::Set(Some(result_selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    );
    Ok(evaluation(ActionDecision::Enabled(plan), activation))
}

fn evaluation(decision: ActionDecision, activation: ActionActivation) -> ActionEvaluation {
    ActionEvaluation::new(
        decision,
        ActionStateIndicator::new(activation, ActionStateValue::Unsupported),
    )
}

fn activation_for_formats(formats: &FormatSet, strong: &QualifiedName) -> ActionActivation {
    if formats.get(strong).is_some() {
        ActionActivation::Active
    } else {
        ActionActivation::Inactive
    }
}

fn activation_for_fragment(fragment: &TextFragment, strong: &QualifiedName) -> ActionActivation {
    let mut scan = ActivationScan::default();
    scan.observe(fragment, strong);
    scan.activation()
}

#[derive(Default)]
struct ActivationScan {
    strong: bool,
    plain: bool,
}

impl ActivationScan {
    fn observe(&mut self, fragment: &TextFragment, strong: &QualifiedName) {
        for run in fragment {
            if run.formats().get(strong).is_some() {
                self.strong = true;
            } else {
                self.plain = true;
            }
        }
    }

    const fn activation(&self) -> ActionActivation {
        match (self.strong, self.plain) {
            (true, true) => ActionActivation::Mixed,
            (true, false) => ActionActivation::Active,
            (false, true | false) => ActionActivation::Inactive,
        }
    }
}

fn scan_cross_paragraph_activation(
    state: &EditorState,
    range: &TextRangeSelection,
    strong: &QualifiedName,
) -> Result<ActionActivation, ActionFault> {
    let start_index = direct_paragraph_index(range.start().paragraph_path())
        .map_err(|_| fault("breditor/toggle-strong-path-fault"))?;
    let end_index = direct_paragraph_index(range.end().paragraph_path())
        .map_err(|_| fault("breditor/toggle-strong-path-fault"))?;
    let mut scan = ActivationScan::default();
    let mut index = start_index;
    loop {
        let path = NodePath::try_from_indices(vec![index])
            .map_err(|_| fault("breditor/toggle-strong-path-fault"))?;
        let boundary = if index == start_index {
            range.start().offset()
        } else if index == end_index {
            range.end().offset()
        } else {
            TextOffset::ZERO
        };
        let fragment = paragraph_fragment(state, &path, boundary)?;
        let selected = if index == start_index {
            fragment
                .split_at(range.start().offset())
                .map_err(|_| fault("breditor/toggle-strong-scan-fault"))?
                .1
        } else if index == end_index {
            fragment
                .split_at(range.end().offset())
                .map_err(|_| fault("breditor/toggle-strong-scan-fault"))?
                .0
        } else {
            fragment
        };
        scan.observe(&selected, strong);
        if matches!(scan.activation(), ActionActivation::Mixed) {
            return Ok(ActionActivation::Mixed);
        }
        if index == end_index {
            break;
        }
        index = index.checked_add(1).ok_or_else(|| fault("breditor/toggle-strong-path-fault"))?;
    }
    Ok(scan.activation())
}

fn toggle_fragment(
    fragment: &TextFragment,
    strong: &QualifiedName,
    add: bool,
    maximum_formats: usize,
    maximum_text_bytes: usize,
) -> Result<Option<TextFragment>, ActionFault> {
    let mut result = Vec::with_capacity(fragment.len());
    let mut group_text = String::new();
    let mut group_utf16 = 0_u64;
    let mut group_formats: Option<FormatSet> = None;
    for run in fragment {
        let Some(formats) = toggle_formats(run.formats(), strong, add, maximum_formats)? else {
            return Ok(None);
        };
        if group_formats.as_ref().is_some_and(|current| current != &formats) {
            let current =
                group_formats.take().ok_or_else(|| fault("breditor/toggle-strong-group-fault"))?;
            result.push(
                TextRun::try_new(std::mem::take(&mut group_text), current)
                    .map_err(|_| fault("breditor/toggle-strong-run-fault"))?,
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
                .map_err(|_| fault("breditor/toggle-strong-run-fault"))?,
        );
    }
    TextFragment::try_from_runs(result)
        .map(Some)
        .map_err(|_| fault("breditor/toggle-strong-fold-fault"))
}

fn toggle_formats(
    formats: &FormatSet,
    strong: &QualifiedName,
    add: bool,
    maximum_formats: usize,
) -> Result<Option<FormatSet>, ActionFault> {
    let has_strong = formats.get(strong).is_some();
    let result_len = match (add, has_strong) {
        (true, false) => formats.len().checked_add(1),
        (false, true) => formats.len().checked_sub(1),
        (true, true) | (false, false) => Some(formats.len()),
    };
    let Some(result_len) = result_len else {
        return Err(fault("breditor/toggle-strong-format-count-fault"));
    };
    if result_len > maximum_formats {
        return Ok(None);
    }
    if add == has_strong {
        return Ok(Some(formats.clone()));
    }

    let mut toggled = Vec::with_capacity(result_len);
    let mut inserted = false;
    for format in formats {
        if format.kind() == strong {
            continue;
        }
        if add && !inserted && format.kind() > strong {
            toggled.push(strong_format(strong));
            inserted = true;
        }
        toggled.push(format.clone());
    }
    if add && !inserted {
        toggled.push(strong_format(strong));
    }
    FormatSet::try_from_formats(toggled)
        .map(Some)
        .map_err(|_| fault("breditor/toggle-strong-format-set-fault"))
}

fn strong_format(strong: &QualifiedName) -> Format {
    Format::new(strong.clone(), PropertyMap::default())
}

fn concat_result(
    prefix: &TextFragment,
    replacement: &TextFragment,
    suffix: &TextFragment,
) -> Result<Option<TextFragment>, ActionFault> {
    let with_replacement = match prefix.try_concat(replacement) {
        Ok(result) => result,
        Err(error) if fragment_error_is_capacity(&error) => return Ok(None),
        Err(_) => return Err(fault("breditor/toggle-strong-result-fold-fault")),
    };
    match with_replacement.try_concat(suffix) {
        Ok(result) => Ok(Some(result)),
        Err(error) if fragment_error_is_capacity(&error) => Ok(None),
        Err(_) => Err(fault("breditor/toggle-strong-result-fold-fault")),
    }
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
            return Err(fault("breditor/toggle-strong-selection-order-fault"));
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
    .map_err(|_| fault("breditor/toggle-strong-selection-fault"))?;
    let focus = point_at_fragment_offset(
        range.start().paragraph_path(),
        result,
        focus_offset,
        source.focus().affinity(),
    )
    .map_err(|_| fault("breditor/toggle-strong-selection-fault"))?;
    Ok(RangeSelection::new(anchor, focus).into())
}

fn source_range(state: &EditorState) -> Result<&RangeSelection, ActionFault> {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(fault("breditor/toggle-strong-selection-fault"));
    };
    Ok(range)
}
