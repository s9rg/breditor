//! Advance only the room's existing read-only native comment receiver.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Result, Room};

impl Room {
    /// Retain the exact V1 archive and sync an explicit continuation in the room log.
    ///
    /// # Errors
    /// Only the current room owner can continue. A stale storage cut, wrong native
    /// family, invalid generation, or failed durable append refuses publication.
    pub fn continue_review_native_history(
        &mut self,
        principal: &str,
        next: String,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.commit_native_history(
            principal,
            ServerNativeHistoryLane::Review,
            NativeHistoryBoundary::ContinueReview { next },
        )
    }
}
