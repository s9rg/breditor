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
    transform(roots, &mut |_| Ok(empty.clone()))
}

pub(super) fn build(layout: &[NodeRef], blocks: &[NodeRef]) -> Result<Vec<NodeRef>, Error> {
    if layout.is_empty() {
        return Err(Error::InvalidLayout);
    }
    let slots = nested_list_reframe::blocks(layout).map_err(|_| Error::InvalidLayout)?;
    let empty = slot()?;
    if slots.len() != blocks.len() || slots.iter().any(|(_, node)| **node != empty) {
        return Err(Error::InvalidLayout);
    }
    let mut cursor = blocks.iter();
    transform(layout, &mut |_| cursor.next().cloned().ok_or(Error::InvalidLayout))
}

// Shape traversal above proves a maximum NodePath depth before this bounded walk.
fn transform(
    roots: &[NodeRef],
    block: &mut impl FnMut(&NodeRef) -> Result<NodeRef, Error>,
) -> Result<Vec<NodeRef>, Error> {
    roots
        .iter()
        .map(|node| {
            if super::block_kind(node).is_ok() {
                return block(node);
            }
            let element = node.as_element().ok_or(Error::InvalidLayout)?;
            let children = element.children().iter().cloned().collect::<Vec<_>>();
            element
                .try_with_children(transform(&children, block)?)
                .map(NodeRef::element)
                .map_err(|_| Error::InvalidLayout)
        })
        .collect()
}
