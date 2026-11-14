//! Crate-private host transfer keeps all actual custody; no public bare native-parts escape.
use super::super::{custody::JoinedRecoveryCustody, origin::HostOrigin};
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
        self.context.activation_owner_digest()
    }

    pub(crate) fn check_source(
        &self,
        room: &mut Room,
        assets: &mut AssetStore,
        backup: &HostOrigin,
        principal: &str,
    ) -> Result<()> {
        if !self.context.guard(&self.custody.directory)? {
            return Err(Error::Contract("generation host operational marker not committed"));
        }
        self.custody.check_source(
            (room, assets),
            backup.borrow(),
            principal,
            false,
            &self.context.extra,
        )?;
        if !self.context.guard(&self.custody.directory)? {
            return Err(Error::Contract("generation host operational marker changed during check"));
        }
        Ok(())
    }
}
impl OperationalLogGenerationServerRoom {
    pub(crate) fn into_host_parts(
        mut self,
        backup: &HostOrigin,
        principal: &str,
    ) -> Result<(Room, AssetStore, GenerationOperationCustody)> {
        self.check_live_origin(backup.borrow(), principal)?;
        let super::super::RecoveredLogGenerationServerRoom { room, assets, custody } =
            self.recovered;
        Ok((room, assets, GenerationOperationCustody { custody, context: self.context }))
    }
}
