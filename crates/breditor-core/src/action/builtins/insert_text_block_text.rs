//! Typing for the experimental paragraph/heading profile.

use super::{
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextAction, InsertTextInput,
    insert_text::{ReplacementError, concat_result, replacement_fragment, source_range},
    support::{
        collapsed_selection_at_with_affinity, disabled, effective_typing_formats, fault,
        fragment_range_parts, require_operation_budget, require_text_block_range,
        strict_relocation,
    },
    text_block_support::{preview_splice, text_block_source},
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec,
    },
    identity::QualifiedName,
    operation::{Operation, TextBlockSplice, TextRange},
    position::Affinity,
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Returns the explicit experimental typing identity; base registration is unchanged.
#[must_use]
pub fn insert_text_block_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-text-block-text",
    ))
}

/// Inserts exact text within or across direct-root paragraphs and headings.
///
/// Uses the existing bounded [`InsertTextInput`] contract. Collapsed typing uses
/// pending formats, otherwise focus affinity; type-over uses the first spatially
/// selected run, regardless of selection direction. Consumes pending formats,
/// preserves block kind/rank, and puts a Before-affinity caret after the insertion.
/// Adjacent typing offers the normal typing history group.
///
/// Cross-block replacement retains the spatial start block kind and first
/// selected run's formats. A text-empty structural selection uses the surviving
/// left seam, then right seam, then plain text. This action is opt-in, feature-gated,
/// absent from base/browser registries, and durably supported by the V5 codecs.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertTextBlockTextAction;

impl Action for InsertTextBlockTextAction {
    type Input = InsertTextInput;

    fn state_spec() -> ActionStateSpec {
        InsertTextAction::state_spec()
    }

    fn evaluate(
        &self,
        state: &EditorState,
        input: &InsertTextInput,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, input).map(ActionEvaluation::stateless)
    }
}

fn evaluate(state: &EditorState, input: &InsertTextInput) -> Result<ActionDecision, ActionFault> {
    let range = match require_text_block_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    if !range.is_same_paragraph() {
        return super::insert_text_block_structure::evaluate(state, input, &range);
    }
    let path = range.start().paragraph_path();
    let (guard, source) = text_block_source(state, path)?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let formats = if range.is_collapsed() {
        effective_typing_formats(
            state,
            &source,
            range.start().offset(),
            source_range(state)?.focus().affinity(),
        )?
    } else {
        selected
            .iter()
            .next()
            .map(|run| run.formats().clone())
            .ok_or_else(|| fault("breditor/insert-text-selected-format-fault"))?
    };
    let replacement = match replacement_fragment(input, formats) {
        Ok(fragment) => fragment,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => {
            return Err(fault("breditor/insert-text-input-invariant-fault"));
        }
    };
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let operation = TextBlockSplice::try_new(
        TextRange::try_new(path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/insert-text-range-fault"))?,
        guard,
        replacement,
    )
    .map_err(|_| fault("breditor/text-block-splice-fault"))?;
    if let Some(decision) = preview_splice(state, &operation)? {
        return Ok(decision);
    }
    let caret = range
        .start()
        .offset()
        .checked_add(u64::from(input.utf16_len()))
        .map_err(|_| fault("breditor/insert-text-caret-offset-fault"))?;
    let selection = collapsed_selection_at_with_affinity(path, &result, caret, Affinity::Before)?;
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::TextBlockSplice(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
    )))
}
