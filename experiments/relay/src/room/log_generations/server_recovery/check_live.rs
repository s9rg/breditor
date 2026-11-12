//! Recheck the actual joined source before an explicit later operational transition.
use super::super::ServerLogGenerationRoomBackup;
use super::{
    RecoveredLogGenerationServerRoom, files,
    selection::{Marker, NativeComponent, RasterComponent},
};
use crate::{Error, Result, Room, assets::AssetStore};
use std::collections::BTreeSet;
impl RecoveredLogGenerationServerRoom {
    /// Verify original joined controls, actual component custody and exact native/raster bytes.
    /// Current account authentication remains the host's responsibility. This method does not
    /// establish provider/client coverage, cross-host fencing or permission to activate a service.
    /// # Errors
    /// Non-owner access, changed selections/custody, later accepted edits/uploads or uncertain files refuse.
    pub fn check_live_source(
        &mut self,
        backup: &ServerLogGenerationRoomBackup,
        principal: &str,
    ) -> Result<()> {
        self.check_source(backup, principal, true, &BTreeSet::new())
    }
    pub(super) fn check_source(
        &mut self,
        backup: &ServerLogGenerationRoomBackup,
        principal: &str,
        exact: bool,
        extra: &BTreeSet<String>,
    ) -> Result<()> {
        self.custody.check_source(
            (&mut self.room, &mut self.assets),
            backup,
            principal,
            exact,
            extra,
        )
    }
}
impl super::custody::JoinedRecoveryCustody {
    pub(super) fn check_source(
        &self,
        components: (&mut Room, &mut AssetStore),
        backup: &ServerLogGenerationRoomBackup,
        principal: &str,
        exact: bool,
        extra: &BTreeSet<String>,
    ) -> Result<()> {
        self.check_source_with(components, backup, extra, |room, assets| {
            if exact {
                backup.check_live(room, assets, principal)
            } else {
                backup.check_retained(room, assets, principal)
            }
        })
    }

    pub(super) fn check_source_with<T>(
        &self,
        (room, assets): (&mut Room, &mut AssetStore),
        backup: &ServerLogGenerationRoomBackup,
        extra: &BTreeSet<String>,
        verify: impl FnOnce(&mut Room, &mut AssetStore) -> Result<T>,
    ) -> Result<T> {
        self.directory.guard()?;
        self.controls.check_with_extras(&self.directory, extra)?;
        self.native_controls.check(&self.native_directory)?;
        if backup.info()?.identity != self.marker.identity {
            return Err(Error::Contract("joined actual source selection differs"));
        }
        let original: Marker = files::read(&self.directory.path.join(".recovery.json"))?;
        let completed: Marker = files::read(&self.directory.path.join(".complete.json"))?;
        let expected = Marker {
            format: "breditor/server-log-generation-room-complete".into(),
            format_version: 1,
            id: self.marker.id.clone(),
            identity: self.marker.identity.clone(),
        };
        if files::encode(&original)? != files::encode(&self.marker)?
            || files::encode(&completed)? != files::encode(&expected)?
        {
            return Err(Error::Contract("joined actual recovery controls changed"));
        }
        let native: NativeComponent = files::read(&self.directory.path.join(".native.json"))?;
        let raster: RasterComponent = files::read(&self.directory.path.join(".rasters.json"))?;
        if native.recovery != self.marker.id
            || raster.recovery != self.marker.id
            || native.format != "breditor/joined-generation-native-component"
            || native.format_version != 1
            || raster.format != "breditor/joined-generation-raster-component"
            || raster.format_version != 1
            || self.directory.path.join(&native.directory) != self.native_directory.path
        {
            return Err(Error::Contract("joined actual component owner differs"));
        }
        self.native_directory.guard_witness(&native.witness)?;
        super::super::RecoveredLogGenerationRoom::guard_joined_native_owner(
            &self.native_directory,
            room,
        )?;
        self.raster.guard_selected(&raster.witness, assets)?;
        self.check_original_raster_custody(backup, &raster)?;
        let result = verify(room, assets)?;
        self.directory.guard()?;
        self.controls.check_with_extras(&self.directory, extra)?;
        self.native_controls.check(&self.native_directory)?;
        self.native_directory.guard_witness(&native.witness)?;
        super::super::RecoveredLogGenerationRoom::guard_joined_native_owner(
            &self.native_directory,
            room,
        )?;
        self.check_original_raster_custody(backup, &raster)?;
        self.raster.guard_selected(&raster.witness, assets)?;
        Ok(result)
    }
    fn check_original_raster_custody(
        &self,
        backup: &ServerLogGenerationRoomBackup,
        component: &RasterComponent,
    ) -> Result<()> {
        for (name, bytes) in backup.rasters().selected_files() {
            let part = super::raster_part::selected_part(
                &self.directory,
                &self.marker.id,
                component,
                &name,
                bytes,
            )?
            .ok_or(Error::Contract("joined original raster intent absent"))?;
            self.raster.guard_file(&name, &part.witness)?;
        }
        Ok(())
    }
}
