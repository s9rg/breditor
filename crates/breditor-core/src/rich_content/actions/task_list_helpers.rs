//! Strict task-container reads; ordinary list contracts are never widened implicitly.
use super::{RichActionError, text_patch::block_node};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument},
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
