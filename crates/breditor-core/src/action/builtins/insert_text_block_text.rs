//! Same-block typing for the experimental paragraph/heading profile.

use super::{
    INSERT_TEXT_HISTORY_GROUP_NAME, InsertTextAction, InsertTextInput,
    insert_text::{ReplacementError, concat_result, replacement_fragment, source_range},
    support::{
        collapsed_selection_at_with_affinity, disabled, effective_typing_formats, fault,
        fragment_range_parts, require_operation_budget, require_text_block_range,
        strict_relocation,
    },
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec,
    },
    document::{TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, TextBlockSplice, TextBlockSpliceError, TextRange, TextSpliceApplyError,
    },
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

/// Inserts exact text within one direct-root paragraph or heading.
///
/// Uses the existing bounded [`InsertTextInput`] contract. Collapsed typing uses
/// pending formats, otherwise focus affinity; type-over uses the first spatially
/// selected run, regardless of selection direction. Consumes pending formats,
/// preserves block kind/rank, and puts a Before-affinity caret after the insertion.
/// Adjacent typing offers the normal typing history group.
///
/// Cross-block ranges are explicitly disabled until their retained-kind policy
/// and structural primitive are implemented. This action is opt-in, feature-gated,
/// absent from base/browser registries, and not yet durably serializable.
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
    if !range.is_same_paragraph() {
        return Ok(disabled("breditor/unsupported-cross-block-selection"));
    }
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let path = range.start().paragraph_path();
    let guard =
        state.document().node_at(path).map_err(|_| fault("breditor/text-block-source-fault"))?;
    let element = guard.as_element().ok_or_else(|| fault("breditor/text-block-source-fault"))?;
    let runs = element
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/text-block-source-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let source =
        TextFragment::try_from_runs(runs).map_err(|_| fault("breditor/text-block-source-fault"))?;
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
        guard.clone(),
        replacement,
    )
    .map_err(|_| fault("breditor/text-block-splice-fault"))?;
    // Authoritative full-tree preview counts the heading property and untouched
    // siblings. Execution still rechecks the complete source guard atomically.
    if let Err(error) = operation.apply(state.context(), state.document()) {
        return match error {
            TextBlockSpliceError::Validation(_)
            | TextBlockSpliceError::Text(
                TextSpliceApplyError::FragmentRunCountLimit { .. }
                | TextSpliceApplyError::FragmentTotalTextBytesLimit { .. }
                | TextSpliceApplyError::FragmentTextBytesLimit { .. }
                | TextSpliceApplyError::FragmentFormatCountLimit { .. }
                | TextSpliceApplyError::FragmentPropertyValueCountLimit { .. }
                | TextSpliceApplyError::FragmentPropertyStringBytesLimit { .. },
            ) => Ok(disabled("breditor/result-limit-exceeded")),
            _ => Err(fault("breditor/text-block-splice-preview-fault")),
        };
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
