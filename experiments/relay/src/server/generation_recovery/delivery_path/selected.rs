//! Validate EVERY actual adjacent link in the same current room->raster lock order.
use super::{MAX_DELIVERY_PATH_ARCHIVE_BYTES, ServerLogGenerationDeliveryPathIdentity};
use crate::{
    Error, Result, Room, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    assets::AssetStore,
};
use std::sync::Arc;
pub(super) fn check_inputs(
    ancestors: &[Arc<ServerLogGenerationRoomBackup>],
    expected: &[ServerLogGenerationRoomBackupIdentity],
) -> Result<()> {
    super::limits::check(ancestors.len(), 0)?;
    if ancestors.len() != expected.len() {
        return Err(Error::Contract("delivery path count differs or exceeds budget"));
    }
    let mut bytes = 0_u64;
    for (archive, pin) in ancestors.iter().zip(expected) {
        let info = archive.info()?;
        if info.identity != *pin {
            return Err(Error::Contract("delivery path archive selection differs"));
        }
        bytes =
            bytes.checked_add(info.bytes).ok_or(Error::Contract("delivery path byte overflow"))?;
        if bytes > MAX_DELIVERY_PATH_ARCHIVE_BYTES {
            return Err(Error::Contract("delivery path archive budget"));
        }
    }
    Ok(())
}
pub(super) fn check_selected(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &ServerLogGenerationRoomBackup,
    ancestors: &[Arc<ServerLogGenerationRoomBackup>],
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
    expected: &ServerLogGenerationDeliveryPathIdentity,
) -> Result<()> {
    check_inputs(ancestors, &expected.ancestors)?;
    if expected.format != "breditor/server-log-generation-delivery-path"
        || expected.format_version != 1
        || original.info()?.identity != expected.current.origin
        || expected.current.participants.source != expected.current.server.native
    {
        return Err(Error::Contract("delivery path original/current selection differs"));
    }
    custody.check_source(room, assets, original, owner)?;
    let inventory = room.log_generation_participant_inventory(owner)?;
    let current = ServerLogGenerationRoomBackup::capture(room, assets, owner)?;
    if inventory.identity() != expected.current.participants
        || current.info()?.identity != expected.current.server
    {
        return Err(Error::Contract("delivery path exact current cut differs"));
    }
    let mut previous = original;
    for archive in ancestors {
        archive.check_archive_ancestor(previous)?;
        previous = archive;
    }
    current.check_archive_ancestor(previous)?;
    custody.check_source(room, assets, original, owner)
}
