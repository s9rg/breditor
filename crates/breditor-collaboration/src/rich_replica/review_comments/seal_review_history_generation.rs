//! Document-bound native lifecycle `seal_review_history_generation/1`; no document or history action is authored.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::ReviewObservation;
impl RichReplica {
    /// Seal comment inputs independently of document generations, retaining native history.
    /// # Errors
    /// Stale/foreign document or review guards, any retained anchor, policy and native budgets reject.
    pub fn seal_review_history_generation_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), Error> {
        self.check(document)?;
        review.check(observed)?;
        self.check_review_session(review)?;
        Ok(review.seal_history_generation_guarded(observed, next)?)
    }
}
