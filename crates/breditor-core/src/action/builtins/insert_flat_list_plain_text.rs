//! Atomic bounded plain-text paste into the opt-in flat-list profile.
use super::{
    InsertPlainTextAction, InsertPlainTextInput,
    flat_list_text_support::{ListTextBlock, capture, first_middle_formats, result_path, shape},
    insert_plain_text::{ReplacementError, derive_result, replacement_fragments},
    insert_text_block_plain_text::{insertion_parts, replacement_block},
    support::{collapsed_selection, disabled, fault, require_operation_budget, strict_relocation},
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec,
        text_position::{normalize_flat_list_range_selection, point_at_flat_list_fragment_offset},
    },
    identity::QualifiedName,
    operation::{
        FlatListRootShape, FlatListTextRange, FlatListTextReplace, FlatListTextReplaceError,
        Operation,
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
///
/// Carets inherit pending formats then focus-affinity context; ranges inherit
/// the first selected run (including middle items), then surviving left/right
/// seams, then plain text. All inserted runs use that format set. Selection
/// collapses with Before affinity before retained suffix text; pending formats
/// are consumed. Exact replacements may be selection-only with no undo entry.
/// Complete-result/ordinal limits are checked before publication. Experimental
/// Rust registration only; existing durable/browser profiles are not widened.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertFlatListPlainTextAction;

/// Returns the explicit flat-list plain-text insertion identity.
#[must_use]
pub fn insert_flat_list_plain_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-flat-list-plain-text",
    ))
}
impl Action for InsertFlatListPlainTextAction {
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
    if !state.context().schema().supports_flat_list_operations() {
        return Ok(disabled("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(disabled("breditor/no-selection"));
    }
    let range = normalize_flat_list_range_selection(state)
        .map_err(|_| fault("breditor/list-text-position-fault"))?;
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let first = capture(state, range.start().paragraph_path())?;
    let last = capture(state, range.end().paragraph_path())?;
    let (prefix, suffix, formats) =
        insertion_parts(state, &range, &first.text, &last.text, first_middle_formats)?;
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
                Some(&first.node)
            } else if index + 1 == replacement.len() && !suffix.is_empty() {
                Some(&last.node)
            } else {
                None
            };
            replacement_block(template, fragment)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let layout = layout(&first, &last, input.paragraph_count())?;
    let caret_index = first
        .item
        .checked_add(input.paragraph_count() - 1)
        .ok_or_else(|| fault("breditor/list-paste-caret-fault"))?;
    let path = result_path(first.root, &layout, caret_index)?;
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
    let caret = point_at_flat_list_fragment_offset(
        &path,
        result.last().ok_or_else(|| fault("breditor/list-paste-result-fault"))?,
        offset,
        Affinity::Before,
    )
    .map_err(|_| fault("breditor/list-paste-caret-fault"))?;
    let operation_range = FlatListTextRange::try_new(
        range.start().paragraph_path().clone(),
        range.start().offset(),
        range.end().paragraph_path().clone(),
        range.end().offset(),
    )
    .map_err(|_| fault("breditor/list-paste-range-fault"))?;
    let op = FlatListTextReplace::capture(
        state.context(),
        state.document(),
        operation_range,
        nodes,
        layout,
    );
    plan(state, op, caret)
}

fn plan(
    state: &EditorState,
    op: Result<FlatListTextReplace, FlatListTextReplaceError>,
    caret: Point,
) -> Result<ActionDecision, ActionFault> {
    let op = op.and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let op = match op {
        Ok(op) => op,
        Err(FlatListTextReplaceError::RootChildLimit | FlatListTextReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(FlatListTextReplaceError::OrdinalOverflow) => {
            return Ok(disabled("breditor/list-ordinal-overflow"));
        }
        Err(_) => return Err(fault("breditor/list-paste-plan-fault")),
    };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextReplace(op)],
        strict_relocation(),
        SelectionUpdate::Set(Some(collapsed_selection(caret))),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}

/// All inserted lines inherit the start container. Retained endpoint-list
/// suffixes in another root keep their original ordinals; no implicit merging.
fn layout(
    first: &ListTextBlock,
    last: &ListTextBlock,
    inserted: u32,
) -> Result<Vec<FlatListRootShape>, ActionFault> {
    let mut result = if first.kind.is_none() {
        vec![
            FlatListRootShape::TextBlock;
            usize::try_from(inserted).map_err(|_| fault("breditor/list-paste-layout-fault"))?
        ]
    } else {
        let retained = if first.root == last.root {
            last.item
                .checked_sub(first.item)
                .and_then(|n| n.checked_add(1))
                .and_then(|n| first.items.checked_sub(n))
        } else {
            Some(first.item)
        }
        .ok_or_else(|| fault("breditor/list-paste-layout-fault"))?;
        let count = retained
            .checked_add(inserted)
            .ok_or_else(|| fault("breditor/list-paste-layout-fault"))?;
        vec![shape(first.kind, 0, count)?]
    };
    if first.root != last.root {
        let suffix =
            last.item.checked_add(1).ok_or_else(|| fault("breditor/list-paste-layout-fault"))?;
        let count = last
            .items
            .checked_sub(suffix)
            .ok_or_else(|| fault("breditor/list-paste-layout-fault"))?;
        if count > 0 {
            result.push(shape(last.kind, suffix, count)?);
        }
    }
    Ok(result)
}
