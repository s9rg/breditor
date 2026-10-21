//! Lifecycle `relay.document_history.seal/1`: exact retention, never log rotation or history reset.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Result, Room};
impl Room {
    /// Seal the nonempty server document suffix, retaining native history, actors and receipts.
    /// The enabled private effect author seals only when nonempty; its empty active file is kept.
    /// Original log/Undo/archive bounds stay unchanged. No client receives new author authority.
    /// # Errors
    /// Non-owner access, wrong family, empty/reused/invalid generations, budgets or I/O refuse.
    pub fn seal_document_history_generation(
        &mut self,
        principal: &str,
        next: String,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.commit_native_history(
            principal,
            ServerNativeHistoryLane::Document,
            NativeHistoryBoundary::Seal { next },
        )
    }
}
