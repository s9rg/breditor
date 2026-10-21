//! Re-admit actual native state and retained original files before checking protected credentials.
use super::ServerLogGenerationRecoveryStateIdentity;
use crate::{Error, Result, Room, ServerLogGenerationRoomBackup, assets::AssetStore};
pub(super) fn check_selected(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
    expected: &ServerLogGenerationRecoveryStateIdentity,
) -> Result<()> {
    if original.info()?.identity != expected.origin
        || expected.participants.source != expected.server.native
    {
        return Err(Error::Contract("generation host source selections differ"));
    }
    custody.check_source(room, assets, original, owner)?;
    if room.log_generation_participant_inventory(owner)?.identity() != expected.participants
        || ServerLogGenerationRoomBackup::capture(room, assets, owner)?.info()?.identity
            != expected.server
    {
        return Err(Error::Contract("generation host current cut differs"));
    }
    custody.check_source(room, assets, original, owner)
}
