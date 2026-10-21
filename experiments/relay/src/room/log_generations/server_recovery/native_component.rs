//! Select only actual newly created component directories. Partial unselected work is preserved.
use super::super::{ServerLogGenerationRecovery, ServerLogGenerationRoomBackup};
use super::{
    ServerLogGenerationRoomRecovery, files,
    raster_directory::RasterDirectory,
    selection::{NativeComponent, RasterComponent},
};
use crate::{Error, Result, RoomRecoveryPolicy, credentials};
impl ServerLogGenerationRoomRecovery {
    pub(super) fn native_selection(&self) -> Result<Option<NativeComponent>> {
        let path = self.directory.path.join(".native.json");
        if !files::exists(&path)? {
            return Ok(None);
        }
        let value: NativeComponent = files::read(&path)?;
        credentials::hash(
            value
                .directory
                .strip_prefix(".native-")
                .ok_or(Error::Contract("joined native component name"))?,
        )?;
        if value.format != "breditor/joined-generation-native-component"
            || value.format_version != 1
            || value.recovery != self.marker.id
        {
            return Err(Error::Contract("joined native component selection"));
        }
        Ok(Some(value))
    }
    pub(super) fn native_attempt(
        &self,
        backup: &ServerLogGenerationRoomBackup,
        value: &NativeComponent,
    ) -> Result<ServerLogGenerationRecovery> {
        let attempt = ServerLogGenerationRecovery::resume(
            &self.directory.path.join(&value.directory),
            backup.native(),
            &self.marker.identity.native,
            RoomRecoveryPolicy::HostReacquired,
        )?;
        if attempt.custody()? != value.witness {
            return Err(Error::Contract("joined native component custody differs"));
        }
        Ok(attempt)
    }
    pub(super) fn prepare_native(
        &self,
        backup: &ServerLogGenerationRoomBackup,
    ) -> Result<(NativeComponent, ServerLogGenerationRecovery)> {
        if let Some(value) = self.native_selection()? {
            let attempt = self.native_attempt(backup, &value)?;
            return Ok((value, attempt));
        }
        let name = format!(".native-{}", credentials::issue()?);
        let attempt = ServerLogGenerationRecovery::begin(
            &self.directory.path.join(&name),
            backup.native(),
            &self.marker.identity.native,
            RoomRecoveryPolicy::HostReacquired,
        )?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::NativeCreated)?;
        let value = NativeComponent {
            format: "breditor/joined-generation-native-component".into(),
            format_version: 1,
            recovery: self.marker.id.clone(),
            directory: name,
            witness: attempt.custody()?,
        };
        files::insert(&self.directory, ".native.json", &files::encode(&value)?)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::NativeSelected)?;
        Ok((value, attempt))
    }
    pub(super) fn raster_selection(&self) -> Result<Option<RasterComponent>> {
        let path = self.directory.path.join(".rasters.json");
        if !files::exists(&path)? {
            return Ok(None);
        }
        let value: RasterComponent = files::read(&path)?;
        credentials::hash(
            value
                .directory
                .strip_prefix(".rasters-")
                .ok_or(Error::Contract("joined raster component name"))?,
        )?;
        if value.format != "breditor/joined-generation-raster-component"
            || value.format_version != 1
            || value.recovery != self.marker.id
        {
            return Err(Error::Contract("joined raster component selection"));
        }
        Ok(Some(value))
    }
    pub(super) fn prepare_rasters(&self) -> Result<(RasterComponent, RasterDirectory)> {
        if let Some(value) = self.raster_selection()? {
            let directory =
                RasterDirectory::open(&self.directory.path.join(&value.directory), &value.witness)?;
            return Ok((value, directory));
        }
        let name = format!(".rasters-{}", credentials::issue()?);
        let directory = RasterDirectory::create(&self.directory.path.join(&name))?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::RasterCreated)?;
        let value = RasterComponent {
            format: "breditor/joined-generation-raster-component".into(),
            format_version: 1,
            recovery: self.marker.id.clone(),
            directory: name,
            witness: directory.witness()?,
        };
        files::insert(&self.directory, ".rasters.json", &files::encode(&value)?)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::RasterSelected)?;
        Ok((value, directory))
    }
}
