//! Verify the immutable original within actual later server owners without rewriting either cut.
use super::ServerRoomBackup;
use crate::{Error, Result, Room, RoomBackupIdentity, assets::AssetStore};

impl ServerRoomBackup {
    pub(crate) fn verify_retained_components(
        &self,
        room: &mut Room,
        assets: &mut AssetStore,
    ) -> Result<()> {
        // Transport admission checks the original record cut, not the header's native semantics.
        // These seed-bound fields cannot change across any genuine native continuation.
        let native_origin = RoomBackupIdentity {
            records: self.identity.room.records,
            terminal_log_digest: self.identity.room.terminal_log_digest,
            ..room.backup_identity()?
        };
        if native_origin != self.identity.room {
            return Err(Error::Contract("continued server original native identity differs"));
        }
        if room.asset_binding() != self.identity.assets.binding
            || assets.binding() != self.identity.assets.binding
        {
            return Err(Error::Contract("continued server asset binding differs"));
        }
        let current = room.export_backup()?;
        if !current.original_log().starts_with(self.room.original_log()) {
            return Err(Error::Contract("continued server log lost selected original prefix"));
        }
        assets.verify_retained_backup(&self.assets)?;
        Ok(())
    }
}
