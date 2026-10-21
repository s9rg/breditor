//! Test-only stops after actual synced filesystem prefixes, never substitute accepted state.
use super::ServerLogGenerationRecovery;
use crate::{Error, Result};
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum RestorePoint {
    ComponentCreated,
    ComponentSelected,
    StageCreated,
    PartSelected,
    DataPrefix,
    DataSynced,
    FilePublished,
    StageRetired,
    FilesRestored,
    NativeVerified,
    ReadyLinked,
    ReadyPublished,
    CompletionSynced,
}
impl ServerLogGenerationRecovery {
    pub(super) fn interrupt(&self, point: RestorePoint) -> Result<()> {
        if self.stop_after == Some(point) {
            return Err(Error::Contract("test interrupted after actual restore prefix"));
        }
        Ok(())
    }
}
