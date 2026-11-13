//! Advance the room's document receiver and private suggestion effect author together.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt};
use crate::{Result, Room};

impl Room {
    /// Retain the exact V1 document archives and sync an explicit continuation.
    ///
    /// # Errors
    /// Non-owner access, incompatible native families, generation reuse,
    /// retention limits or an uncertain durable append refuse publication.
    pub fn continue_document_native_history(
        &mut self,
        principal: &str,
        next: String,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.commit_native_history(
            principal,
            ServerNativeHistoryLane::Document,
            NativeHistoryBoundary::ContinueDocument { next },
        )
    }
}
