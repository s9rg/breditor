//! Connect original serving custody to the durable generation handover.
mod prepare;
mod seal;

use crate::{Error, Result, Room, ServerRoomBackup, assets::AssetStore};

fn capture_original(
    room: &mut Room,
    assets: &mut AssetStore,
    principal: &str,
) -> Result<ServerRoomBackup> {
    if room.backup_identity()?.owner != principal {
        return Err(Error::Permission);
    }
    ServerRoomBackup::capture(room, assets)
}
