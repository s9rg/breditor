use crate::{
    action::{Action, ActionDecision, ActionFault, ActionId, ActionPlan},
    document::TextFragment,
    identity::QualifiedName,
    operation::{
        Operation, ParagraphJoin, ParagraphJoinApplyError, ParagraphJoinError, TextRange,
        TextSplice,
    },
    position::TextOffset,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::previous_paragraph_path,
    support::{
        base_shape_fits, collapsed_selection_at, disabled, fault, fragment_range_parts,
        paragraph_fragment, require_base_range, require_operation_budget, strict_relocation,
    },
};

/// Semantic action that deletes content immediately before a same-paragraph range.
///
/// Extended ranges are removed atomically. A collapsed range deletes one
/// Unicode scalar, or joins with the previous paragraph when it is at paragraph
/// offset zero. Grapheme-cluster deletion is intentionally deferred to a future
/// deterministic segmentation service.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteBackwardAction;

/// Returns the stable built-in backward-deletion action identity.
#[must_use]
pub fn delete_backward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static("breditor/delete-backward"))
}

impl Action for DeleteBackwardAction {
    type Input = ();

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionDecision, ActionFault> {
        let range = match require_base_range(state)? {
            Ok(range) => range,
            Err(reason) => return Ok(ActionDecision::Disabled(reason)),
        };
        let paragraph_path = range.start().paragraph_path();
        if !range.is_collapsed() {
            if let Some(decision) = require_operation_budget(state, 1) {
                return Ok(decision);
            }
            return delete_text_range(state, &range);
        }
        if range.start().offset() != TextOffset::ZERO {
            if let Some(decision) = require_operation_budget(state, 1) {
                return Ok(decision);
            }
            return delete_previous_scalar(state, paragraph_path, range.start().offset());
        }

        let Some(previous_path) = previous_paragraph_path(paragraph_path)
            .map_err(|_| fault("breditor/previous-paragraph-path-fault"))?
        else {
            return Ok(disabled("breditor/at-document-start"));
        };
        if let Some(decision) = require_operation_budget(state, 1) {
            return Ok(decision);
        }
        let join = match ParagraphJoin::capture(
            state.context(),
            state.document(),
            previous_path.clone(),
        ) {
            Ok(join) => join,
            Err(ParagraphJoinApplyError::Contract(ParagraphJoinError::Fragment(_))) => {
                return Ok(disabled("breditor/result-limit-exceeded"));
            }
            Err(_) => return Err(fault("breditor/paragraph-join-capture-fault")),
        };
        let seam = join.expected_left().utf16_len();
        let Ok(joined) = join.expected_left().try_concat(join.expected_right()) else {
            return Ok(disabled("breditor/result-limit-exceeded"));
        };
        let removed_runs = join
            .expected_left()
            .len()
            .checked_add(join.expected_right().len())
            .ok_or_else(|| fault("breditor/result-node-count-fault"))?;
        if !base_shape_fits(state, 2, removed_runs, &[&joined]) {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        let selection = collapsed_selection_at(&previous_path, &joined, seam)?;
        Ok(delete_plan(state, Operation::from(join), selection))
    }
}

fn delete_text_range(
    state: &EditorState,
    range: &super::super::text_position::TextRangeSelection,
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
    let splice =
        capture_empty_splice(state, paragraph_path, range.start().offset(), range.end().offset())?;
    let selection = collapsed_selection_at(paragraph_path, &result, range.start().offset())?;
    Ok(delete_plan(state, Operation::from(splice), selection))
}

fn delete_previous_scalar(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    caret: TextOffset,
) -> Result<ActionDecision, ActionFault> {
    let source = paragraph_fragment(state, paragraph_path, caret)?;
    let (prefix, _) = source.split_at(caret).map_err(|_| fault("breditor/fragment-split-fault"))?;
    let previous_width = prefix
        .iter()
        .next_back()
        .and_then(|run| run.text().chars().next_back())
        .map(char::len_utf16)
        .ok_or_else(|| fault("breditor/missing-previous-scalar-fault"))?;
    let start_value = caret
        .get()
        .checked_sub(
            u64::try_from(previous_width)
                .map_err(|_| fault("breditor/scalar-width-conversion-fault"))?,
        )
        .ok_or_else(|| fault("breditor/previous-scalar-offset-fault"))?;
    let start = TextOffset::try_new(start_value)
        .map_err(|_| fault("breditor/previous-scalar-offset-fault"))?;
    let Some(result) = deletion_result(&source, start, caret)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result]) {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }
    let splice = capture_empty_splice(state, paragraph_path, start, caret)?;
    let selection = collapsed_selection_at(paragraph_path, &result, start)?;
    Ok(delete_plan(state, Operation::from(splice), selection))
}

fn deletion_result(
    source: &TextFragment,
    start: TextOffset,
    end: TextOffset,
) -> Result<Option<TextFragment>, ActionFault> {
    let (prefix, _, suffix) = fragment_range_parts(source, start, end)?;
    Ok(prefix.try_concat(&suffix).ok())
}

fn capture_empty_splice(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    start: TextOffset,
    end: TextOffset,
) -> Result<TextSplice, ActionFault> {
    let range = TextRange::try_new(paragraph_path.clone(), start, end)
        .map_err(|_| fault("breditor/text-range-construction-fault"))?;
    TextSplice::capture(state.context(), state.document(), range, TextFragment::empty())
        .map_err(|_| fault("breditor/text-splice-capture-fault"))
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
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static("breditor/delete-backward"),
        },
    ))
}
