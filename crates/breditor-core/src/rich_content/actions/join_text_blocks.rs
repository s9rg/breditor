//! Join two adjacent flow text blocks without crossing media or flattening their formats.

use super::{
    RichAction, RichActionError, RichEdit, SplitTextBlock,
    boundary_patch::BoundaryPatch,
    branch_patch::BranchPatch,
    flow_siblings::FlowSiblings,
    text_patch::{block_node, fragment, text_node},
};
use crate::{
    rich_content::{BlockId, RichDocument, rich_text_mapping::RichBoundaryMap},
    state::EditorContext,
};

/// One exact guarded sibling join; the left block's identity/kind survive.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JoinTextBlocks {
    pub(super) patch: BoundaryPatch,
}

impl JoinTextBlocks {
    /// Join adjacent paragraphs/headings in one flow parent, retaining canonical text and formats.
    ///
    /// # Errors
    /// Rejects absent/non-text blocks, different parents or nonadjacent boundaries.
    pub fn capture(
        document: &RichDocument,
        left: &BlockId,
        right: &BlockId,
    ) -> Result<Self, RichActionError> {
        let siblings = FlowSiblings::capture(document, left, right)?;
        if siblings.last != siblings.first + 1 {
            return Err(RichActionError::FlowRange);
        }
        let left_node = block_node(document, left)?;
        let right_node = block_node(document, right)?;
        let head = fragment(left_node)?;
        let text =
            head.try_concat(&fragment(right_node)?).map_err(|_| RichActionError::TextPrimitive)?;
        let joined = text_node(left_node, &text)?;
        let branch = BranchPatch::Flow(siblings.splice(document, vec![joined.clone()])?);
        Ok(Self {
            patch: BoundaryPatch {
                branch,
                map: RichBoundaryMap {
                    left: left.clone(),
                    right: right.clone(),
                    offset: head.utf16_len(),
                    joined,
                    left_node: left_node.clone(),
                    right_node: right_node.clone(),
                    splitting: false,
                },
            },
        })
    }
    pub(super) fn from_inverse(patch: BoundaryPatch) -> Self {
        Self { patch }
    }
    /// Publish one join and exact split restoration, including original kinds and IDs.
    ///
    /// # Errors
    /// Rejects stale parents, invalid resulting grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document, |patch| {
            RichAction::SplitTextBlock(SplitTextBlock::from_inverse(patch))
        })
    }
}
