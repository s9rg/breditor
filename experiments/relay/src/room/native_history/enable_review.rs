//! Lifecycle `relay.review_history.enable/1`: the reserved receiver remains a zero-authored observer.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Result, Room};
impl Room {
    /// Explicitly retain comment generations independently of document history and writer transport.
    /// The original comment root remains exact; the server never borrows a client or writable grant.
    /// No event, document action, author counter or durable acceptance receipt is manufactured.
    /// # Errors
    /// Non-owner access, disabled comments, conflicting selection, invalid native IDs/bounds or I/O refuse.
    pub fn enable_review_history_generations(
        &mut self,
        principal: &str,
        root: String,
        active: String,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.commit_native_history(
            principal,
            ServerNativeHistoryLane::Review,
            NativeHistoryBoundary::Enable { root, active },
        )
    }
}
