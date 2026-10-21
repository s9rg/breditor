//! Controlled real synced prefixes, never fake native owners or alternate semantic replay.
use super::ServerLogGenerationRoomRecovery;
use crate::{Error, Result};
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum JoinedPoint {
    NativeCreated,
    NativeSelected,
    NativeReady,
    RasterCreated,
    RasterSelected,
    RasterStageCreated,
    RasterPartSelected,
    RasterDataPrefix,
    RasterDataSynced,
    RasterFilePublished,
    RasterStageRetired,
    FilesRestored,
    ComponentsVerified,
    CompletionSynced,
}
impl ServerLogGenerationRoomRecovery {
    pub(super) fn interrupt(&self, point: JoinedPoint) -> Result<()> {
        if self.stop_after == Some(point) {
            return Err(Error::Contract("controlled joined recovery interruption"));
        }
        Ok(())
    }
}
