//! Explicit nested container templates consuming text blocks once in document order.
//!
//! A template uses canonical empty paragraphs as block slots. List/item metadata
//! is retained exactly; actual block kinds and inline contents come from the text
//! recipe. There are no reusable indexes or hidden reparenting/numbering rules.
use super::{NestedListTextReplaceError as Error, nested_list_reframe};
use crate::{
    document::{ElementNode, NodeRef, PropertyMap},
    identity::QualifiedName,
};

fn slot() -> Result<NodeRef, Error> {
    ElementNode::try_new(
        QualifiedName::from_known_static("breditor/paragraph"),
        None,
        PropertyMap::default(),
        vec![],
    )
    .map(NodeRef::element)
    .map_err(|_| Error::InvalidLayout)
}

/// Strip block content from an already shape-checked tree, retaining all wrappers.
pub(super) fn capture(roots: &[NodeRef]) -> Result<Vec<NodeRef>, Error> {
    nested_list_reframe::blocks(roots).map_err(|_| Error::InvalidLayout)?;
    let empty = slot()?;
    transform(roots, &[], &mut |_| Ok(empty.clone()))
}

pub(super) fn build(
    layout: &[NodeRef],
    blocks: &[NodeRef],
    source: &[NodeRef],
) -> Result<Vec<NodeRef>, Error> {
    if layout.is_empty() {
        return Err(Error::InvalidLayout);
    }
    let slots = nested_list_reframe::blocks(layout).map_err(|_| Error::InvalidLayout)?;
    let empty = slot()?;
    if slots.len() != blocks.len() || slots.iter().any(|(_, node)| **node != empty) {
        return Err(Error::InvalidLayout);
    }
    let mut cursor = blocks.iter();
    transform(layout, source, &mut |_| cursor.next().cloned().ok_or(Error::InvalidLayout))
}

// Shape traversal above proves a maximum NodePath depth before this bounded walk.
fn transform(
    roots: &[NodeRef],
    source: &[NodeRef],
    block: &mut impl FnMut(&NodeRef) -> Result<NodeRef, Error>,
) -> Result<Vec<NodeRef>, Error> {
    roots
        .iter()
        .enumerate()
        .map(|(index, node)| transform_node(node, source.get(index), block))
        .collect()
}

// Same-position source nodes are reuse candidates only, not admission proofs.
// Metadata and all reconstructed children must match exactly. Structural edits
// may move nodes or change numbering; those cases receive fresh wrappers. All
// layout admission, context/result validation and inverse checks remain intact.
fn transform_node(
    node: &NodeRef,
    source: Option<&NodeRef>,
    block: &mut impl FnMut(&NodeRef) -> Result<NodeRef, Error>,
) -> Result<NodeRef, Error> {
    if super::block_kind(node).is_ok() {
        return block(node);
    }
    let element = node.as_element().ok_or(Error::InvalidLayout)?;
    let source = source.filter(|candidate| {
        candidate.as_element().is_some_and(|candidate| {
            candidate.kind() == element.kind()
                && candidate.entity_id() == element.entity_id()
                && candidate.properties() == element.properties()
        })
    });
    let children = element
        .children()
        .iter()
        .enumerate()
        .map(|(index, child)| {
            let candidate =
                source.and_then(NodeRef::as_element).and_then(|node| node.children().get(index));
            transform_node(child, candidate, block)
        })
        .collect::<Result<Vec<_>, _>>()?;
    if let Some(source) = source
        && source.as_element().is_some_and(|node| node.children().iter().eq(children.iter()))
    {
        return Ok(source.clone());
    }
    element.try_with_children(children).map(NodeRef::element).map_err(|_| Error::InvalidLayout)
}

#[cfg(test)]
#[path = "nested_list_layout_reuse_tests.rs"]
mod tests;
