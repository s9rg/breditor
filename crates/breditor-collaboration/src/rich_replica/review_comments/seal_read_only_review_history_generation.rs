//! Document-bound `review.history.read_only_seal/1`: archive without any policy grant.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::ReviewObservation;
impl RichReplica {
    /// Seal former-author comment inputs while retaining current read-only and both history branches.
    /// # Errors
    /// Either stale/foreign guard, any retained native anchor, policy or budget failure refuses atomically.
    pub fn seal_read_only_review_history_generation_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), Error> {
        self.check(document)?;
        review.check(observed)?;
        self.check_review_session(review)?;
        Ok(review.seal_read_only_history_generation_guarded(observed, next)?)
    }
}
