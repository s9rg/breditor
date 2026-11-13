//! Explicitly relocate only WALs covered by a trusted checkpoint.
use crate::{Error, RelayCheckpoint, Result, Room, ServerSealedWalArchive};

impl Room {
    /// Move one sealed WAL covered by a materialized checkpoint into the room's
    /// private archive. Portable backup bytes and global log positions stay exact.
    ///
    /// # Errors
    /// Wrong authority, a checkpoint outside the selected physical lineage,
    /// a WAL beyond its cut, and uncertain storage refuse.
    pub fn archive_sealed_wal(
        &mut self,
        principal: &str,
        checkpoint: &RelayCheckpoint,
        generation: &str,
    ) -> Result<ServerSealedWalArchive> {
        self.recovery_inventory_owner(principal)?;
        let selected = checkpoint.identity();
        if self.native_identity_at(selected.source.records, selected.source.terminal_log_digest)
            != selected.source
        {
            return Err(Error::Contract("WAL archive checkpoint belongs to a different room"));
        }
        self.log.check_materialized_checkpoint_cut(
            selected.manifest,
            selected.source.records,
            selected.source.terminal_log_digest,
        )?;
        self.log.archive_sealed_wal(generation, selected.source.records)
    }
}
