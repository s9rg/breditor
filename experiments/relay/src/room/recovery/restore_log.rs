//! Resume an owned exact prefix, replay original native history, then publish the locked inode.
use super::{ServerRoomBackup, ServerRoomRecovery, files};
use crate::{Error, Result, Room};
impl ServerRoomRecovery {
    pub(super) fn restore_log(&self, backup: &ServerRoomBackup) -> Result<Room> {
        let target = self.root.join("room.log");
        let stage = self.log_stage();
        let expected = backup.room.original_log();
        let published = files::exists(&target)?;
        if published {
            files::compare(&target, expected, false)?;
        }
        if !published || files::exists(&stage)? {
            files::prepare(&stage, expected)?;
        }
        let (room, recovery) = Room::open(if published { &target } else { &stage })?;
        if recovery.truncated_bytes != 0 || room.backup_identity()? != self.marker.identity.room {
            return Err(Error::Contract("server recovery native log identity"));
        }
        // Native semantic admission precedes even a valid-checksum log's final publication.
        if published {
            std::fs::File::open(&target)?.sync_all()?;
        } else {
            files::publish(&self.root, &stage, &target, expected)?;
        }
        files::retire(&self.root, &stage, expected)?;
        Ok(room)
    }
}
