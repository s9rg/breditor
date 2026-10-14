//! Atomic sibling-list range replacement: selected first tails vanish, last tails survive.

use super::{
    RichActionError, branch_patch::BranchPatch, node_patch::NodePatch,
    replace_text_range::removed_text,
};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument, RichTextPoint, ast_properties},
};

pub(super) fn capture(
    document: &RichDocument,
    start: &RichTextPoint,
    end: &RichTextPoint,
    head: NodeRef,
) -> Result<(BranchPatch, Vec<(BlockId, NodeRef)>), RichActionError> {
    let first = document.block_path(start.block()).ok_or(RichActionError::MissingTarget)?;
    let last = document.block_path(end.block()).ok_or(RichActionError::MissingTarget)?;
    if first.last_index() != Some(0) || last.last_index() != Some(0) {
        return Err(RichActionError::FlowRange);
    }
    let first_item = first.parent().ok_or(RichActionError::FlowRange)?;
    let last_item = last.parent().ok_or(RichActionError::FlowRange)?;
    let path = first_item.parent().ok_or(RichActionError::FlowRange)?;
    if last_item.parent().as_ref() != Some(&path) {
        return Err(RichActionError::FlowRange);
    }
    let container = document
        .document()
        .node_at(&path)
        .ok()
        .and_then(NodeRef::as_element)
        .ok_or(RichActionError::FlowRange)?;
    if !matches!(container.kind().as_str(), "breditor/bullet-list" | "breditor/ordered-list") {
        return Err(RichActionError::FlowRange);
    }
    let a = usize::try_from(first_item.last_index().ok_or(RichActionError::Rewrite)?)
        .map_err(|_| RichActionError::Rewrite)?;
    let b = usize::try_from(last_item.last_index().ok_or(RichActionError::Rewrite)?)
        .map_err(|_| RichActionError::Rewrite)?;
    if a >= b {
        return Err(RichActionError::FlowRange);
    }
    let leading = container
        .children()
        .get(a)
        .and_then(NodeRef::as_element)
        .ok_or(RichActionError::Rewrite)?;
    let trailing = container
        .children()
        .get(b)
        .and_then(NodeRef::as_element)
        .ok_or(RichActionError::Rewrite)?;
    let mut removed = Vec::new();
    for child in leading.children().iter().skip(1) {
        removed_text(child, &mut removed)?;
    }
    for child in container.children().iter().skip(a + 1).take(b - a - 1) {
        removed_text(child, &mut removed)?;
    }
    let mut body = vec![head];
    body.extend(trailing.children().iter().skip(1).cloned());
    let item =
        NodeRef::element(leading.try_with_children(body).map_err(|_| RichActionError::Rewrite)?);
    let mut items = container.children().to_vec();
    items.splice(a..=b, vec![item]);
    let replacement =
        NodeRef::element(container.try_with_children(items).map_err(|_| RichActionError::Rewrite)?);
    let id = BlockId::try_new(
        ast_properties::string(container, "block-id").map_err(|_| RichActionError::Rewrite)?,
    )
    .map_err(|_| RichActionError::Rewrite)?;
    Ok((BranchPatch::Node(NodePatch::capture(document, &id, replacement)?), removed))
}
