//! Native structured paste into a general text range, published as one exact local history unit.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::rich_content::{
    BlockId, RichClipboardFragment, RichClipboardIdAllocator, RichSelection, RichSelectionKind,
    actions::RichGeneralFlowPastePlan,
};
impl RichLocalSession {
    /// Decode-free native paste of an admitted flow/grid clipboard with fresh host identities.
    /// The actual current selection/pending formats, not a temporary target, are retained for Undo.
    /// # Errors
    /// Stale/read-only, clipboard kind/schema, unsupported insertion starts, fresh-ID or budget
    /// failures publish nothing. Host allocations remain consumed even when the edit is refused.
    pub fn paste_general_flow_clipboard(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        clipboard: &RichClipboardFragment,
        empty: &[BlockId],
        right: &BlockId,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let selection = RichSelection::try_new(&self.state.document, target.clone())?;
        let blocks = clipboard.flow_drafts(&self.context, allocator)?;
        let plan = RichGeneralFlowPastePlan::capture(
            &self.context,
            &self.state.document,
            &selection,
            empty,
            right,
            blocks,
        )?;
        let point = plan.insertion_end().clone();
        self.dispatch_with_pending_formats(
            snapshot,
            plan.actions(),
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
    }
}
