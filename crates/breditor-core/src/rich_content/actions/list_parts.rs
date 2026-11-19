//! Preserve prefix/selection/tail identity and numbering when a list is divided.

use super::{
    RichActionError,
    list_helpers::{children, id, interval},
};
use crate::{
    block::OrderedListStart,
    document::NodeRef,
    rich_content::{BlockId, RichDraftError, RichListKind, list_numbering},
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
        // Both remaining parts are the same list continued: they keep its own V4
        // style and reversal, and a reversed tail continues counting down.
        let retain =
            |replacement| list_numbering::retain(node, replacement).ok_or(RichActionError::Rewrite);
        let tail_kind = || -> Result<RichListKind, RichActionError> {
            Ok(match kind {
                RichListKind::Bullet => kind,
                RichListKind::Ordered(_) => RichListKind::Ordered(
                    list_numbering::continuation_start(
                        node.as_element().ok_or(RichActionError::ListShape)?,
                        last + 1,
                    )
                    .and_then(|start| OrderedListStart::try_new(start).ok())
                    .ok_or(RichDraftError::ListOrdinal)?,
                ),
            })
        };
        Ok(Self {
            prefix: if prefix.is_empty() {
                None
            } else {
                Some(retain(kind.node(&original_id, prefix.to_vec())?)?)
            },
            selected: children[first..=last].to_vec(),
            tail: if tail.is_empty() {
                None
            } else {
                Some(retain(tail_kind()?.node(tail_id, tail.to_vec())?)?)
            },
        })
    }
}
