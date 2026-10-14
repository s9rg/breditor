//! Checked stable boundaries for one direct-child rich flow splice.

use super::{RichActionError, flow_patch::FlowPatch};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument, RichFlowParent},
};

pub(super) struct FlowSiblings<'a> {
    pub(super) parent: RichFlowParent,
    pub(super) first: usize,
    pub(super) last: usize,
    pub(super) children: &'a [NodeRef],
}

impl<'a> FlowSiblings<'a> {
    pub(super) fn capture(
        document: &'a RichDocument,
        first: &BlockId,
        last: &BlockId,
    ) -> Result<Self, RichActionError> {
        let first = document.block_path(first).ok_or(RichActionError::MissingTarget)?;
        let last = document.block_path(last).ok_or(RichActionError::MissingTarget)?;
        let path = first.parent().ok_or(RichActionError::FlowParent)?;
        if last.parent().as_ref() != Some(&path) {
            return Err(RichActionError::FlowRange);
        }
        let parent = RichFlowParent::at_path(document, &path).ok_or(RichActionError::FlowParent)?;
        let index = |path: &crate::position::NodePath| {
            usize::try_from(path.last_index().ok_or(RichActionError::Rewrite)?)
                .map_err(|_| RichActionError::Rewrite)
        };
        let first = index(first)?;
        let last = index(last)?;
        if first > last {
            return Err(RichActionError::FlowRange);
        }
        let children = document
            .document()
            .node_at(&path)
            .map_err(|_| RichActionError::Rewrite)?
            .as_element()
            .ok_or(RichActionError::Rewrite)?
            .children()
            .as_slice();
        Ok(Self { parent, first, last, children })
    }
    pub(super) fn splice(
        &self,
        document: &RichDocument,
        replacement: Vec<NodeRef>,
    ) -> Result<FlowPatch, RichActionError> {
        let mut children = self.children.to_vec();
        children.splice(self.first..=self.last, replacement);
        if children.is_empty() {
            return Err(RichActionError::FlowWouldBeEmpty);
        }
        FlowPatch::rewrite_children(document, &self.parent, children)
    }
}
