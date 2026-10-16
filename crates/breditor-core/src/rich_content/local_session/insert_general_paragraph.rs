//! One native general paragraph edit retains the real before-UI and exact local history.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::rich_content::{RichSelection, RichSelectionKind, actions::RichGeneralParagraphPlan};
impl RichLocalSession {
    /// Split retained prose after trimming general coverage; Rust selects paragraph/list/task policy.
    /// Code and captions use general plain LF input rather than this structural action.
    /// # Errors
    /// Stale/read-only, invalid targets, reused namespaces or final admission failures are atomic.
    pub fn insert_general_paragraph(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        prefix: &str,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let input = self.plan_general_range_plain_text(snapshot, target, "")?;
        let selection = RichSelection::try_new(&self.state.document, target.clone())?;
        let plan = RichGeneralParagraphPlan::capture(
            &self.context,
            &self.state.document,
            &selection,
            prefix,
        )?;
        let point = plan.insertion_end();
        self.dispatch_with_pending_formats(
            snapshot,
            plan.actions(),
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(Some(input.formats().clone())),
        )
    }
}
