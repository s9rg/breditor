//! Preserve prefix/selection/tail identity and numbering when a list is divided.

use super::{
    RichActionError,
    list_helpers::{children, id, interval},
};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichListKind},
};

pub(super) struct ListParts {
    pub(super) prefix: Option<NodeRef>,
    pub(super) selected: Vec<NodeRef>,
    pub(super) tail: Option<NodeRef>,
}

impl ListParts {
    pub(super) fn capture(
        node: &NodeRef,
        first: &BlockId,
        last: &BlockId,
        fresh_tail: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let (first, last) = interval(node, first, last)?;
        let children = children(node)?;
        let prefix = &children[..first];
        let tail = &children[last + 1..];
        let kind = RichListKind::from_node(node)?;
        let original_id = id(node)?;
        let needs_fresh = !prefix.is_empty() && !tail.is_empty();
        if fresh_tail.is_some() != needs_fresh {
            return Err(RichActionError::ListShape);
        }
        let tail_id = fresh_tail.unwrap_or(&original_id);
        Ok(Self {
            prefix: if prefix.is_empty() {
                None
            } else {
                Some(kind.node(&original_id, prefix.to_vec())?)
            },
            selected: children[first..=last].to_vec(),
            tail: if tail.is_empty() {
                None
            } else {
                Some(kind.shifted(last + 1)?.node(tail_id, tail.to_vec())?)
            },
        })
    }
}
