//! Lifecycle `relay.document_history.enable/1`: no document action, receipt or writer is recreated.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Result, Room};
impl Room {
    /// Explicitly retain native document generations and an existing private effect author's history.
    /// Native IDs/budgets are checked before I/O; both original roots remain exact. Current server
    /// grants, client offline histories, selections and all original durable receipts are unchanged.
    /// # Errors
    /// Non-owner access, conflicting selection, invalid IDs/native history, limits or storage refuse.
    pub fn enable_document_history_generations(
        &mut self,
        principal: &str,
        root: String,
        active: String,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.commit_native_history(
            principal,
            ServerNativeHistoryLane::Document,
            NativeHistoryBoundary::Enable { root, active },
        )
    }
}
