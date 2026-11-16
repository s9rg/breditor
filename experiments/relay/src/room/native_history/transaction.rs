//! Stage -> append and sync -> publish. A failed/uncertain append never replaces live native owners.
use super::{
    NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt,
    prepare::PreparedNativeHistory,
};
use crate::{Error, Result, Room, log::Event};

impl Room {
    pub(crate) fn commit_native_history(
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
        let prepared = self.prepare_new_native_history(lane, &boundary)?;
        self.append_native_history(principal, lane, boundary, prepared)
    }

    pub(super) fn prepare_new_native_history(
        &self,
        lane: ServerNativeHistoryLane,
        boundary: &NativeHistoryBoundary,
    ) -> Result<PreparedNativeHistory> {
        if self.native_history_boundaries.len() >= self.native_boundary_limit(Some(boundary)) {
            return Err(Error::Contract("native boundary record budget"));
        }
        self.prepare_native_history(lane, boundary)
    }

    pub(super) fn append_native_history(
        &mut self,
        principal: &str,
        lane: ServerNativeHistoryLane,
        boundary: NativeHistoryBoundary,
        prepared: PreparedNativeHistory,
    ) -> Result<ServerNativeHistoryReceipt> {
        let event = boundary_event(principal, lane, &boundary, &prepared);
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

pub(super) fn boundary_event(
    principal: &str,
    lane: ServerNativeHistoryLane,
    boundary: &NativeHistoryBoundary,
    prepared: &PreparedNativeHistory,
) -> Event {
    let actor = principal.into();
    let (before, after) = (prepared.before, prepared.after);
    match boundary {
        NativeHistoryBoundary::ContinueReview { next } => {
            Event::NativeReviewContinuationV2 { actor, next: next.clone(), before, after }
        }
        NativeHistoryBoundary::ContinueDocument { next } => {
            Event::NativeDocumentContinuationV2 { actor, next: next.clone(), before, after }
        }
        _ => Event::NativeHistoryBoundaryV1 {
            actor,
            lane,
            boundary: boundary.clone(),
            before,
            after,
        },
    }
}
