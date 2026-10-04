//! Flat-list boundary traversal, first-item lifting and atomic text joins.
use super::{
    delete_flat_list_support::{Deletion, seam},
    flat_list_support::list_kind,
    flat_list_text_support::{
        ListTextBlock, capture, empty_block, joined_layout, result_path, shape,
    },
    support::{collapsed_selection, disabled, fault, strict_relocation},
};
use crate::{
    action::{
        ActionDecision, ActionFault, ActionPlan, text_position::point_at_flat_list_fragment_offset,
    },
    operation::{
        FlatListRootShape, FlatListTextRange, FlatListTextReplace, FlatListTextReplaceError,
        Operation,
    },
    position::{Affinity, NodePath, TextOffset},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

pub(super) fn boundary(
    state: &EditorState,
    path: &NodePath,
    source: &ListTextBlock,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    if matches!(direction, Deletion::Backward) && source.kind.is_some() && source.item == 0 {
        return lift_first(state, path, source);
    }
    let previous = matches!(direction, Deletion::Backward);
    let Some(other) = neighbor(state, source, previous)? else {
        return Ok(disabled(if previous {
            "breditor/at-document-start"
        } else {
            "breditor/at-document-end"
        }));
    };
    let range = if previous {
        let left = capture(state, &other)?;
        FlatListTextRange::try_new(other, left.text.utf16_len(), path.clone(), TextOffset::ZERO)
    } else {
        FlatListTextRange::try_new(path.clone(), source.text.utf16_len(), other, TextOffset::ZERO)
    }
    .map_err(|_| fault("breditor/list-delete-range-fault"))?;
    delete(state, &range, direction)
}

/// A neighbor is an actual text block: an adjacent item or the first/last block
/// in an adjacent root container. Never expose flattened indexes to the operation.
fn neighbor(
    state: &EditorState,
    source: &ListTextBlock,
    previous: bool,
) -> Result<Option<NodePath>, ActionFault> {
    let item = if previous {
        source.item.checked_sub(1)
    } else {
        source.item.checked_add(1).filter(|i| *i < source.items)
    };
    if source.kind.is_some()
        && let Some(item) = item
    {
        return path(vec![source.root, item, 0]).map(Some);
    }
    let root = if previous { source.root.checked_sub(1) } else { source.root.checked_add(1) };
    let Some(root) = root else {
        return Ok(None);
    };
    let children = state
        .document()
        .root()
        .as_element()
        .ok_or_else(|| fault("breditor/list-text-source-fault"))?
        .children();
    let Some(node) =
        children.get(usize::try_from(root).map_err(|_| fault("breditor/list-delete-path-fault"))?)
    else {
        return Ok(None);
    };
    let indices = if list_kind(node)?.is_some() {
        let count = node
            .as_element()
            .ok_or_else(|| fault("breditor/list-text-source-fault"))?
            .children()
            .len();
        let item = if previous {
            u32::try_from(
                count.checked_sub(1).ok_or_else(|| fault("breditor/list-delete-path-fault"))?,
            )
            .map_err(|_| fault("breditor/list-delete-path-fault"))?
        } else {
            0
        };
        vec![root, item, 0]
    } else {
        vec![root]
    };
    path(indices).map(Some)
}
fn path(indices: Vec<u32>) -> Result<NodePath, ActionFault> {
    NodePath::try_from_indices(indices).map_err(|_| fault("breditor/list-delete-path-fault"))
}

pub(super) fn delete(
    state: &EditorState,
    range: &FlatListTextRange,
    direction: Deletion,
) -> Result<ActionDecision, ActionFault> {
    let first = capture(state, range.start_path())?;
    let last = capture(state, range.end_path())?;
    let (prefix, _) = first
        .text
        .split_at(range.start_offset())
        .map_err(|_| fault("breditor/list-delete-range-fault"))?;
    let (_, suffix) = last
        .text
        .split_at(range.end_offset())
        .map_err(|_| fault("breditor/list-delete-range-fault"))?;
    let Ok(result) = prefix.try_concat(&suffix) else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let layout = joined_layout(&first, &last)?;
    let path = result_path(first.root, &layout, first.item)?;
    let op = FlatListTextReplace::capture(
        state.context(),
        state.document(),
        range.clone(),
        vec![empty_block(&first.node, false)?],
        layout,
    );
    let (offset, affinity, history) = seam(&result, range.start_offset(), direction)?;
    let caret = point_at_flat_list_fragment_offset(&path, &result, offset, affinity)
        .map_err(|_| fault("breditor/list-delete-caret-fault"))?;
    plan(state, op, caret, history)
}

fn lift_first(
    state: &EditorState,
    path: &NodePath,
    source: &ListTextBlock,
) -> Result<ActionDecision, ActionFault> {
    let mut layout = vec![FlatListRootShape::TextBlock];
    let count =
        source.items.checked_sub(1).ok_or_else(|| fault("breditor/list-delete-layout-fault"))?;
    if count > 0 {
        layout.push(shape(source.kind, 1, count)?);
    }
    let range =
        FlatListTextRange::try_new(path.clone(), TextOffset::ZERO, path.clone(), TextOffset::ZERO)
            .map_err(|_| fault("breditor/list-delete-range-fault"))?;
    let op = FlatListTextReplace::capture(
        state.context(),
        state.document(),
        range,
        vec![empty_block(&source.node, false)?],
        layout,
    );
    let path = self::path(vec![source.root])?;
    let caret =
        point_at_flat_list_fragment_offset(&path, &source.text, TextOffset::ZERO, Affinity::After)
            .map_err(|_| fault("breditor/list-delete-caret-fault"))?;
    plan(state, op, caret, HistoryIntent::Record)
}

fn plan(
    state: &EditorState,
    op: Result<FlatListTextReplace, FlatListTextReplaceError>,
    caret: crate::position::Point,
    history: HistoryIntent,
) -> Result<ActionDecision, ActionFault> {
    let op = op.and_then(|op| {
        op.apply(state.context(), state.document())?;
        Ok(op)
    });
    let op = match op {
        Ok(op) => op,
        Err(FlatListTextReplaceError::Validation(_) | FlatListTextReplaceError::RootChildLimit) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(FlatListTextReplaceError::OrdinalOverflow) => {
            return Ok(disabled("breditor/list-ordinal-overflow"));
        }
        Err(_) => return Err(fault("breditor/list-delete-plan-fault")),
    };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::FlatListTextReplace(op)],
        strict_relocation(),
        SelectionUpdate::Set(Some(collapsed_selection(caret))),
        PendingFormatsUpdate::Set(state.pending_formats().cloned()),
        history,
    )))
}
