//! Export through the exclusive live room authority, never through a caller-provided log path.
use super::RoomBackup;
use crate::{Result, Room};

impl Room {
    /// Capture exact complete server history while this value holds its exclusive room log lock.
    /// Retains grants, writer credential digests, receipts, review, versions and suggestion history;
    /// excludes ephemeral leases/presence, external raster bytes and clients' offline journals.
    /// # Errors
    /// Rejects poisoned, externally changed, unreadable, incomplete or over-budget log state.
    pub fn export_backup(&mut self) -> Result<RoomBackup> {
        Ok(RoomBackup::from_snapshot(self.log.snapshot()?))
    }
}
