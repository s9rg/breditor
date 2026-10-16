//! Explicit plain general range input retains native style and actual before-selection.
use super::{
    RichGeneralPlainRangePlan, RichLocalOutcome, RichLocalSession, RichLocalSessionError,
    RichLocalSnapshot, RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::rich_content::{BlockId, RichSelectionKind, actions::RichActionError};
impl RichLocalSession {
    /// Replace an explicit general target using the same native style policy as original plain input.
    /// # Errors
    /// Stale/read-only, invalid input/IDs, final admission or history limits publish nothing.
    pub fn replace_general_range_plain_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        text: &str,
        empty: &[BlockId],
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let plan = self.plan_general_range_plain_text(snapshot, target, text)?;
        self.publish_general_plain(snapshot, plan, empty)
    }
    pub(super) fn publish_general_plain(
        &mut self,
        snapshot: &RichLocalSnapshot,
        plan: RichGeneralPlainRangePlan,
        empty: &[BlockId],
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        if plan.collapsed && plan.inserted().is_empty() {
            if !empty.is_empty() {
                return Err(RichActionError::RangeFloorIds.into());
            }
            return Ok(RichLocalOutcome::Unchanged);
        }
        let caret = plan.range.insertion_end()?;
        self.dispatch_with_pending_formats(
            snapshot,
            &[plan.range.action(empty)?],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(Some(plan.formats)),
        )
    }
}
