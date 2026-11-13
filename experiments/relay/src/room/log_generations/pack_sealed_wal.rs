//! Explicit owner maintenance for lossless physical storage reclamation.
use crate::{Result, Room, ServerSealedWalPacking};

impl Room {
    /// Replace one sealed WAL with a smaller lossless representation if it compresses.
    /// Global sequence, manifests, receipts, and portable backup bytes remain exact.
    ///
    /// # Errors
    /// Non-owner access, an active or unknown WAL, insufficient staging space,
    /// changed storage, and uncertain I/O refuse.
    pub fn pack_sealed_wal(
        &mut self,
        principal: &str,
        generation: &str,
    ) -> Result<ServerSealedWalPacking> {
        self.recovery_inventory_owner(principal)?;
        self.log.pack_sealed_wal(generation)
    }
}
