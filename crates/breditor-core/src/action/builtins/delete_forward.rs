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
    position::{Affinity, TextOffset},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    delete_selection::delete_selected_range,
    grapheme_boundary::{grapheme_boundary_at_or_before, next_grapheme_boundary},
    support::{
        base_shape_fits, collapsed_selection_at_with_affinity, disabled, fault,
        fragment_range_parts, require_operation_budget, require_text_splice_range,
        strict_relocation, text_splice_paragraph_fragment,
    },
};

/// Semantic action that deletes a selection or the grapheme after a caret.
///
/// An extended selection follows [`super::DeleteSelectionAction`] semantics and
/// becomes one independent history record. A collapsed selection deletes one
/// Unicode extended grapheme cluster and offers the stable
/// `breditor/delete-forward` history merge group. At a paragraph end it joins
/// the immediate next paragraph only when the schema supports property-free
/// structural operations; typed paragraph-local splices preserve complete
/// inline-format instances. At document end it is disabled. A protocol caret
/// inside a grapheme cluster is also disabled instead of widening or guessing
/// its deletion range. If removing content or a paragraph boundary forms a
/// cluster across the deletion seam, the core-produced caret snaps to that
/// cluster's preceding boundary. Pending typing formats are preserved exactly.
#[derive(Clone, Copy, Debug, Default)]
pub struct DeleteForwardAction;

/// Returns the stable built-in forward-deletion action identity.
#[must_use]
pub fn delete_forward_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static("breditor/delete-forward"))
}

impl Action for DeleteForwardAction {
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
        evaluate_delete_forward(state).map(ActionEvaluation::stateless)
    }
}

fn evaluate_delete_forward(state: &EditorState) -> Result<ActionDecision, ActionFault> {
    let range = match require_text_splice_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if !range.is_collapsed() {
        return delete_selected_range(state, &range);
    }
    let paragraph_path = range.start().paragraph_path();
    let caret = range.start().offset();
    let supports_structural = state.context().schema().supports_base_text_operations();
    // Preserve the property-free action's early operation-budget exit. Typed
    // schemas need the paragraph length first so a boundary route can retain
    // its stable unsupported-schema outcome instead of appearing budget-bound.
    if supports_structural && let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let source = text_splice_paragraph_fragment(state, paragraph_path)?;
    if caret == source.utf16_len() && !supports_structural {
        // ParagraphJoin is intentionally still property-free. This also keeps
        // the pre-existing typed-schema outcome stable at document end.
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if !supports_structural && let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    if caret < source.utf16_len() {
        return delete_next_grapheme(state, paragraph_path, caret, &source);
    }
    if caret > source.utf16_len() {
        return Err(fault("breditor/delete-forward-caret-out-of-bounds-fault"));
    }
    join_next_paragraph(state, paragraph_path)
}

fn delete_next_grapheme(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
    caret: TextOffset,
    source: &TextFragment,
) -> Result<ActionDecision, ActionFault> {
    let Some(end) = next_grapheme_boundary(source, caret)? else {
        return Ok(disabled("breditor/caret-not-grapheme-boundary"));
    };
    if end <= caret || end > source.utf16_len() {
        return Err(fault("breditor/delete-forward-invalid-boundary-fault"));
    }
    let (prefix, _, suffix) = fragment_range_parts(source, caret, end)?;
    let Ok(result) = prefix.try_concat(&suffix) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result]) {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }

    let operation_range = TextRange::try_new(paragraph_path.clone(), caret, end)
        .map_err(|_| fault("breditor/delete-forward-text-range-fault"))?;
    let operation = TextSplice::capture(
        state.context(),
        state.document(),
        operation_range,
        TextFragment::empty(),
    )
    .map_err(|_| fault("breditor/delete-forward-text-splice-fault"))?;
    let result_caret = grapheme_boundary_at_or_before(&result, caret)?;
    let selection = collapsed_selection_at_with_affinity(
        paragraph_path,
        &result,
        result_caret,
        Affinity::Before,
    )?;
    Ok(forward_plan(state, Operation::from(operation), selection))
}

fn join_next_paragraph(
    state: &EditorState,
    paragraph_path: &crate::position::NodePath,
) -> Result<ActionDecision, ActionFault> {
    let join =
        match ParagraphJoin::capture(state.context(), state.document(), paragraph_path.clone()) {
            Ok(join) => join,
            Err(ParagraphJoinApplyError::MissingRightSibling { .. }) => {
                return Ok(disabled("breditor/at-document-end"));
            }
            Err(ParagraphJoinApplyError::Contract(ParagraphJoinError::Fragment(_))) => {
                return Ok(disabled("breditor/result-limit-exceeded"));
            }
            Err(_) => return Err(fault("breditor/delete-forward-paragraph-join-capture-fault")),
        };
    let seam = join.expected_left().utf16_len();
    let Ok(joined) = join.expected_left().try_concat(join.expected_right()) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let removed_runs = join
        .expected_left()
        .len()
        .checked_add(join.expected_right().len())
        .ok_or_else(|| fault("breditor/delete-forward-result-node-count-fault"))?;
    if !base_shape_fits(state, 2, removed_runs, &[&joined]) {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }
    let caret = grapheme_boundary_at_or_before(&joined, seam)?;
    let selection =
        collapsed_selection_at_with_affinity(paragraph_path, &joined, caret, Affinity::Before)?;
    Ok(forward_plan(state, Operation::from(join), selection))
}

fn forward_plan(
    state: &EditorState,
    operation: Operation,
    selection: crate::selection::Selection,
) -> ActionDecision {
    ActionDecision::Enabled(ActionPlan::new(
        vec![operation],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        HistoryIntent::Merge { group: QualifiedName::from_known_static("breditor/delete-forward") },
    ))
}
