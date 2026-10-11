//! Atomic format rewrites across the depth-first text sequence of nested lists.
//!
//! One guarded root-span operation validates only the complete result. Its
//! relocation law preserves aggregate offsets through text-run reshaping.
use super::{
    flat_list_format::{collapsed_fragment, invalid_properties},
    support::{disabled, fault, fragment_range_parts, require_operation_budget, strict_relocation},
    text_block_format_request::FormatRequest,
};
use crate::{
    action::{
        ActionDecision, ActionEvaluation, ActionFault, ActionPlan,
        text_position::{TextRangeSelection, normalize_nested_list_range_selection},
    },
    document::{Document, NodeRef, TextFragment, TextRun},
    operation::{NestedListFormatRewrite, NestedListFormatRewriteError, Operation, TextRange},
    position::{NodePath, TextOffset},
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
pub(super) fn capture_selection(
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
        if !subtree_intersects_range(&path, start, end) {
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
            let children = element.children();
            let indexes = selected_child_indexes(&path, start, end, children.len())?;
            for (index, child) in
                children.iter().enumerate().take(indexes.end).skip(indexes.start).rev()
            {
                let index =
                    u32::try_from(index).map_err(|_| fault("breditor/nested-format-path-fault"))?;
                let child_path = path
                    .try_child(index)
                    .map_err(|_| fault("breditor/nested-format-path-fault"))?;
                if subtree_intersects_range(&child_path, start, end) {
                    stack.push((child_path, child.clone()));
                }
            }
        }
    }
    Ok((spans, selected))
}

/// Lexical paths are depth-first ordered. A subtree before the start can contain
/// selected blocks only when its path is an ancestor of that start. The admitted
/// document and normalized range remain authoritative; no proof or fragment is
/// cached. In particular, do not prune ancestors merely because they sort first.
pub(super) fn subtree_intersects_range(path: &NodePath, start: &NodePath, end: &NodePath) -> bool {
    path <= end && (path >= start || start.as_slice().starts_with(path.as_slice()))
}

/// Bounds the direct children of an intersecting ancestor before allocating
/// their paths. Sibling subtrees outside this interval cannot contain a selected
/// text block. Ancestors of an endpoint retain its next path component; interior
/// containers retain every child. This does not infer or widen text selection.
pub(super) fn selected_child_indexes(
    path: &NodePath,
    start: &NodePath,
    end: &NodePath,
    count: usize,
) -> Result<std::ops::Range<usize>, ActionFault> {
    let next = |endpoint: &NodePath| -> Result<Option<usize>, ActionFault> {
        if !endpoint.as_slice().starts_with(path.as_slice()) {
            return Ok(None);
        }
        endpoint
            .as_slice()
            .get(path.as_slice().len())
            .map(|index| {
                usize::try_from(*index).map_err(|_| fault("breditor/nested-format-path-fault"))
            })
            .transpose()
    };
    let first = next(start)?.unwrap_or(0).min(count);
    let stop = next(end)?.map_or(count, |index| index.saturating_add(1).min(count));
    Ok(first..stop)
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
    let mut replacements = std::collections::BTreeMap::new();
    for (span, source) in spans.into_iter().zip(selected) {
        let Some(replacement) = rewrite.fragment(state, &source)? else {
            return Ok(disabled_result("breditor/result-limit-exceeded"));
        };
        if replacement == source {
            continue;
        }
        let path = span.container_path();
        let whole = at(state.document(), path)?;
        let (prefix, _, suffix) = fragment_range_parts(&whole, span.start(), span.end())?;
        let Some(result) = super::insert_text::concat_result(&prefix, &replacement, &suffix)?
        else {
            return Ok(disabled_result("breditor/result-limit-exceeded"));
        };
        let node = state
            .document()
            .node_at(path)
            .map_err(|_| fault("breditor/nested-format-path-fault"))?
            .as_element()
            .ok_or_else(|| fault("breditor/nested-format-block-fault"))?;
        let children =
            result.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
        replacements.insert(
            path.clone(),
            NodeRef::element(
                node.try_with_children(children)
                    .map_err(|_| fault("breditor/nested-format-block-fault"))?,
            ),
        );
    }
    if replacements.is_empty() {
        return Ok(disabled_result("breditor/inline-format-unchanged"));
    }
    let decision = plan(state, start.as_slice()[0], end.as_slice()[0], &replacements)?;
    Ok(ActionEvaluation::new(decision, indicator))
}

/// Admit a complete root-span rewrite only after all selected blocks are rebuilt.
fn plan(
    state: &EditorState,
    first: u32,
    last: u32,
    replacements: &std::collections::BTreeMap<NodePath, NodeRef>,
) -> Result<ActionDecision, ActionFault> {
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }
    let mut roots = Vec::new();
    for index in first..=last {
        let path = NodePath::try_from_indices(vec![index])
            .map_err(|_| fault("breditor/nested-format-path-fault"))?;
        roots.push(rebuild(
            state
                .document()
                .node_at(&path)
                .map_err(|_| fault("breditor/nested-format-path-fault"))?,
            &path,
            replacements,
        )?);
    }
    let count =
        u32::try_from(roots.len()).map_err(|_| fault("breditor/nested-format-path-fault"))?;
    let operation =
        NestedListFormatRewrite::capture(state.context(), state.document(), first, count, roots)
            .and_then(|op| {
                op.apply(state.context(), state.document())?;
                Ok(op)
            });
    let operation = match operation {
        Ok(op) => op,
        Err(
            NestedListFormatRewriteError::Validation(_)
            | NestedListFormatRewriteError::RootChildLimit,
        ) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(_) => return Err(fault("breditor/nested-format-plan-fault")),
    };
    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::NestedListFormatRewrite(operation)],
        strict_relocation(),
        SelectionUpdate::Relocate,
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}

/// Rebuild each selected ancestor once; paths come from a validated document and
/// are bounded by `NodePath`'s maximum depth. Unselected text blocks are shared.
fn rebuild(
    node: &NodeRef,
    path: &NodePath,
    replacements: &std::collections::BTreeMap<NodePath, NodeRef>,
) -> Result<NodeRef, ActionFault> {
    if let Some(replacement) = replacements.get(path) {
        return Ok(replacement.clone());
    }
    let element = node.as_element().ok_or_else(|| fault("breditor/nested-format-block-fault"))?;
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        return Ok(node.clone());
    }
    let children = element
        .children()
        .iter()
        .enumerate()
        .map(|(index, child)| {
            let index =
                u32::try_from(index).map_err(|_| fault("breditor/nested-format-path-fault"))?;
            let path =
                path.try_child(index).map_err(|_| fault("breditor/nested-format-path-fault"))?;
            rebuild(child, &path, replacements)
        })
        .collect::<Result<Vec<_>, _>>()?;
    element
        .try_with_children(children)
        .map(NodeRef::element)
        .map_err(|_| fault("breditor/nested-format-block-fault"))
}
