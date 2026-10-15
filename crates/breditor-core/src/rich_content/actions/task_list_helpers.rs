//! Strict task-container reads; ordinary list contracts are never widened implicitly.
use super::{RichActionError, text_patch::block_node};
use crate::{
    document::{NodeRef, PropertyValue},
    rich_content::{BlockId, RichDocument, drafts::element},
};
pub(super) fn task_list_node<'a>(
    document: &'a RichDocument,
    block: &BlockId,
) -> Result<&'a NodeRef, RichActionError> {
    let node = block_node(document, block)?;
    if node.as_element().is_none_or(|node| node.kind().as_str() != "breditor/task-list") {
        return Err(RichActionError::TaskTarget);
    }
    Ok(node)
}

pub(super) fn task_list(block: &BlockId, items: Vec<NodeRef>) -> Result<NodeRef, RichActionError> {
    Ok(element("task-list", vec![("block-id", PropertyValue::from_string(block.as_str()))], items)?)
}
