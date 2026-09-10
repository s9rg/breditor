use crate::{
    action::{
        Action, ActionDecision, ActionEffects, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateContract, ActionStateDomains, ActionStateSpec,
    },
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
    delete_selection::delete_selected_range,
    grapheme_boundary::{grapheme_boundary_at_or_after, previous_grapheme_boundary},
    support::{
        base_shape_fits, collapsed_selection_at, disabled, fault, fragment_range_parts,
        property_fragment_delta_fits, require_operation_budget, require_text_splice_range,
        strict_relocation, text_splice_paragraph_fragment,
    },
};

/// Semantic action that deletes selected content or content immediately before a caret.
///
/// Extended selections follow [`super::DeleteSelectionAction`] semantics and
/// become one independent history record. A collapsed range deletes one
/// Unicode extended grapheme cluster and offers the stable
/// `breditor/delete-backward` history merge group, or joins with the previous
/// paragraph at paragraph offset zero when the schema supports sealed paragraph
/// structure operations. Paragraph-local and structural edits preserve complete typed
/// inline-format instances. Formatting seams do not split grapheme clusters. A
/// protocol caret inside a grapheme cluster is disabled rather than widened or
/// guessed. If removing content or a paragraph boundary forms a cluster across
/// the deletion seam, the core-produced caret snaps to that cluster's following
/// boundary. Pending typing formats are preserved exactly.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteBackwardAction;

/// Returns the stable built-in backward-deletion action identity.
#[must_use]
pub fn delete_backward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static("breditor/delete-backward"))
}

impl Action for DeleteBackwardAction {
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
        evaluate_delete_backward(state).map(ActionEvaluation::stateless)
    }
}

fn evaluate_delete_backward(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    let range = match require_text_splice_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if !range.is_collapsed() {
        return delete_selected_range(state, &range);
    }
    let paragraph_path = range.start().paragraph_path();
    if range.start().offset() == TextOffset::ZERO
        && !state.context().schema().supports_paragraph_structure_operations()
    {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    if range.start().offset() != TextOffset::ZERO {
        return delete_previous_grapheme(state, paragraph_path, range.start().offset());
    }

    let Some(previous_path) = previous_paragraph_path(paragraph_path)
        .map_err(|_| fault("breditor/previous-paragraph-path-fault"))?
    else {
        return Ok(disabled("breditor/at-document-start"));
    };
    let join =
        match ParagraphJoin::capture(state.context(), state.document(), previous_path.clone()) {
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
    if !base_shape_fits(state, 2, removed_runs, &[&joined])
        || !property_fragment_delta_fits(
            state,
            [join.expected_left(), join.expected_right()],
            [&joined],
            "breditor/delete-backward-property-validation-fault",
            "breditor/delete-backward-property-budget-fault",
        )?
    {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }
    let caret = grapheme_boundary_at_or_after(&joined, seam)?;
    let selection = collapsed_selection_at(&previous_path, &joined, caret)?;
    Ok(delete_plan(state, Operation::from(join), selection))
}

fn delete_previous_grapheme(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    caret: TextOffset,
) -> Result<ActionDecision, ActionFault> {
    let source = text_splice_paragraph_fragment(state, paragraph_path)?;
    let Some(start) = previous_grapheme_boundary(&source, caret)? else {
        return Ok(disabled("breditor/caret-not-grapheme-boundary"));
    };
    if start >= caret {
        return Err(fault("breditor/delete-backward-invalid-boundary-fault"));
    }
    let Some(result) = deletion_result(&source, start, caret)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result]) {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }
    let splice = capture_empty_splice(state, paragraph_path, start, caret)?;
    let result_caret = grapheme_boundary_at_or_after(&result, start)?;
    let selection = collapsed_selection_at(paragraph_path, &result, result_caret)?;
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
