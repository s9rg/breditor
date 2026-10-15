//! Preserve task-list prefix/tail identities and every selected completion value.
use super::{
    RichActionError,
    list_helpers::{children, id, interval},
    task_list_helpers::task_list,
};
use crate::{document::NodeRef, rich_content::BlockId};

pub(super) struct TaskParts {
    pub(super) prefix: Option<NodeRef>,
    pub(super) selected: Vec<NodeRef>,
    pub(super) tail: Option<NodeRef>,
}
impl TaskParts {
    pub(super) fn capture(
        source: &NodeRef,
        first: &BlockId,
        last: &BlockId,
        fresh_tail: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let (first, last) = interval(source, first, last)?;
        let items = children(source)?;
        let prefix = &items[..first];
        let tail = &items[last + 1..];
        let original_id = id(source)?;
        if fresh_tail.is_some() != (!prefix.is_empty() && !tail.is_empty()) {
            return Err(RichActionError::ListShape);
        }
        Ok(Self {
            prefix: if prefix.is_empty() {
                None
            } else {
                Some(task_list(&original_id, prefix.to_vec())?)
            },
            selected: items[first..=last].to_vec(),
            tail: if tail.is_empty() {
                None
            } else {
                Some(task_list(fresh_tail.unwrap_or(&original_id), tail.to_vec())?)
            },
        })
    }
}
