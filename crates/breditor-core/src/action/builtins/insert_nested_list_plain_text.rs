//! Atomic bounded plain-text paste into the opt-in nested-list profile.
use super::{
    InsertPlainTextAction, InsertPlainTextInput,
    insert_nested_list_structure::capture,
    insert_plain_text::{ReplacementError, derive_result, replacement_fragments},
    insert_text_block_plain_text::{insertion_parts, replacement_block},
    nested_list_range_layout::replacement_roots,
    support::{collapsed_selection, disabled, fault, require_operation_budget, strict_relocation},
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec,
        text_position::{
            normalize_nested_list_range_selection, point_at_nested_list_fragment_offset,
        },
    },
    identity::QualifiedName,
    operation::{
        NestedListTextRange, NestedListTextReplace, NestedListTextReplaceError, Operation,
    },
    position::{Affinity, Point},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Inserts bounded plain text as one atomic, independently undoable edit.
///
/// CRLF/CR/LF normalize through the existing [`InsertPlainTextInput`] contract.
/// Each line becomes one block in the spatial start container: a bare block or
/// list item. Blank lines remain blank blocks/items, never implicit list exits.
/// The first block retains the start kind, interior blocks are paragraphs, and
/// a multiline last block retains the end kind only when suffix text survives.
/// One-line replacement retains the start kind. Untouched suffix items in a
/// different list retain their original ordinal starts and stay separate.
/// Surviving descendants attach to the last inserted item using the shared
/// nested range retention policy. Plain text never imports list structure.
///
/// Carets inherit pending formats then focus-affinity context; ranges inherit
/// the first selected run (including middle items), then surviving left/right
/// seams, then plain text. All inserted runs use that format set. Selection
/// collapses with Before affinity before retained suffix text; pending formats
/// are consumed. Exact replacements may be selection-only with no undo entry.
/// Complete-result/ordinal limits are checked before publication. Experimental
/// Rust registration only; existing durable/browser profiles are not widened.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertNestedListPlainTextAction;

/// Returns the explicit nested-list plain-text insertion identity.
#[must_use]
pub fn insert_nested_list_plain_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-nested-list-plain-text",
    ))
}
impl Action for InsertNestedListPlainTextAction {
    type Input = InsertPlainTextInput;
    fn state_spec() -> ActionStateSpec {
        InsertPlainTextAction::state_spec()
    }
    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state, input).map(ActionEvaluation::stateless)
    }
}

fn evaluate(
    state: &EditorState,
    input: &InsertPlainTextInput,
) -> Result<ActionDecision, ActionFault> {
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let (first_node, first_text) = capture(state, range.start().paragraph_path())?;
    let (last_node, last_text) = capture(state, range.end().paragraph_path())?;
    let (prefix, suffix, formats) =
        insertion_parts(state, &range, &first_text, &last_text, first_selected_formats)?;
    let replacement = match replacement_fragments(input, &formats) {
        Ok(value) => value,
        Err(ReplacementError::Capacity) => return Ok(disabled("breditor/result-limit-exceeded")),
        Err(ReplacementError::Invariant) => {
            return Err(fault("breditor/insert-plain-text-input-invariant-fault"));
        }
    };
    let Some(result) = derive_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let nodes = replacement
        .iter()
        .enumerate()
        .map(|(index, fragment)| {
            let template = if index == 0 {
                Some(&first_node)
            } else if index + 1 == replacement.len() && !suffix.is_empty() {
                Some(&last_node)
            } else {
                None
            };
            replacement_block(template, fragment)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let roots = replacement_roots(state, &range, &nodes)?;
    let mut indexes = range.start().paragraph_path().to_vec();
    let at = if indexes.len() == 1 { 0 } else { indexes.len() - 2 };
    indexes[at] = indexes[at]
        .checked_add(input.paragraph_count() - 1)
        .ok_or_else(|| fault("breditor/nested-paste-caret-fault"))?;
    let path = crate::position::NodePath::try_from_indices(indexes)
        .map_err(|_| fault("breditor/nested-paste-caret-fault"))?;
    let tail =
        replacement.last().ok_or_else(|| fault("breditor/list-paste-input-fault"))?.utf16_len();
    let offset = if replacement.len() == 1 {
        range
            .start()
            .offset()
            .checked_add(tail.get())
            .map_err(|_| fault("breditor/list-paste-caret-fault"))?
    } else {
        tail
    };
    let caret = point_at_nested_list_fragment_offset(
        &path,
        result.last().ok_or_else(|| fault("breditor/list-paste-result-fault"))?,
        offset,
        Affinity::Before,
    )
    .map_err(|_| fault("breditor/list-paste-caret-fault"))?;
    let operation_range = NestedListTextRange::try_new(
        range.start().paragraph_path().clone(),
        range.start().offset(),
        range.end().paragraph_path().clone(),
        range.end().offset(),
    )
    .map_err(|_| fault("breditor/list-paste-range-fault"))?;
    let op = NestedListTextReplace::capture_layout(&roots).and_then(|layout| {
        NestedListTextReplace::capture(
            state.context(),
            state.document(),
            operation_range,
            nodes,
            layout,
        )
    });
    plan(state, op, caret)
}

fn plan(
    state: &EditorState,
    op: Result<NestedListTextReplace, NestedListTextReplaceError>,
    caret: Point,
) -> Result<ActionDecision, ActionFault> {
    let op = op.and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let op = match op {
        Ok(op) => op,
        Err(
            NestedListTextReplaceError::RootChildLimit | NestedListTextReplaceError::Validation(_),
        ) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/list-paste-plan-fault")),
    };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::NestedListTextReplace(op)],
        strict_relocation(),
        SelectionUpdate::Set(Some(collapsed_selection(caret))),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}

fn first_selected_formats(
    state: &EditorState,
    range: &crate::action::text_position::TextRangeSelection,
) -> Result<Option<crate::document::FormatSet>, ActionFault> {
    let (_, fragments) = super::nested_list_format::capture_selection(state, range)?;
    Ok(fragments
        .iter()
        .flat_map(crate::document::TextFragment::iter)
        .next()
        .map(|run| run.formats().clone()))
}
