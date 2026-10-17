//! Author-local comment Undo never enters the accepted document's edit history lane.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::{ReviewObservation, ReviewOutcome};
impl RichReplica {
    /// Retract only this review writer's last contribution, preserving all peers' independent work.
    /// # Errors
    /// Exact guards, native anchors and live permissions are checked before history publication.
    pub fn undo_review_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
    ) -> Result<ReviewOutcome, Error> {
        self.check(document)?;
        self.check_review_session(review)?;
        Ok(review.undo(observed)?)
    }
}
