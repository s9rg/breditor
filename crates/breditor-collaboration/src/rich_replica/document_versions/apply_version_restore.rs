//! Publish only a still-current native preview as one ordinary selective edit group.
use super::DocumentVersionRestorePlan;
use crate::{
    Error,
    rich_replica::{PendingFormatsUpdate, RichReplica, SelectionUpdate},
};
impl RichReplica {
    /// Apply the explicit preview without rewinding clocks, importing credentials or replacing review.
    /// Undo restores this writer's observed content; later peer changes retain normal selective laws.
    /// # Errors
    /// A stale/foreign plan, live read-only policy or a staged admission/recovery mismatch is atomic.
    pub fn apply_document_version_restore(
        &mut self,
        plan: &DocumentVersionRestorePlan,
    ) -> Result<bool, Error> {
        self.check(&plan.observed)?;
        self.require_writable()?;
        self.apply_with_state_inner(
            plan.commands.clone(),
            SelectionUpdate::Set(None),
            PendingFormatsUpdate::Set(None),
            None,
            Some(&plan.document),
        )
    }
}
