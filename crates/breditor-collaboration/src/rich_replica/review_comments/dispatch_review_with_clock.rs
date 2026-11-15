//! Compose exact comment intent admission with the existing native anchor rules.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::{
    ReviewObservation, ReviewOutcome, ReviewWriterClock, actions::ReviewAction,
};

impl RichReplica {
    /// Stage one comment against both current publications and return its exact new prefix.
    ///
    /// # Errors
    /// Any ordinary anchor, metadata, observation or policy refusal leaves both owners unchanged.
    pub fn preview_review_action_clock_guarded(
        &self,
        document: &SharedObservation,
        review: &ReviewSession,
        observed: &ReviewObservation,
        action: ReviewAction,
    ) -> Result<Option<ReviewWriterClock>, Error> {
        self.check_review_action(document, review, &action)?;
        Ok(review.preview_action_clock(observed, action)?)
    }

    /// Apply an ordinary live comment only when its full staged event matches the expected prefix.
    ///
    /// # Errors
    /// Ordinary admission failures and prefix mismatches leave both owners unchanged.
    pub fn dispatch_review_with_clock_guarded(
        &self,
        document: &SharedObservation,
        review: &mut ReviewSession,
        observed: &ReviewObservation,
        action: ReviewAction,
        expected: &ReviewWriterClock,
    ) -> Result<ReviewOutcome, Error> {
        self.check_review_action(document, review, &action)?;
        Ok(review.dispatch_with_clock(observed, action, expected)?)
    }
}
