//! Atomic format rewrites across the depth-first text sequence of nested lists.
//!
//! Each splice is captured against the preceding preview, because sibling blocks
//! can share a complete root guard. No structural node is removed or reparented.
//! Logical endpoints are rebuilt explicitly: generic replacement relocation would
//! collapse positions inside a rewritten run even though formatting retains text.
use super::{
    flat_list_format::{collapsed_fragment, invalid_properties},
    support::{disabled, fault, fragment_range_parts, require_operation_budget, strict_relocation},
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{
        ActionDecision, ActionEvaluation, ActionFault, ActionPlan,
        text_position::{
            TextRangeSelection, normalize_nested_list_range_selection,
            point_at_nested_list_fragment_offset,
        },
    },
    document::{Document, NodeRef, TextFragment, TextRun},
    operation::{AppliedOperation, NestedListTextSplice, Operation, TextRange},
    position::{NodePath, TextOffset},
    selection::{RangeOrder, RangeSelection, Selection},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

fn fragment(node: &NodeRef) -> Result<TextFragment, ActionFault> {
    let runs = node
        .as_element()
        .ok_or_else(|| fault("breditor/nested-format-block-fault"))?
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(TextRun::from_text_node)
                .ok_or_else(|| fault("breditor/nested-format-text-fault"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    TextFragment::try_from_runs(runs).map_err(|_| fault("breditor/nested-format-fragment-fault"))
}

fn at(document: &Document, path: &NodePath) -> Result<TextFragment, ActionFault> {
    fragment(document.node_at(path).map_err(|_| fault("breditor/nested-format-path-fault"))?)
}

/// Captures only text-bearing blocks inside the admitted logical range.
fn capture_selection(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<(Vec<TextRange>, Vec<TextFragment>), ActionFault> {
    let start = range.start().paragraph_path();
    let end = range.end().paragraph_path();
    let mut stack = Vec::new();
    for root in (start.as_slice()[0]..=end.as_slice()[0]).rev() {
        let path = NodePath::try_from_indices(vec![root])
            .map_err(|_| fault("breditor/nested-format-path-fault"))?;
        stack.push((
            path.clone(),
            state
                .document()
                .node_at(&path)
                .map_err(|_| fault("breditor/nested-format-path-fault"))?
                .clone(),
        ));
    }
    let mut spans = Vec::new();
    let mut selected = Vec::new();
    while let Some((path, node)) = stack.pop() {
        if path > *end {
            continue;
        }
        let element =
            node.as_element().ok_or_else(|| fault("breditor/nested-format-block-fault"))?;
        if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
            if path < *start {
                continue;
            }
            let text = fragment(&node)?;
            let left = if path == *start { range.start().offset() } else { TextOffset::ZERO };
            let right = if path == *end { range.end().offset() } else { text.utf16_len() };
            let (_, part, _) = fragment_range_parts(&text, left, right)?;
            spans.push(
                TextRange::try_new(path, left, right)
                    .map_err(|_| fault("breditor/nested-format-range-fault"))?,
            );
            selected.push(part);
        } else {
            for (index, child) in element.children().iter().enumerate().rev() {
                let index =
                    u32::try_from(index).map_err(|_| fault("breditor/nested-format-path-fault"))?;
                stack.push((
                    path.try_child(index)
                        .map_err(|_| fault("breditor/nested-format-path-fault"))?,
                    child.clone(),
                ));
            }
        }
    }
    Ok((spans, selected))
}

pub(super) fn evaluate(
    state: &EditorState,
    request: &FormatRequest<'_>,
) -> Result<ActionEvaluation, ActionFault> {
    let unavailable = |code| ActionEvaluation::new(disabled(code), request.unavailable());
    if !state.context().schema().supports_nested_list_reframe() {
        return Ok(unavailable("breditor/unsupported-schema"));
    }
    if state.selection().is_none() {
        return Ok(unavailable("breditor/no-selection"));
    }
    if !request.supported(state) {
        return Ok(unavailable("breditor/unsupported-inline-format"));
    }
    let range = normalize_nested_list_range_selection(state)
        .map_err(|_| fault("breditor/nested-format-selection-fault"))?;
    if range.is_collapsed() {
        return collapsed_fragment(
            state,
            &range,
            request,
            &at(state.document(), range.start().paragraph_path())?,
        );
    }
    let start = range.start().paragraph_path();
    let end = range.end().paragraph_path();
    let (spans, selected) = capture_selection(state, &range)?;
    let indicator = request.indicator(&selected)?;
    if !request.valid(state) {
        return Ok(invalid_properties(&indicator));
    }
    let disabled_result = |code| ActionEvaluation::new(disabled(code), indicator.clone());
    if selected.iter().all(TextFragment::is_empty) {
        return Ok(disabled_result("breditor/no-selected-text"));
    }
    let rewrite = request.rewrite(indicator.activation());
    let mut operations = Vec::new();
    let mut document = state.document().clone();
    for (span, source) in spans.into_iter().zip(selected) {
        let Some(replacement) = rewrite.fragment(state, &source)? else {
            return Ok(disabled_result("breditor/result-limit-exceeded"));
        };
        if replacement == source {
            continue;
        }
        if let Some(decision) = require_operation_budget(state, operations.len() + 1) {
            return Ok(ActionEvaluation::new(decision, indicator));
        }
        let op = match NestedListTextSplice::capture(state.context(), &document, span, replacement)
        {
            Ok(op) => op,
            Err(error) if super::insert_nested_list_text::is_limit(&error) => {
                return Ok(disabled_result("breditor/result-limit-exceeded"));
            }
            Err(_) => return Err(fault("breditor/nested-format-capture-fault")),
        };
        match op.apply(state.context(), &document) {
            Ok(AppliedOperation::Changed(change)) => document = change.document,
            Ok(AppliedOperation::Unchanged) => continue,
            Err(error) if super::insert_nested_list_text::is_limit(&error) => {
                return Ok(disabled_result("breditor/result-limit-exceeded"));
            }
            Err(_) => return Err(fault("breditor/nested-format-preview-fault")),
        }
        operations.push(Operation::NestedListTextSplice(op));
    }
    if operations.is_empty() {
        return Ok(disabled_result("breditor/inline-format-unchanged"));
    }
    let Some(Selection::Range(original)) = state.selection() else {
        return Err(fault("breditor/nested-format-selection-fault"));
    };
    let backward = range.order() == RangeOrder::Backward;
    let (start_affinity, end_affinity) = if backward {
        (original.focus().affinity(), original.anchor().affinity())
    } else {
        (original.anchor().affinity(), original.focus().affinity())
    };
    let first = point_at_nested_list_fragment_offset(
        start,
        &at(&document, start)?,
        range.start().offset(),
        start_affinity,
    )
    .map_err(|_| fault("breditor/nested-format-selection-fault"))?;
    let last = point_at_nested_list_fragment_offset(
        end,
        &at(&document, end)?,
        range.end().offset(),
        end_affinity,
    )
    .map_err(|_| fault("breditor/nested-format-selection-fault"))?;
    let selection =
        if backward { RangeSelection::new(last, first) } else { RangeSelection::new(first, last) };
    Ok(ActionEvaluation::new(
        ActionDecision::Enabled(ActionPlan::new(
            operations,
            strict_relocation(),
            SelectionUpdate::Set(Some(selection.into())),
            PendingFormatsUpdate::Set(None),
            HistoryIntent::Record,
        )),
        indicator,
    ))
}
