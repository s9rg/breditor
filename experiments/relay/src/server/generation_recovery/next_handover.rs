//! Recovered serving owners can hand over again without unwrapping native custody.
mod prepare;
mod seal;

use super::PreparedLogGenerationRecoveryHost;
use crate::{Error, Result, Room, ServerLogGenerationRoomBackup, assets::AssetStore};
use std::sync::Arc;

pub(super) fn check_source(
    owner: &PreparedLogGenerationRecoveryHost,
    room: &mut Room,
    assets: &mut AssetStore,
    principal: &str,
) -> Result<()> {
    let serving = owner.host.generation_serving.get().ok_or(Error::NeedsRecovery)?;
    let custody = owner.host.generation_custody.as_ref().ok_or(Error::NeedsRecovery)?;
    if !Arc::ptr_eq(&serving.original, &owner.original) {
        return Err(Error::NeedsRecovery);
    }
    serving.check_retained()?;
    if let Some(checkpoint) = &serving.checkpoint {
        checkpoint.guard()?;
    } else {
        serving.source.store.guard()?;
    }
    custody.check_source(room, assets, &owner.original, principal)
}

fn capture_source(
    owner: &PreparedLogGenerationRecoveryHost,
    room: &mut Room,
    assets: &mut AssetStore,
    principal: &str,
) -> Result<ServerLogGenerationRoomBackup> {
    check_source(owner, room, assets, principal)?;
    let backup = ServerLogGenerationRoomBackup::capture(room, assets, principal)?;
    check_source(owner, room, assets, principal)?;
    Ok(backup)
}
