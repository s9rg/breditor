//! Predict and enforce the exact new prefix for an explicitly retained comment intent.
use super::{
    ReviewError, ReviewObservation, ReviewOutcome, ReviewSession, ReviewWriterClock,
    actions::ReviewAction,
};

impl ReviewSession {
    /// Return the actual new writer prefix after staged admission, without publishing.
    ///
    /// # Errors
    /// Uses the same policy, observation and history checks as ordinary dispatch.
    pub fn preview_action_clock(
        &self,
        observed: &ReviewObservation,
        action: ReviewAction,
    ) -> Result<Option<ReviewWriterClock>, ReviewError> {
        self.stage_action(observed, action)?
            .map(|(candidate, _)| candidate.local_writer_clock())
            .transpose()
    }

    /// Publish only if the entire staged original event matches the retained prefix.
    ///
    /// # Errors
    /// A nonmatching or no-op event, stale observation or failed ordinary admission leaves the owner intact.
    pub fn dispatch_with_clock(
        &mut self,
        observed: &ReviewObservation,
        action: ReviewAction,
        expected: &ReviewWriterClock,
    ) -> Result<ReviewOutcome, ReviewError> {
        let Some((candidate, id)) = self.stage_action(observed, action)? else {
            return Err(ReviewError::Contract("expected an authored review event"));
        };
        if candidate.local_writer_clock()? != *expected {
            return Err(ReviewError::Contract("review action prefix differs"));
        }
        self.adopt(candidate);
        Ok(ReviewOutcome::Committed(id))
    }
}
