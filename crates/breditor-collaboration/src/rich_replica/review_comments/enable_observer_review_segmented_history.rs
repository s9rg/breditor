//! Document-bound native lifecycle `enable_observer_review_segmented_history/1`; no document or history action is authored.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::ReviewObservation;
impl RichReplica {
    /// Retain a currently read-only, zero-authored comment lane without unlocking it.
    /// # Errors
    /// Stale/foreign document or review guards, any retained anchor, policy and native budgets reject.
    pub fn enable_observer_review_segmented_history_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        root: String,
        active: String,
    ) -> Result<(), Error> {
        self.check(document)?;
        review.check(observed)?;
        self.check_review_session(review)?;
        Ok(review.enable_observer_segmented_history_guarded(observed, root, active)?)
    }
}
