//! Whole-document structured paste is one native explicit history unit with exact before-UI.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::rich_content::{
    RichClipboardFragment, RichClipboardIdAllocator, RichDocumentClipboardPlan, RichSelectionError,
    RichSelectionKind,
};
impl RichLocalSession {
    /// Paste text/flow/grid over explicit document scope with fresh typed identities and a final
    /// usable caret. This isolates typing on both sides, without an intermediate delete publication.
    /// # Errors
    /// Stale/read-only guards precede scope/allocation; wrong scope, reused IDs, clipboard/schema,
    /// resource or final selection failures retain content, pending formats and both history stacks.
    pub fn paste_document_clipboard(
        &mut self,
        snapshot: &RichLocalSnapshot,
        clipboard: &RichClipboardFragment,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !matches!(
            self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind),
            Some(RichSelectionKind::Document)
        ) {
            return Err(RichSelectionError::TargetKind.into());
        }
        let plan = RichDocumentClipboardPlan::capture(
            &self.context,
            &self.state.document,
            clipboard,
            allocator,
        )?;
        let point = plan.insertion_end().clone();
        self.dispatch_with_pending_formats(
            snapshot,
            std::slice::from_ref(plan.action()),
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
    }
}
