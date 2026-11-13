//! Stage -> append and sync -> publish. A failed/uncertain append never replaces live native owners.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Error, Result, Room, log::Event};

impl Room {
    pub(super) fn commit_native_history(
        &mut self,
        principal: &str,
        lane: ServerNativeHistoryLane,
        boundary: NativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if let Some(receipt) = self.native_history_retry(lane, &boundary)? {
            return Ok(receipt);
        }
        if self.native_history_boundaries.len() >= self.native_boundary_limit(&boundary) {
            return Err(Error::Contract("native boundary record budget"));
        }
        let prepared = self.prepare_native_history(lane, &boundary)?;
        let event = match &boundary {
            NativeHistoryBoundary::ContinueReview { next } => Event::NativeReviewContinuationV2 {
                actor: principal.into(),
                next: next.clone(),
                before: prepared.before,
                after: prepared.after,
            },
            NativeHistoryBoundary::ContinueDocument { next } => {
                Event::NativeDocumentContinuationV2 {
                    actor: principal.into(),
                    next: next.clone(),
                    before: prepared.before,
                    after: prepared.after,
                }
            }
            _ => Event::NativeHistoryBoundaryV1 {
                actor: principal.into(),
                lane,
                boundary: boundary.clone(),
                before: prepared.before,
                after: prepared.after,
            },
        };
        let sequence = self.log.append(event)?;
        if let Err(error) = self.publish_native_history(prepared.candidate) {
            self.log.invalidate();
            return Err(error);
        }
        self.abandon_suggestion_revision_preparation();
        match self.remember_native_history(
            sequence,
            lane,
            boundary,
            prepared.before,
            prepared.after,
        ) {
            Ok(receipt) => Ok(receipt),
            Err(error) => {
                self.log.invalidate();
                Err(error)
            }
        }
    }
}
