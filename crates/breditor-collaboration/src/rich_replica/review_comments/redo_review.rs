//! Comment Redo reinstates the original contribution without overwriting a newer peer value.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::{ReviewObservation, ReviewOutcome};
impl RichReplica {
    /// Restore this writer's original contribution without assigning it a newer overwrite priority.
    /// # Errors
    /// Exact guards, native anchors and live permissions are checked before history publication.
    pub fn redo_review_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
    ) -> Result<ReviewOutcome, Error> {
        self.check(document)?;
        self.check_review_session(review)?;
        Ok(review.redo(observed)?)
    }
}
