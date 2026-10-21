//! Lifecycle `relay.review_history.seal/1`: preserve native client actors and original event receipts.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Result, Room};
impl Room {
    /// Seal a nonempty reserved-observer comment suffix without unlocking it or resetting history.
    /// Actor clocks, retained anchors, exact immutable files and original durable sequences persist.
    /// # Errors
    /// Non-owner access, disabled/original family, empty/reused IDs, native limits or storage refuse.
    pub fn seal_review_history_generation(
        &mut self,
        principal: &str,
        next: String,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.commit_native_history(
            principal,
            ServerNativeHistoryLane::Review,
            NativeHistoryBoundary::Seal { next },
        )
    }
}
