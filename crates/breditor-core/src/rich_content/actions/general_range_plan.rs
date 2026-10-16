//! Explicit general replacement preserves original legal joins and adds protected-boundary trimming.
use super::{
    ReplaceCoveredRange, ReplaceTextRange, RichAction, RichActionError, RichRangeFloor,
    RichRangeReplacementPlan,
};
use crate::{
    document::TextFragment,
    rich_content::{BlockId, RichDocument, RichSelection, RichTextPoint},
};

/// Observable native choice; callers must not infer a join from visual adjacency.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichGeneralRangeKind {
    /// Existing same-block, sibling-flow or ordinary-list-head join semantics.
    Joined,
    /// Independent boundary blocks and partial structural owners remain in place.
    PreservedBoundaries,
}
#[derive(Clone, Debug)]
enum Plan {
    Joined(ReplaceTextRange),
    Covered(RichRangeReplacementPlan),
}
/// A complete native general-range plan with explicit fresh-floor requirements.
#[derive(Clone, Debug)]
pub struct RichGeneralRangePlan(Plan);
impl RichGeneralRangePlan {
    /// Preserve the original action whenever it supports the range; only its explicit
    /// unsupported-flow result selects the general coverage planner. Other failures propagate.
    /// # Errors
    /// Rejects stale/non-text sources and invalid ranges or internal invariants.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        inserted: &TextFragment,
    ) -> Result<Self, RichActionError> {
        let plan = match ReplaceTextRange::capture(document, selection, inserted) {
            Ok(action) => Plan::Joined(action),
            Err(RichActionError::FlowRange) => {
                Plan::Covered(RichRangeReplacementPlan::capture(document, selection, inserted)?)
            }
            Err(error) => return Err(error),
        };
        Ok(Self(plan))
    }
    /// Exact native structural policy selected for this immutable source.
    #[must_use]
    pub const fn kind(&self) -> RichGeneralRangeKind {
        match self.0 {
            Plan::Joined(_) => RichGeneralRangeKind::Joined,
            Plan::Covered(_) => RichGeneralRangeKind::PreservedBoundaries,
        }
    }
    /// Fresh paragraph requirements. Original joins allocate no new structural identities.
    #[must_use]
    pub fn empty_blocks(&self) -> &[RichRangeFloor] {
        match &self.0 {
            Plan::Joined(_) => &[],
            Plan::Covered(plan) => plan.empty_blocks(),
        }
    }
    /// Read the coverage plan only when boundaries are preserved, never re-plan in JavaScript.
    #[must_use]
    pub const fn covered(&self) -> Option<&RichRangeReplacementPlan> {
        match &self.0 {
            Plan::Joined(_) => None,
            Plan::Covered(plan) => Some(plan),
        }
    }
    /// Collapsed forward caret after the admitted replacement.
    /// # Errors
    /// Rejects offset overflow.
    pub fn insertion_end(&self) -> Result<RichTextPoint, RichActionError> {
        match &self.0 {
            Plan::Joined(action) => Ok(action.insertion_end().clone()),
            Plan::Covered(plan) => plan.insertion_end(),
        }
    }
    /// Capture one native action using exactly the requested fresh floor IDs.
    /// # Errors
    /// Rejects wrong floor counts, duplicate/source IDs or internal construction errors.
    pub fn action(&self, empty_blocks: &[BlockId]) -> Result<RichAction, RichActionError> {
        match &self.0 {
            Plan::Joined(action) => {
                if !empty_blocks.is_empty() {
                    return Err(RichActionError::RangeFloorIds);
                }
                Ok(RichAction::ReplaceTextRange(action.clone()))
            }
            Plan::Covered(plan) => Ok(RichAction::ReplaceCoveredRange(
                ReplaceCoveredRange::capture(plan, empty_blocks)?,
            )),
        }
    }
}
