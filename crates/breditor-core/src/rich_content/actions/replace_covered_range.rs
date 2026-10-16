//! One admitted general-range edit, exact inverse and witnessed surviving text maps.
use super::{
    RichAction, RichActionError, RichEdit, RichRangeReplacementPlan, flow_patch::FlowPatch,
};
use crate::{
    rich_content::{
        BlockId, RichDocument, RichFlowParent, RichTextPoint, rich_text_mapping::RichTextMap,
    },
    state::EditorContext,
};

/// Remove fully covered subtrees and trim boundary text without flattening partial owners.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaceCoveredRange {
    patch: FlowPatch,
    pub(super) maps: Vec<RichTextMap>,
    caret: RichTextPoint,
    inverse_caret: RichTextPoint,
    cost: usize,
}
impl ReplaceCoveredRange {
    /// Supply exactly one fresh ID for each native floor requirement.
    ///
    /// IDs must be durably fresh in the host's namespace, including discarded history.
    /// The core rejects duplicate IDs and reuse of any source node, even a removed one.
    /// # Errors
    /// Rejects wrong/colliding floor IDs, offset overflow or an internal source invariant.
    pub fn capture(
        plan: &RichRangeReplacementPlan,
        empty_blocks: &[BlockId],
    ) -> Result<Self, RichActionError> {
        Ok(Self {
            patch: FlowPatch::rewrite_children(
                &plan.source,
                &RichFlowParent::Document,
                plan.finish(empty_blocks)?,
            )?,
            maps: plan.maps.clone(),
            caret: plan.insertion_end()?,
            inverse_caret: plan.original_end.clone(),
            cost: plan.operation_count(),
        })
    }
    /// Collapsed forward caret in the logical first block; source kinds/layout are retained.
    #[must_use]
    pub const fn insertion_end(&self) -> &RichTextPoint {
        &self.caret
    }
    /// Admit the complete final tree once, without invalid intermediate list/cell states.
    /// # Errors
    /// Rejects stale/foreign source, invalid inserted formats, duplicate IDs and active limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if self.cost
            > usize::try_from(context.max_operations_per_transaction()).unwrap_or(usize::MAX)
        {
            return Err(RichActionError::TooManyActions);
        }
        let inverse = Self {
            patch: self.patch.inverse(),
            maps: self
                .maps
                .iter()
                .rev()
                .map(RichTextMap::inverse)
                .collect::<Result<Vec<_>, _>>()?,
            caret: self.inverse_caret.clone(),
            inverse_caret: self.caret.clone(),
            cost: self.cost,
        };
        self.patch.edit(context, document, RichAction::ReplaceCoveredRange(inverse))
    }
}
