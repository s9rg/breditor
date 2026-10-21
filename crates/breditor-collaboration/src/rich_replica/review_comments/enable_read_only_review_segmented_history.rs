//! Document-bound `review.history.read_only_enable/1`: no accepted-document or authoring action.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::ReviewObservation;
impl RichReplica {
    /// Retain former-author comment history under its current read-only policy.
    /// Every retained anchor is checked against this actual document, including undone inputs.
    /// # Errors
    /// Either stale/foreign guard, an invalid anchor, current policy or native limits refuse unchanged.
    pub fn enable_read_only_review_segmented_history_guarded(
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
        Ok(review.enable_read_only_segmented_history_guarded(observed, root, active)?)
    }
}
