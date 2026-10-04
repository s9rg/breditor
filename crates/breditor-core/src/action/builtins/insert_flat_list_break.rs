//! One atomic Enter action for bare blocks and flat bullet/numbered items.
use super::{
    InsertTextAction,
    flat_list_text_support::{ListTextBlock, capture, empty_block, result_path, shape},
    support::{collapsed_selection, disabled, fault, require_operation_budget, strict_relocation},
};
use crate::{
    action::{
        Action, ActionDecision, ActionEvaluation, ActionFault, ActionId, ActionPlan,
        ActionStateSpec, text_position::normalize_flat_list_range_selection,
    },
    block::TextBlockKind,
    identity::QualifiedName,
    operation::{
        FlatListRootShape, FlatListTextRange, FlatListTextReplace, FlatListTextReplaceError,
        Operation, block_kind,
    },
    position::{Affinity, Point},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Replaces the exact active range with a block break in the flat-list profile.
///
/// Nonempty items split within their list. Enter in a collapsed empty item exits
/// it as a bare paragraph, retaining prefix/suffix lists and original ordinals.
/// Bare headings follow the heading action: middle splits preserve rank, an
/// empty right suffix becomes a paragraph, and a collapsed empty heading becomes
/// one paragraph. Item headings use the same rank policy when splitting.
///
/// A cross-container range retains its left/right container families separately;
/// the right ordered section starts at its original endpoint item's ordinal.
/// Within one list, the original start is retained and subsequent ordinals adjust
/// to the new item count. There is no implicit merge/restart or nested-list policy.
///
/// A document-changing Enter is one guarded operation and history event. A
/// structurally unchanged replacement only moves selection and adds no undo entry.
/// The caret is at the right block start (the bare paragraph when exiting), pending
/// formats survive, and reverse selections undo exactly for recorded edits.
/// Explicit experimental registration only;
/// existing browser profiles and durable wire formats do not admit this action.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertFlatListBreakAction;

/// Returns the opt-in flat-list Enter action identity.
#[must_use]
pub fn insert_flat_list_break_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(
        "breditor/insert-flat-list-break",
    ))
}

impl Action for InsertFlatListBreakAction {
    type Input = ();
    fn state_spec() -> ActionStateSpec {
        InsertTextAction::state_spec()
    }
    fn evaluate(&self, state: &EditorState, (): &()) -> Result<ActionEvaluation, ActionFault> {
        evaluate(state).map(ActionEvaluation::stateless)
    }
}

fn evaluate(state: &EditorState) -> Result<ActionDecision, ActionFault> {
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
    let empty_caret = range.is_collapsed() && first.text.is_empty();
    let exit_item = empty_caret && first.kind.is_some();
    let exit_heading = empty_caret
        && first.kind.is_none()
        && matches!(
            block_kind(&first.node).map_err(|_| fault("breditor/list-text-source-fault"))?,
            TextBlockKind::Heading(_)
        );
    let exit = exit_item || exit_heading;
    let inserted = if exit {
        vec![empty_block(&first.node, true)?]
    } else {
        vec![
            empty_block(&first.node, false)?,
            empty_block(&last.node, range.end().offset() == last.text.utf16_len())?,
        ]
    };
    let layout = if exit_item {
        exit_layout(&first)?
    } else if exit_heading {
        vec![FlatListRootShape::TextBlock]
    } else {
        break_layout(&first, &last)?
    };
    let caret_index = first
        .item
        .checked_add(u32::from(!exit))
        .ok_or_else(|| fault("breditor/list-break-path-fault"))?;
    let operation_range = FlatListTextRange::try_new(
        range.start().paragraph_path().clone(),
        range.start().offset(),
        range.end().paragraph_path().clone(),
        range.end().offset(),
    )
    .map_err(|_| fault("breditor/list-break-range-fault"))?;
    let operation = FlatListTextReplace::capture(
        state.context(),
        state.document(),
        operation_range,
        inserted,
        layout.clone(),
    )
    .and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let operation = match operation {
        Ok(op) => op,
        Err(FlatListTextReplaceError::RootChildLimit | FlatListTextReplaceError::Validation(_)) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(FlatListTextReplaceError::OrdinalOverflow) => {
            return Ok(disabled("breditor/list-ordinal-overflow"));
        }
        Err(_) => return Err(fault("breditor/list-break-plan-fault")),
    };
    let caret = collapsed_selection(Point::Children {
        parent_path: result_path(first.root, &layout, caret_index)?,
        child_index: 0,
        affinity: Affinity::After,
    });
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextReplace(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(caret)),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        HistoryIntent::Record,
    )))
}

fn exit_layout(source: &ListTextBlock) -> Result<Vec<FlatListRootShape>, ActionFault> {
    let mut layout = Vec::new();
    if source.item > 0 {
        layout.push(shape(source.kind, 0, source.item)?);
    }
    layout.push(FlatListRootShape::TextBlock);
    let suffix =
        source.item.checked_add(1).ok_or_else(|| fault("breditor/list-break-layout-fault"))?;
    let count = source
        .items
        .checked_sub(suffix)
        .ok_or_else(|| fault("breditor/list-break-layout-fault"))?;
    if count > 0 {
        layout.push(shape(source.kind, suffix, count)?);
    }
    Ok(layout)
}

fn break_layout(
    first: &ListTextBlock,
    last: &ListTextBlock,
) -> Result<Vec<FlatListRootShape>, ActionFault> {
    if first.root == last.root {
        if first.kind.is_none() {
            return Ok(vec![FlatListRootShape::TextBlock, FlatListRootShape::TextBlock]);
        }
        let removed = last
            .item
            .checked_sub(first.item)
            .and_then(|n| n.checked_add(1))
            .ok_or_else(|| fault("breditor/list-break-layout-fault"))?;
        let items = first
            .items
            .checked_sub(removed)
            .and_then(|n| n.checked_add(2))
            .ok_or_else(|| fault("breditor/list-break-layout-fault"))?;
        return Ok(vec![shape(first.kind, 0, items)?]);
    }
    Ok(vec![
        shape(
            first.kind,
            0,
            first.item.checked_add(1).ok_or_else(|| fault("breditor/list-break-layout-fault"))?,
        )?,
        shape(
            last.kind,
            last.item,
            last.items
                .checked_sub(last.item)
                .ok_or_else(|| fault("breditor/list-break-layout-fault"))?,
        )?,
    ])
}
