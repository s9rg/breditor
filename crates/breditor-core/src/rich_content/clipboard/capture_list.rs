//! Partial copy of sibling leading list text, preserving rich tails and ordinals.

use super::{RichClipboardError, capture::sliced};
use crate::{
    document::{NodeRef, PropertyInteger, PropertyValue},
    position::TextOffset,
    rich_content::{
        RichDocument, RichTextPoint,
        actions::{rewrite_properties::with_properties, text_patch},
        ast_properties,
    },
};

pub(super) fn leading_items(
    document: &RichDocument,
    start: &RichTextPoint,
    end: &RichTextPoint,
) -> Result<Vec<NodeRef>, RichClipboardError> {
    let first = document.block_path(start.block()).ok_or(RichClipboardError::Invariant)?;
    let last = document.block_path(end.block()).ok_or(RichClipboardError::Invariant)?;
    if first.last_index() != Some(0) || last.last_index() != Some(0) {
        return Err(RichClipboardError::UnsupportedRange);
    }
    let first_item = first.parent().ok_or(RichClipboardError::UnsupportedRange)?;
    let last_item = last.parent().ok_or(RichClipboardError::UnsupportedRange)?;
    let parent = first_item.parent().ok_or(RichClipboardError::UnsupportedRange)?;
    if last_item.parent().as_ref() != Some(&parent) {
        return Err(RichClipboardError::UnsupportedRange);
    }
    let container = document
        .document()
        .node_at(&parent)
        .ok()
        .and_then(NodeRef::as_element)
        .ok_or(RichClipboardError::UnsupportedRange)?;
    if !matches!(container.kind().as_str(), "breditor/bullet-list" | "breditor/ordered-list") {
        return Err(RichClipboardError::UnsupportedRange);
    }
    let a = usize::try_from(first_item.last_index().ok_or(RichClipboardError::Invariant)?)
        .map_err(|_| RichClipboardError::Invariant)?;
    let b = usize::try_from(last_item.last_index().ok_or(RichClipboardError::Invariant)?)
        .map_err(|_| RichClipboardError::Invariant)?;
    if a >= b {
        return Err(RichClipboardError::UnsupportedRange);
    }
    let mut items =
        container.children().iter().skip(a).take(b - a + 1).cloned().collect::<Vec<_>>();
    let first = items.first_mut().ok_or(RichClipboardError::Invariant)?;
    let node = first.as_element().ok_or(RichClipboardError::Invariant)?;
    let mut body = node.children().to_vec();
    let head = body.first_mut().ok_or(RichClipboardError::Invariant)?;
    *head = text_patch::text_node(
        head,
        &sliced(head, start.offset(), text_patch::fragment(head)?.utf16_len())?,
    )?;
    *first =
        NodeRef::element(node.try_with_children(body).map_err(|_| RichClipboardError::Invariant)?);
    let last = items.last_mut().ok_or(RichClipboardError::Invariant)?;
    let node = last.as_element().ok_or(RichClipboardError::Invariant)?;
    let head = node.children().get(0).ok_or(RichClipboardError::Invariant)?;
    let head = text_patch::text_node(head, &sliced(head, TextOffset::ZERO, end.offset())?)?;
    *last = NodeRef::element(
        node.try_with_children(vec![head]).map_err(|_| RichClipboardError::Invariant)?,
    );
    let node = NodeRef::element(
        container.try_with_children(items).map_err(|_| RichClipboardError::Invariant)?,
    );
    if container.kind().as_str() == "breditor/ordered-list" {
        let original = ast_properties::property(container, "start")
            .and_then(PropertyValue::as_integer)
            .ok_or(RichClipboardError::Invariant)?
            .get();
        let start = original
            .checked_add(i64::try_from(a).map_err(|_| RichClipboardError::Invariant)?)
            .ok_or(RichClipboardError::Invariant)?;
        return Ok(vec![with_properties(
            &node,
            [(
                "start",
                Some(PropertyValue::from_integer(
                    PropertyInteger::try_new(start).map_err(|_| RichClipboardError::Invariant)?,
                )),
            )],
        )?]);
    }
    Ok(vec![node])
}
