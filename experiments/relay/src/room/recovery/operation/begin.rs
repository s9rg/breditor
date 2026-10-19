//! Persist the new phase before releasing any native component for ordinary service mutation.
use super::super::{
    RecoveredServerRoom, ServerRoomBackup, ServerRoomBackupIdentity, restore_begin::selected,
};
use super::{
    OperationalServerRoom,
    marker::{Context, Intent},
    validate,
};
use crate::{Error, Result, RoomRecoveryPolicy};

impl RecoveredServerRoom {
    /// Establish explicit operational storage provenance for this exact completed recovery.
    /// The immutable original archive and both recovery records remain unchanged. No service,
    /// client sync or upload starts, and no account/registration authority is inferred.
    /// Persist the returned origin independently and retain the original archive for reopen.
    ///
    /// # Errors
    /// Rejects a wrong source selection, changed components/paths, unknown files, an existing
    /// operational intent or uncertain persistence. An error may have committed the marker;
    /// preserve the directory and resolve it through `OperationalServerRoom::resume`.
    pub fn begin_operation(
        mut self,
        backup: &ServerRoomBackup,
        expected: &ServerRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<OperationalServerRoom> {
        selected(backup, expected, policy)?;
        let context = Context::read(&self.root, &self.lock, backup)?;
        if context.intent != Intent::Missing {
            return Err(Error::Contract("operational intent already exists"));
        }
        validate::components(&self.root, &mut self.room, &mut self.assets, backup, true)?;
        context.guard(&self.root, &self.lock, backup)?;
        context.publish(&self.root)?;
        let after = Context::read(&self.root, &self.lock, backup)?;
        if after.intent != Intent::Committed || after.bytes != context.bytes {
            return Err(Error::Contract("operational intent not committed"));
        }
        validate::components(&self.root, &mut self.room, &mut self.assets, backup, true)?;
        after.guard(&self.root, &self.lock, backup)?;
        Ok(OperationalServerRoom {
            room: self.room,
            assets: self.assets,
            root: self.root,
            lock: self.lock,
            origin: Box::new(expected.clone()),
        })
    }
}
