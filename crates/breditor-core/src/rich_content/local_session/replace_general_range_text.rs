//! Explicit rich input target; one publication retains the actual pre-edit UI in history.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    rich_content::{
        BlockId, RichSelection, RichSelectionKind,
        actions::{RichActionError, RichGeneralRangePlan},
    },
};
impl RichLocalSession {
    /// Replace an explicit general text range without restaging it as the visible selection.
    /// Nonempty input sets its final run's styles; deletion maps actual pending formats.
    /// # Errors
    /// Stale/read-only, invalid target/runs/IDs, final resource or admission failures are atomic.
    pub fn replace_general_range_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        inserted: &TextFragment,
        empty: &[BlockId],
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let selection = RichSelection::try_new(&self.state.document, target.clone())?;
        if inserted.is_empty() && super::typing_state::caret(Some(&selection)).is_some() {
            if !empty.is_empty() {
                return Err(RichActionError::RangeFloorIds.into());
            }
            return Ok(RichLocalOutcome::Unchanged);
        }
        let plan = RichGeneralRangePlan::capture(&self.state.document, &selection, inserted)?;
        let caret = plan.insertion_end()?;
        let pending = inserted.iter().next_back().map_or(RichPendingFormatsUpdate::Map, |run| {
            RichPendingFormatsUpdate::Set(Some(run.formats().clone()))
        });
        self.dispatch_with_pending_formats(
            snapshot,
            &[plan.action(empty)?],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            pending,
        )
    }
}
