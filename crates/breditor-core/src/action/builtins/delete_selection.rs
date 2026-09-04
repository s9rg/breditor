use crate::{
    action::{
        Action, ActionDecision, ActionEffects, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateContract, ActionStateDomains, ActionStateSpec,
    },
    document::TextFragment,
    identity::QualifiedName,
    operation::{Operation, RootTextReplace, TextRange, TextSplice},
    position::TextOffset,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::TextRangeSelection,
    support::{
        CrossParagraphTextSourceError, base_shape_fits, base_total_text_fits,
        capture_cross_paragraph_text_source, collapsed_selection_at, disabled, fault,
        fragment_range_parts, paragraph_fragment, require_base_text_range,
        require_operation_budget, strict_relocation,
    },
};

/// Semantic action that deletes exactly one non-collapsed text selection.
///
/// The source range is normalized into spatial order before evaluation, so a
/// backward selection deletes the same content as its forward equivalent and
/// collapses at the same spatial start. Same-paragraph selections use one
/// [`TextSplice`]; cross-paragraph selections use one atomic
/// [`RootTextReplace`], including selections that contain only paragraph
/// boundaries. Pending typing formats are preserved exactly. Active resource
/// limits can disable deletion when canonicalizing retained seams would create
/// an oversized leaf or otherwise exceed the result bounds.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteSelectionAction;

/// Returns the stable built-in selection-deletion action identity.
#[must_use]
pub fn delete_selection_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static("breditor/delete-selection"))
}

impl Action for DeleteSelectionAction {
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
        ActionStateSpec::new(ActionStateContract::stateless(), ActionEffects::new(reads, may_write))
    }

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_delete_selection(state).map(ActionEvaluation::stateless)
    }
}

fn evaluate_delete_selection(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    let range = match require_base_text_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    delete_selected_range(state, &range)
}

/// Builds the exact deletion shared by explicit and keyboard-driven selection
/// deletion.
///
/// The caller may pass any normalized range. A collapsed range is rejected as
/// inapplicable, while every non-collapsed range records an independent history
/// event rather than joining a directional character-deletion group.
pub(super) fn delete_selected_range(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    if range.is_collapsed() {
        return Ok(disabled("breditor/collapsed-selection"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    if range.is_same_paragraph() {
        return delete_same_paragraph_range(state, range);
    }
    delete_cross_paragraph_range(state, range)
}

fn delete_same_paragraph_range(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    let paragraph_path = range.start().paragraph_path();
    let source = paragraph_fragment(state, paragraph_path, range.start().offset())?;
    let Some(result) = deletion_result(&source, range.start().offset(), range.end().offset())?
    else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result]) {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }

    let operation_range =
        TextRange::try_new(paragraph_path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/delete-selection-text-range-fault"))?;
    let operation = TextSplice::capture(
        state.context(),
        state.document(),
        operation_range,
        TextFragment::empty(),
    )
    .map_err(|_| fault("breditor/delete-selection-text-splice-fault"))?;
    let selection = collapsed_selection_at(paragraph_path, &result, range.start().offset())?;
    Ok(delete_plan(state, Operation::from(operation), selection))
}

fn delete_cross_paragraph_range(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    let source = capture_cross_paragraph_text_source(state, range)
        .map_err(map_delete_selection_cross_source_error)?;
    let Ok(result) = source.prefix().try_concat(source.suffix()) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, source.guards().len(), source.guard_run_count(), &[&result])
        || !base_total_text_fits(state, source.guard_text_bytes(), result.text_bytes())
    {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }

    let selection = collapsed_selection_at(
        source.range().start().paragraph_path(),
        &result,
        source.range().start().offset(),
    )?;
    let (operation_range, guards) = source.into_range_and_guards();
    let operation = RootTextReplace::try_new(operation_range, guards, vec![TextFragment::empty()])
        .map_err(|_| fault("breditor/delete-selection-root-replace-fault"))?;
    Ok(delete_plan(state, Operation::from(operation), selection))
}

fn deletion_result(
    source: &TextFragment,
    start: TextOffset,
    end: TextOffset,
) -> Result<Option<TextFragment>, ActionFault> {
    let (prefix, _, suffix) = fragment_range_parts(source, start, end)?;
    Ok(prefix.try_concat(&suffix).ok())
}

fn map_delete_selection_cross_source_error(error: CrossParagraphTextSourceError) -> ActionFault {
    match error {
        CrossParagraphTextSourceError::Span => fault("breditor/delete-selection-cross-span-fault"),
        CrossParagraphTextSourceError::Range => fault("breditor/delete-selection-root-range-fault"),
        CrossParagraphTextSourceError::Source => {
            fault("breditor/delete-selection-cross-source-fault")
        }
        CrossParagraphTextSourceError::Paragraph(fault) => fault,
    }
}

fn delete_plan(
    state: &EditorState,
    operation: Operation,
    selection: crate::selection::Selection,
) -> ActionDecision {
    ActionDecision::Enabled(ActionPlan::new(
        vec![operation],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        HistoryIntent::Record,
    ))
}
