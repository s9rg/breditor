//! Crate-private host transfer keeps all actual custody; no public bare native-parts escape.
use super::super::super::ServerLogGenerationRoomBackup;
use super::super::custody::JoinedRecoveryCustody;
use super::{OperationalLogGenerationServerRoom, context::Context};
use crate::{Error, Result, Room, assets::AssetStore};

pub(crate) struct GenerationOperationCustody {
    custody: JoinedRecoveryCustody,
    context: Context,
}
impl GenerationOperationCustody {
    /// Detached commitment to the actual original operational directory, control
    /// selection and intent inode. Call only alongside real source/custody checks.
    pub(crate) fn activation_owner_digest(&self) -> Result<[u8; 32]> {
        use sha2::{Digest, Sha256};
        Ok(Sha256::digest(serde_json::to_vec(&self.context.marker)?).into())
    }

    pub(crate) fn check_source(
        &self,
        room: &mut Room,
        assets: &mut AssetStore,
        backup: &ServerLogGenerationRoomBackup,
        principal: &str,
    ) -> Result<()> {
        if !self.context.guard(&self.custody.directory)? {
            return Err(Error::Contract("generation host operational marker not committed"));
        }
        self.custody.check_source((room, assets), backup, principal, false, &self.context.extra)?;
        if !self.context.guard(&self.custody.directory)? {
            return Err(Error::Contract("generation host operational marker changed during check"));
        }
        Ok(())
    }
}
impl OperationalLogGenerationServerRoom {
    pub(crate) fn into_host_parts(
        mut self,
        backup: &ServerLogGenerationRoomBackup,
        principal: &str,
    ) -> Result<(Room, AssetStore, GenerationOperationCustody)> {
        self.check_live_source(backup, principal)?;
        let super::super::RecoveredLogGenerationServerRoom { room, assets, custody } =
            self.recovered;
        Ok((room, assets, GenerationOperationCustody { custody, context: self.context }))
    }
}
