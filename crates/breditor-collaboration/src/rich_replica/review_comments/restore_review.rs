//! Reapply live host authority and backend cursor admission before publishing restored comments.
use super::{Error, ReviewSession, RichReplica};
use breditor_core::rich_content::review::ReviewActorPolicy;
impl RichReplica {
    /// Restore an exact separate review checkpoint, retaining pending and orphaned discussion targets.
    /// No saved role grants access and no old document/session credential is imported.
    /// # Errors
    /// Metadata recovery, binding or any retained native anchor failure returns no restored owner.
    pub fn restore_review_session(
        &self,
        policy: ReviewActorPolicy,
        checkpoint: &str,
    ) -> Result<ReviewSession, Error> {
        let review = ReviewSession::restore_json(&self.review_binding(), policy, checkpoint)?;
        self.check_review_session(&review)?;
        Ok(review)
    }
}
