//! Stable list/item reads and canonical branch rebuilding shared by list actions.

use super::{RichActionError, text_patch::block_node};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument, RichListKind, ast_properties},
};

pub(super) fn id(node: &NodeRef) -> Result<BlockId, RichActionError> {
    BlockId::try_new(
        ast_properties::string(node.as_element().ok_or(RichActionError::ListShape)?, "block-id")
            .map_err(|_| RichActionError::Rewrite)?,
    )
    .map_err(|_| RichActionError::Rewrite)
}
pub(super) fn is_text(node: &NodeRef) -> bool {
    node.as_element().is_some_and(|node| {
        matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading")
    })
}
pub(super) fn list_node<'a>(
    document: &'a RichDocument,
    list: &BlockId,
) -> Result<&'a NodeRef, RichActionError> {
    let node = block_node(document, list)?;
    RichListKind::from_node(node)?;
    Ok(node)
}
pub(super) fn interval(
    node: &NodeRef,
    first: &BlockId,
    last: &BlockId,
) -> Result<(usize, usize), RichActionError> {
    let node = node.as_element().ok_or(RichActionError::ListShape)?;
    let find = |target: &BlockId| {
        node.children()
            .iter()
            .position(|item| id(item).ok().as_ref() == Some(target))
            .ok_or(RichActionError::MissingTarget)
    };
    let first = find(first)?;
    let last = find(last)?;
    if first > last {
        return Err(RichActionError::ListShape);
    }
    Ok((first, last))
}
pub(super) fn children(node: &NodeRef) -> Result<&[NodeRef], RichActionError> {
    Ok(node.as_element().ok_or(RichActionError::ListShape)?.children().as_slice())
}
pub(super) fn with_children(
    node: &NodeRef,
    children: Vec<NodeRef>,
) -> Result<NodeRef, RichActionError> {
    Ok(NodeRef::element(
        node.as_element()
            .ok_or(RichActionError::ListShape)?
            .try_with_children(children)
            .map_err(|_| RichActionError::Rewrite)?,
    ))
}
