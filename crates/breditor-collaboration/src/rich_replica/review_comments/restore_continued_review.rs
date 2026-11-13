//! Separate native comment-family recovery with actual document/anchor validation.
use super::{Error, ReviewSession, RichReplica};
use breditor_core::rich_content::review::ReviewActorPolicy;
impl RichReplica {
    /// Restore continued comment generations with fresh policy and the actual matching document.
    /// Pending/orphaned targets remain explicit; retained anchors needed by future Redo are checked.
    /// # Errors
    /// Native family, identity, event/history, file, budget or document-anchor failures return no owner.
    pub fn restore_continued_review_session(
        &self,
        policy: ReviewActorPolicy,
        checkpoint: &str,
    ) -> Result<ReviewSession, Error> {
        let review =
            ReviewSession::restore_continued_json(&self.review_binding(), policy, checkpoint)?;
        self.check_review_session(&review)?;
        Ok(review)
    }
}
