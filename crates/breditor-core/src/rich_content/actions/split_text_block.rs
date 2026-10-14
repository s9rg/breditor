//! Split a rich flow text block, retaining left identity and an explicit fresh right ID.

use super::{
    JoinTextBlocks, RichAction, RichActionError, RichEdit,
    boundary_patch::BoundaryPatch,
    branch_patch::BranchPatch,
    flow_siblings::FlowSiblings,
    text_patch::{block_node, fragment, text_node},
};
use crate::{
    rich_content::{
        BlockId, RichBlockDraft, RichDocument, RichTextPoint, rich_text_mapping::RichBoundaryMap,
    },
    state::EditorContext,
};

/// One guarded paragraph/heading split; captions cannot acquire a second paragraph.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitTextBlock {
    pub(super) patch: BoundaryPatch,
}

impl SplitTextBlock {
    /// Split at a scalar boundary and select the new right block's explicit paragraph/heading kind.
    ///
    /// `right_heading = None` creates a paragraph. Both fragments retain exact formats.
    ///
    /// # Errors
    /// Rejects missing/wrong-kind blocks, caption parents, non-scalar boundaries or invalid ranks.
    pub fn capture(
        document: &RichDocument,
        point: &RichTextPoint,
        right: &BlockId,
        right_heading: Option<u8>,
    ) -> Result<Self, RichActionError> {
        let source = block_node(document, point.block())?;
        let (head, tail) =
            fragment(source)?.split_at(point.offset()).map_err(|_| RichActionError::TextRange)?;
        let left_node = text_node(source, &head)?;
        let right_node = if let Some(rank) = right_heading {
            RichBlockDraft::heading(right, rank, &tail)?
        } else {
            RichBlockDraft::paragraph(right, &tail)?
        }
        .into_node();
        let siblings = FlowSiblings::capture(document, point.block(), point.block())?;
        let branch = BranchPatch::Flow(
            siblings.splice(document, vec![left_node.clone(), right_node.clone()])?,
        );
        Ok(Self {
            patch: BoundaryPatch {
                branch,
                map: RichBoundaryMap {
                    left: point.block().clone(),
                    right: right.clone(),
                    offset: point.offset(),
                    joined: source.clone(),
                    left_node,
                    right_node,
                    splitting: true,
                },
            },
        })
    }
    pub(super) fn from_inverse(patch: BoundaryPatch) -> Self {
        Self { patch }
    }
    /// Publish one complete split with witnessed text relocation and exact join inverse.
    ///
    /// # Errors
    /// Rejects stale parents, reused identities, invalid resulting grammar or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(context, document, |patch| {
            RichAction::JoinTextBlocks(JoinTextBlocks::from_inverse(patch))
        })
    }
}
