//! Actual local control custody and complete ancestor bytes are separate native checks.
use super::super::{ServerLogGenerationRecoveryStateIdentity, selected};
use super::PhysicalServerRoomRecoveryStateIdentity;
use crate::{Error, Result, Room, ServerLogGenerationRoomBackup, assets::AssetStore};

pub(super) fn check_retained(
    room: &mut Room,
    assets: &mut AssetStore,
    local: &crate::room::HostOrigin,
    ancestor: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
) -> Result<()> {
    custody.check_source(room, assets, local, owner)?;
    ancestor.check_retained(room, assets, owner)?;
    custody.check_source(room, assets, local, owner)
}
pub(super) fn check_selected(
    room: &mut Room,
    assets: &mut AssetStore,
    local: &crate::room::HostOrigin,
    ancestor: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
    expected: &PhysicalServerRoomRecoveryStateIdentity,
) -> Result<()> {
    if expected.format != "breditor/physical-server-room-recovery-state"
        || expected.format_version != 1
        || ancestor.info()?.identity != expected.ancestor
        || *local.identity()? != expected.local_origin
        || expected.participants.source != expected.server.native
    {
        return Err(Error::Contract("physical host ancestor/local/current selections differ"));
    }
    let local_expected = ServerLogGenerationRecoveryStateIdentity {
        origin: expected.local_origin.clone(),
        server: expected.server.clone(),
        participants: expected.participants.clone(),
    };
    selected::check_selected(room, assets, local, custody, owner, &local_expected)?;
    check_retained(room, assets, local, ancestor, custody, owner)
}
