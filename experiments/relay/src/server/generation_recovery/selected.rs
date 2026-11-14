//! Re-admit actual native state and retained original files before checking protected credentials.
use super::ServerLogGenerationRecoveryStateIdentity;
use crate::{Error, Result, Room, assets::AssetStore};
use std::io;
pub(in crate::server) fn check_selected(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &crate::room::HostOrigin,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
    expected: &ServerLogGenerationRecoveryStateIdentity,
) -> Result<()> {
    let current =
        super::capture::capture_identity(room, assets, original, custody, owner, &mut io::sink())?;
    if current.0 != *expected {
        return Err(Error::Contract("generation host current cut differs"));
    }
    Ok(())
}
