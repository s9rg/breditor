use crate::{
    action::{Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan},
    document::TextFragment,
    identity::QualifiedName,
    operation::{
        Operation, ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace, TextRange,
        TextSplice,
    },
    position::{Affinity, Point},
    selection::Selection,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::{TextRangeSelection, right_paragraph_path},
    support::{
        CrossParagraphTextSourceError, base_shape_fits, base_total_text_fits,
        capture_cross_paragraph_text_source, collapsed_selection, disabled, fault,
        fragment_range_parts, paragraph_fragment, property_fragment_delta_fits,
        require_operation_budget, require_paragraph_structure_range, strict_relocation,
    },
};

/// Semantic action that replaces selected content with a paragraph break.
///
/// A collapsed range becomes one [`ParagraphSplit`]. In a property-free schema,
/// a same-paragraph extended range chooses a deterministic split/delete ordering
/// whose intermediate state satisfies the active limits. A typed schema uses one
/// atomic [`RootTextReplace`] so a valid final result cannot be rejected because
/// an unobservable intermediate temporarily duplicates property owners.
/// A cross-paragraph range becomes one [`RootTextReplace`] whose two empty
/// replacement fragments retain the spatial start prefix and end suffix as
/// separate result paragraphs, without exposing delete/split intermediates.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertParagraphBreakAction;

/// Returns the stable built-in paragraph-break action identity.
#[must_use]
pub fn insert_paragraph_break_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-paragraph-break",
    ))
}

impl Action for InsertParagraphBreakAction {
    type Input = ();

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_insert_paragraph_break(state).map(ActionEvaluation::stateless)
    }
}

fn evaluate_insert_paragraph_break(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    let range = match require_paragraph_structure_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if !range.is_same_paragraph() {
        if let Some(decision) = require_operation_budget(state, 1) {
            return Ok(decision);
        }
        return insert_cross_paragraph_break(state, &range);
    }
    let property_free_structure = state.context().schema().supports_base_text_operations();
    let operation_count = if range.is_collapsed() || !property_free_structure { 1 } else { 2 };
    if let Some(decision) = require_operation_budget(state, operation_count) {
        return Ok(decision);
    }

    let paragraph_path = range.start().paragraph_path();
    let split_offset = range.start().offset();
    let source = paragraph_fragment(state, paragraph_path, split_offset)?;
    let operations = if range.is_collapsed() {
        collapsed_break_operations(state, paragraph_path, split_offset, source)?
    } else {
        selected_break_operations(state, &range, paragraph_path, source, property_free_structure)?
    };
    let operations = match operations {
        BreakOperations::Enabled(operations) => operations,
        BreakOperations::Disabled(code) => return Ok(disabled(code)),
    };

    let result_paragraph = right_paragraph_path(paragraph_path)
        .map_err(|_| fault("breditor/result-paragraph-path-fault"))?;
    let caret = Point::Children {
        parent_path: result_paragraph,
        child_index: 0,
        affinity: Affinity::After,
    };
    let selection: Selection = collapsed_selection(caret);
    Ok(ActionDecision::Enabled(ActionPlan::new(
        operations,
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        HistoryIntent::Record,
    )))
}

enum BreakOperations {
    Enabled(Vec<Operation>),
    Disabled(&'static str),
}

fn collapsed_break_operations(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    split_offset: crate::position::TextOffset,
    source: TextFragment,
) -> Result<BreakOperations, ActionFault> {
    let (left, right) =
        source.split_at(split_offset).map_err(|_| fault("breditor/fragment-split-fault"))?;
    let Some(result_text_bytes) = left.text_bytes().checked_add(right.text_bytes()) else {
        return Ok(BreakOperations::Disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&left, &right])
        || !base_total_text_fits(state, source.text_bytes(), result_text_bytes)
        || !property_fragment_delta_fits(
            state,
            [&source],
            [&left, &right],
            "breditor/insert-paragraph-break-property-validation-fault",
            "breditor/insert-paragraph-break-property-budget-fault",
        )?
    {
        return Ok(BreakOperations::Disabled("breditor/result-limit-exceeded"));
    }
    let split = ParagraphSplit::try_new(paragraph_path.clone(), split_offset, source)
        .map_err(|_| fault("breditor/paragraph-split-construction-fault"))?;
    Ok(BreakOperations::Enabled(vec![Operation::from(split)]))
}

fn selected_break_operations(
    state: &EditorState,
    range: &TextRangeSelection,
    paragraph_path: &crate::position::NodePath,
    source: TextFragment,
    property_free_structure: bool,
) -> Result<BreakOperations, ActionFault> {
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let Some(result_text_bytes) = prefix.text_bytes().checked_add(suffix.text_bytes()) else {
        return Ok(BreakOperations::Disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&prefix, &suffix])
        || !base_total_text_fits(state, source.text_bytes(), result_text_bytes)
        || !property_fragment_delta_fits(
            state,
            [&source],
            [&prefix, &suffix],
            "breditor/insert-paragraph-break-property-validation-fault",
            "breditor/insert-paragraph-break-property-budget-fault",
        )?
    {
        return Ok(BreakOperations::Disabled("breditor/result-limit-exceeded"));
    }
    if property_free_structure {
        return property_free_selected_break_operations(
            state, range, source, &prefix, selected, &suffix,
        );
    }

    let operation_range = RootTextRange::try_new(
        RootTextBoundary::try_new(paragraph_path.clone(), range.start().offset())
            .map_err(|_| fault("breditor/insert-paragraph-break-root-range-fault"))?,
        RootTextBoundary::try_new(paragraph_path.clone(), range.end().offset())
            .map_err(|_| fault("breditor/insert-paragraph-break-root-range-fault"))?,
    )
    .map_err(|_| fault("breditor/insert-paragraph-break-root-range-fault"))?;
    let operation = RootTextReplace::try_new(
        operation_range,
        vec![source],
        vec![TextFragment::empty(), TextFragment::empty()],
    )
    .map_err(|_| fault("breditor/insert-paragraph-break-root-replace-fault"))?;
    Ok(BreakOperations::Enabled(vec![Operation::from(operation)]))
}

fn property_free_selected_break_operations(
    state: &EditorState,
    range: &TextRangeSelection,
    source: TextFragment,
    prefix: &TextFragment,
    selected: TextFragment,
    suffix: &TextFragment,
) -> Result<BreakOperations, ActionFault> {
    let tail = selected.try_concat(suffix).map_err(|_| fault("breditor/fragment-concat-fault"))?;
    let split_first_fits = base_shape_fits(state, 1, source.len(), &[prefix, &tail])
        && base_total_text_fits(state, source.text_bytes(), source.text_bytes())
        && property_fragment_delta_fits(
            state,
            [&source],
            [prefix, &tail],
            "breditor/insert-paragraph-break-property-validation-fault",
            "breditor/insert-paragraph-break-property-budget-fault",
        )?;
    if split_first_fits {
        let operations = split_then_delete(
            range.start().paragraph_path(),
            range.start().offset(),
            source,
            selected,
        )?;
        return Ok(BreakOperations::Enabled(operations));
    }

    let Ok(without_selection) = prefix.try_concat(suffix) else {
        return Ok(BreakOperations::Disabled("breditor/intermediate-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&without_selection])
        || !base_total_text_fits(state, source.text_bytes(), without_selection.text_bytes())
        || !property_fragment_delta_fits(
            state,
            [&source],
            [&without_selection],
            "breditor/insert-paragraph-break-property-validation-fault",
            "breditor/insert-paragraph-break-property-budget-fault",
        )?
    {
        return Ok(BreakOperations::Disabled("breditor/intermediate-limit-exceeded"));
    }
    let operations = delete_then_split(
        state,
        range.start().paragraph_path(),
        range.start().offset(),
        range.end().offset(),
        range.start().offset(),
        without_selection,
    )?;
    Ok(BreakOperations::Enabled(operations))
}

fn insert_cross_paragraph_break(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<ActionDecision, ActionFault> {
    let source = capture_cross_paragraph_text_source(state, range)
        .map_err(map_insert_paragraph_break_cross_source_error)?;
    let Some(retained_text_bytes) =
        source.prefix().text_bytes().checked_add(source.suffix().text_bytes())
    else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(
        state,
        source.guards().len(),
        source.guard_run_count(),
        &[source.prefix(), source.suffix()],
    ) || !base_total_text_fits(state, source.guard_text_bytes(), retained_text_bytes)
        || !property_fragment_delta_fits(
            state,
            source.guards().iter(),
            [source.prefix(), source.suffix()],
            "breditor/insert-paragraph-break-property-validation-fault",
            "breditor/insert-paragraph-break-property-budget-fault",
        )?
    {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }

    let result_paragraph = right_paragraph_path(source.range().start().paragraph_path())
        .map_err(|_| fault("breditor/result-paragraph-path-fault"))?;
    let selection: Selection = collapsed_selection(Point::Children {
        parent_path: result_paragraph,
        child_index: 0,
        affinity: Affinity::After,
    });
    let (operation_range, guards) = source.into_range_and_guards();
    let operation = RootTextReplace::try_new(
        operation_range,
        guards,
        vec![TextFragment::empty(), TextFragment::empty()],
    )
    .map_err(|_| fault("breditor/insert-paragraph-break-root-replace-fault"))?;

    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::from(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        HistoryIntent::Record,
    )))
}

fn map_insert_paragraph_break_cross_source_error(
    error: CrossParagraphTextSourceError,
) -> ActionFault {
    match error {
        CrossParagraphTextSourceError::Span => {
            fault("breditor/insert-paragraph-break-cross-span-fault")
        }
        CrossParagraphTextSourceError::Range => {
            fault("breditor/insert-paragraph-break-root-range-fault")
        }
        CrossParagraphTextSourceError::Source => {
            fault("breditor/insert-paragraph-break-cross-source-fault")
        }
        CrossParagraphTextSourceError::Paragraph(fault) => fault,
    }
}

fn split_then_delete(
    paragraph_path: &crate::position::NodePath,
    split_offset: crate::position::TextOffset,
    source: TextFragment,
    selected: TextFragment,
) -> Result<Vec<Operation>, ActionFault> {
    let right_path = right_paragraph_path(paragraph_path)
        .map_err(|_| fault("breditor/result-paragraph-path-fault"))?;
    let split = ParagraphSplit::try_new(paragraph_path.clone(), split_offset, source)
        .map_err(|_| fault("breditor/paragraph-split-construction-fault"))?;
    let splice_range =
        TextRange::try_new(right_path, crate::position::TextOffset::ZERO, selected.utf16_len())
            .map_err(|_| fault("breditor/text-range-construction-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, TextFragment::empty())
        .map_err(|_| fault("breditor/text-splice-construction-fault"))?;
    Ok(vec![Operation::from(split), Operation::from(splice)])
}

fn delete_then_split(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    start: crate::position::TextOffset,
    end: crate::position::TextOffset,
    split_offset: crate::position::TextOffset,
    without_selection: TextFragment,
) -> Result<Vec<Operation>, ActionFault> {
    let splice_range = TextRange::try_new(paragraph_path.clone(), start, end)
        .map_err(|_| fault("breditor/text-range-construction-fault"))?;
    let splice =
        TextSplice::capture(state.context(), state.document(), splice_range, TextFragment::empty())
            .map_err(|_| fault("breditor/text-splice-capture-fault"))?;
    let split = ParagraphSplit::try_new(paragraph_path.clone(), split_offset, without_selection)
        .map_err(|_| fault("breditor/paragraph-split-construction-fault"))?;
    Ok(vec![Operation::from(splice), Operation::from(split)])
}
