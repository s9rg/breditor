//! Compare the capture to the current native and raster owners under the caller's epoch permit.
use crate::{
    ContinuedAssetStore, Error, Result, Room,
    room::ContinuedServingCustody,
    server::{ContinuedRasterRoomBackupIdentity, Host, RecoveredContinuedRasterRoom},
};
use std::{io::sink, sync::MutexGuard};

pub(super) struct ContinuedSourceCut<'a> {
    room: MutexGuard<'a, Room>,
    rasters: MutexGuard<'a, ContinuedAssetStore>,
    custody: Option<&'a ContinuedServingCustody>,
}

impl<'a> ContinuedSourceCut<'a> {
    pub(super) fn compare(
        host: &'a Host,
        principal: &str,
        expected: &ContinuedRasterRoomBackupIdentity,
        target: &RecoveredContinuedRasterRoom,
    ) -> Result<Self> {
        let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
        let custody = host.continued_custody.as_deref();
        if let Some(custody) = custody {
            custody.check(&room)?;
            custody.check_retained_alternates(target)?;
        }
        let rasters = host
            .continued_assets
            .as_ref()
            .ok_or(Error::NeedsRecovery)?
            .lock()
            .map_err(|_| Error::NeedsRecovery)?;
        let native = room.write_relay_segment_base_with_compactable_history(
            principal,
            &mut sink(),
            &mut sink(),
        )?;
        if native != expected.native
            || rasters.write_backup(&mut sink(), &mut sink())? != expected.rasters
        {
            return Err(Error::Contract("continued raster activation live source advanced"));
        }
        Ok(Self { room, rasters, custody })
    }

    pub(super) fn check(&self, principal: &str) -> Result<()> {
        self.rasters.guard()?;
        self.room.recovery_inventory_owner(principal)?;
        if let Some(custody) = self.custody {
            custody.check(&self.room)?;
        }
        Ok(())
    }
}
