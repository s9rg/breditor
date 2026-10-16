//! General replacement is one guarded publication, never an intermediate selection or JS tree edit.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    rich_content::{
        BlockId, RichSelectionKind,
        actions::{RichActionError, RichGeneralRangePlan},
    },
};
impl RichLocalSession {
    /// Read the native general replacement plan under an exact current observation.
    /// Reads remain legal in read-only mode; a plan is not permission to publish.
    /// # Errors
    /// Rejects stale observations, absent/non-text selections and invalid range/source proof.
    pub fn plan_general_selection_text(
        &self,
        snapshot: &RichLocalSnapshot,
        inserted: &TextFragment,
    ) -> Result<RichGeneralRangePlan, RichLocalSessionError> {
        self.check(snapshot)?;
        Ok(RichGeneralRangePlan::capture(
            &self.state.document,
            self.state.selection.as_ref().ok_or(RichActionError::SelectionKind)?,
            inserted,
        )?)
    }
    /// Replace the complete native text range, including cross-container ranges.
    ///
    /// Original supported joins keep their semantics. Partial protected owners retain
    /// their shape; required new paragraphs use explicit durably fresh host IDs.
    /// Nonempty insertion retains its final run's pending formats. Exact before/after
    /// selection and one history unit use the existing checkpoint/replay contract.
    /// # Errors
    /// Stale/read-only, wrong floor IDs, invalid formats, limits or any late failure publish nothing.
    pub fn replace_general_selection_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        inserted: &TextFragment,
        empty_blocks: &[BlockId],
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if inserted.is_empty()
            && super::typing_state::caret(self.state.selection.as_ref()).is_some()
        {
            if !empty_blocks.is_empty() {
                return Err(RichActionError::RangeFloorIds.into());
            }
            return Ok(RichLocalOutcome::Unchanged);
        }
        let plan = self.plan_general_selection_text(snapshot, inserted)?;
        let action = plan.action(empty_blocks)?;
        let caret = plan.insertion_end()?;
        let pending = inserted.iter().next_back().map_or(RichPendingFormatsUpdate::Map, |run| {
            RichPendingFormatsUpdate::Set(Some(run.formats().clone()))
        });
        self.dispatch_with_pending_formats(
            snapshot,
            &[action],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            pending,
        )
    }
}
