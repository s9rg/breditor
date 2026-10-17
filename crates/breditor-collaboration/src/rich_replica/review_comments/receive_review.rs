//! Atomic comment catchup validates opaque anchors using the real native document engine.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::{
    ReviewActorPolicy, ReviewImportOutcome, ReviewObservation,
};
impl RichReplica {
    /// Receive one host-authenticated review batch without importing document operations.
    /// Valid pending/orphaned targets are retained and later resolved, never retargeted silently.
    /// # Errors
    /// Wrong guards, document/anchor binding, source authority, forks and budgets reject atomically.
    pub fn receive_review_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        verified: &ReviewActorPolicy,
        frame: &str,
    ) -> Result<ReviewImportOutcome, Error> {
        self.check(document)?;
        self.check_review_session(review)?;
        Ok(review.receive_authorized_with_anchor_validation(
            observed,
            verified,
            frame,
            |anchor| self.validate_remote_review_anchor(anchor),
        )?)
    }
}
