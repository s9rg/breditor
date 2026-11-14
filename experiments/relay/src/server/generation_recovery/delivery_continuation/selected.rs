//! Full physical/raster byte ancestry and current protected inventory in one lock order.
use super::ServerLogGenerationDeliveryContinuationIdentity;
use crate::{Error, Result, Room, ServerLogGenerationRoomBackup, assets::AssetStore};

pub(super) fn check_selected(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &crate::room::HostOrigin,
    previous: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
    expected: &ServerLogGenerationDeliveryContinuationIdentity,
) -> Result<()> {
    if expected.format != "breditor/server-log-generation-delivery-continuation"
        || expected.format_version != 1
        || *original.identity()? != expected.current.origin
        || previous.info()?.identity != expected.previous
        || expected.current.participants.source != expected.current.server.native
    {
        return Err(Error::Contract("delivery continuation selections differ"));
    }
    custody.check_source(room, assets, original, owner)?;
    let inventory = room.log_generation_participant_inventory(owner)?;
    let current = ServerLogGenerationRoomBackup::capture(room, assets, owner)?;
    if inventory.identity() != expected.current.participants
        || current.info()?.identity != expected.current.server
    {
        return Err(Error::Contract("delivery continuation current cut differs"));
    }
    // Two archives retained by C do not establish A <= B. Preserve BOTH links.
    original.check_archive_descendant(previous)?;
    current.check_archive_ancestor(previous)?;
    custody.check_source(room, assets, original, owner)
}
