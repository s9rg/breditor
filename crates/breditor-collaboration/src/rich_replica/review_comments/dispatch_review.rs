//! Admit one comment action against both the exact document and independent review publications.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::{
    ReviewObservation, ReviewOutcome, actions::ReviewAction,
};
impl RichReplica {
    /// Publish comments only after native target admission; accepted document content is unchanged.
    /// New/reanchored targets must currently resolve. Existing orphaned discussions remain usable.
    /// Document read-only and authenticated comment rights are deliberately independent policies.
    /// # Errors
    /// Stale/foreign observations, bindings, malformed anchors, permissions and metadata limits reject.
    pub fn dispatch_review_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        action: ReviewAction,
    ) -> Result<ReviewOutcome, Error> {
        self.check(document)?;
        self.check_review_session(review)?;
        match &action {
            ReviewAction::CreateThread(a) => self.validate_new_review_anchor(&a.anchor_json)?,
            ReviewAction::ReanchorThread(a) => self.validate_new_review_anchor(&a.anchor_json)?,
            _ => {}
        }
        Ok(review.dispatch(observed, action)?)
    }
}
