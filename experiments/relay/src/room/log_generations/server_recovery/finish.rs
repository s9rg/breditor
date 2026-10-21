//! Actual native replay, exact raster ownership and source checks precede the joined barrier.
use super::super::ServerLogGenerationRoomBackup;
use super::{
    RecoveredLogGenerationServerRoom, ServerLogGenerationRoomRecovery, files, selection::Marker,
};
use crate::{Error, Result};
use std::collections::BTreeSet;
impl ServerLogGenerationRoomRecovery {
    /// Resume exact owned files, replay the complete native room, acquire its matching raster
    /// store without initialization/cleanup, and sync one final joined completion record.
    /// Retain the directory/archive on failure; no history/file is replaced, no client/provider
    /// sync or network service starts, and old ephemeral leases are never restored.
    /// # Errors
    /// Wrong source/custody, occupied/unknown files, native replay, raster mismatch or I/O refuses.
    pub fn finish(
        self,
        backup: &ServerLogGenerationRoomBackup,
    ) -> Result<RecoveredLogGenerationServerRoom> {
        self.progress(backup)?;
        let (native_selection, attempt) = self.prepare_native(backup)?;
        let mut native = attempt.finish(backup.native())?;
        native.guard_custody(&native_selection.witness)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::NativeReady)?;
        let (raster_selection, directory) = self.prepare_rasters()?;
        let selected = backup.rasters().selected_files();
        let names = selected.keys().cloned().chain(std::iter::once(".lock".into())).collect();
        Self::raster_inventory(&directory, &names)?;
        for (name, bytes) in selected {
            self.restore_raster_part(&raster_selection, &directory, &name, bytes)?;
        }
        Self::raster_inventory(&directory, &names)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::FilesRestored)?;
        let (assets, raster) = directory.into_store(&self.marker.identity.assets.binding)?;
        backup.native().check_live(native.room_mut(), &self.marker.identity.native.source.owner)?;
        assets.check_exported_backup(backup.rasters())?;
        if native.room().asset_binding() != assets.binding() {
            return Err(Error::Contract("joined restored native/raster binding"));
        }
        native.guard_custody(&native_selection.witness)?;
        raster.guard(&assets)?;
        self.guard_selection(backup)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::ComponentsVerified)?;
        let target = self.directory.path.join(".complete.json");
        if files::exists(&target)? {
            let actual: Marker = files::read(&target)?;
            if files::encode(&actual)? != files::encode(&self.completion())? {
                return Err(Error::Contract("joined completion differs"));
            }
        } else {
            files::insert(&self.directory, ".complete.json", &files::encode(&self.completion())?)?;
        }
        self.directory.guard()?;
        native.guard_custody(&native_selection.witness)?;
        raster.guard(&assets)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::CompletionSynced)?;
        let mut known = BTreeSet::from([
            ".owner".into(),
            ".recovery.json".into(),
            ".native.json".into(),
            ".rasters.json".into(),
            ".complete.json".into(),
        ]);
        for (name, bytes) in backup.rasters().selected_files() {
            let part = self
                .raster_part(&raster_selection, &name, bytes)?
                .ok_or(Error::Contract("joined completed raster intent absent"))?;
            known.insert(super::raster_part::ledger(&name));
            known.insert(part.stage);
        }
        let components = BTreeSet::from([native_selection.directory, raster_selection.directory]);
        let names = self.outer_names(&known, &components)?;
        let controls = super::super::control_seal::RecoveryControlSeal::capture(
            &self.directory,
            Some(&names),
            &components,
        )?;
        let native_controls = native.recovery_control_seal()?;
        Ok(RecoveredLogGenerationServerRoom {
            controls,
            native_controls,
            directory: self.directory,
            marker: self.marker,
            native,
            assets,
            raster,
        })
    }
}
