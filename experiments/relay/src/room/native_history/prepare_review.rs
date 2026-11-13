//! Native replay and exact source/anchor admission for the permanently read-only server receiver.
use super::{
    NativeHistoryBoundary, ServerNativeHistoryLane, checkpoint,
    prepare::{NativeHistoryCandidate, PreparedNativeHistory},
};
use crate::{Error, Result, Room};

impl Room {
    pub(super) fn prepare_review_native_history(
        &self,
        boundary: &NativeHistoryBoundary,
    ) -> Result<PreparedNativeHistory> {
        let lane = ServerNativeHistoryLane::Review;
        let source = &self.review.as_ref().ok_or(Error::Contract("review V1 not enabled"))?.session;
        let before = checkpoint::review_checkpoint(source)?;
        let mut candidate = if source.has_continued_history() {
            self.replica
                .restore_continued_review_session(self.review_receiver_policy()?, &before)?
        } else if source.has_segmented_history() {
            self.replica
                .restore_segmented_review_session(self.review_receiver_policy()?, &before)?
        } else {
            self.replica.restore_review_session(self.review_receiver_policy()?, &before)?
        };
        if checkpoint::review_checkpoint(&candidate)? != before {
            return Err(Error::Contract("server review history candidate differs"));
        }
        let document = self.replica.observe()?;
        let observed = candidate.observe();
        match boundary {
            NativeHistoryBoundary::Enable { root, active } => {
                self.replica.enable_observer_review_segmented_history_guarded(
                    &document,
                    &mut candidate,
                    &observed,
                    root.clone(),
                    active.clone(),
                )?;
            }
            NativeHistoryBoundary::Seal { next } => {
                self.replica.seal_observer_review_history_generation_guarded(
                    &document,
                    &mut candidate,
                    &observed,
                    next.clone(),
                )?;
            }
            NativeHistoryBoundary::ContinueReview { next } => {
                self.replica.continue_read_only_review_history_guarded(
                    &document,
                    &mut candidate,
                    &observed,
                    next.clone(),
                )?;
            }
            NativeHistoryBoundary::ContinueDocument { .. } => {
                return Err(Error::Contract("document continuation requires the document lane"));
            }
        }
        let after = checkpoint::review_checkpoint(&candidate)?;
        Ok(PreparedNativeHistory {
            before: checkpoint::digest(lane, &before, None),
            after: checkpoint::digest(lane, &after, None),
            candidate: NativeHistoryCandidate::Review(Box::new(candidate)),
        })
    }
}
