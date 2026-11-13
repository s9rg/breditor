//! Document-bound read-only continuation of independent comment history.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::ReviewObservation;

impl RichReplica {
    /// Continue the exact V1 comment archive without changing the document or current access.
    /// # Errors
    /// Either stale guard, retained anchor, policy, generation identity or budget rejects.
    pub fn continue_read_only_review_history_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), Error> {
        self.check(document)?;
        review.check(observed)?;
        self.check_review_session(review)?;
        Ok(review.continue_read_only_history_guarded(observed, next)?)
    }
}
