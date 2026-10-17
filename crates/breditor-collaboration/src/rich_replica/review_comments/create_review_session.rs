//! Create a separately owned comment lane under this exact admitted document/profile.
use super::{Error, ReviewSession, RichReplica};
use breditor_core::rich_content::review::ReviewActorPolicy;
impl RichReplica {
    /// Create empty comments without editing accepted content, selection or document history.
    /// The authenticated host owns actor leasing and principal permissions independently.
    /// # Errors
    /// Invalid review binding rejects; no document or network authority is inferred.
    pub fn create_review_session(&self, policy: ReviewActorPolicy) -> Result<ReviewSession, Error> {
        Ok(ReviewSession::new(self.review_binding(), policy)?)
    }
}
