//! Cold operational reopen preserves complete current work; exact historical restore stays closed.
use super::super::super::{
    RecoveredLogGenerationRoom, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity, control_seal::RecoveryControlSeal,
};
use super::super::{
    RecoveredLogGenerationServerRoom, ServerLogGenerationRoomRecovery,
    begin::selected,
    files,
    raster_directory::{RasterCustody, RasterDirectory},
    selection::Marker,
};
use super::{
    context::Context, coordinator::OperationalLogGenerationServerRoom, interruption::Interruption,
};
use crate::{
    Error, Result, Room, RoomRecoveryPolicy,
    assets::AssetStore,
    credentials,
    log::{Log, generations::GenerationDirectory},
};
use std::path::Path;

#[derive(Clone, Copy)]
pub(super) enum OpenMode {
    Resume,
    Committed,
    InspectNativePrefix,
    #[cfg(feature = "server")]
    InspectPendingRotation,
    #[cfg(feature = "server")]
    InspectPendingRotationAndRaster,
    #[cfg(feature = "server")]
    InspectPendingRaster,
    #[cfg(feature = "server")]
    InspectNativePrefixAndRaster,
}

fn read_operating_log(directory: GenerationDirectory, mode: OpenMode) -> Result<Room> {
    match mode {
        #[cfg(feature = "server")]
        OpenMode::InspectPendingRotation | OpenMode::InspectPendingRotationAndRaster => {
            let (log, recovery) = Log::open_owned_generations(directory)?;
            if recovery.truncated_bytes != 0 {
                return Err(Error::Contract(
                    "pending rotation inspection requires a complete active log",
                ));
            }
            Room::replay_generation(log)
        }
        OpenMode::InspectNativePrefix => read_log_prefix(directory),
        OpenMode::Resume | OpenMode::Committed => read_complete_log(directory),
        #[cfg(feature = "server")]
        OpenMode::InspectPendingRaster => read_complete_log(directory),
        #[cfg(feature = "server")]
        OpenMode::InspectNativePrefixAndRaster => read_log_prefix(directory),
    }
}

fn read_complete_log(directory: GenerationDirectory) -> Result<Room> {
    let (log, recovery) = Log::open_complete_owned_generations(directory)?;
    Ok(Room::replay_generation(log)?.finish_replay(recovery, false)?.0)
}

fn read_log_prefix(directory: GenerationDirectory) -> Result<Room> {
    let (log, recovery) = Log::open_generation_prefix(directory)?;
    let room = Room::replay_generation(log)?;
    if recovery.truncated_bytes == 0 {
        Ok(room.finish_replay(recovery, false)?.0)
    } else {
        Ok(room)
    }
}

impl OpenMode {
    fn raster_store(
        self,
        directory: RasterDirectory,
        binding: &str,
    ) -> Result<(AssetStore, RasterCustody)> {
        #[cfg(feature = "server")]
        if matches!(
            self,
            Self::InspectPendingRaster
                | Self::InspectNativePrefixAndRaster
                | Self::InspectPendingRotationAndRaster
        ) {
            return directory.into_store_for_upload_inspection(binding);
        }
        directory.into_store(binding)
    }
}
impl OperationalLogGenerationServerRoom {
    /// Reacquire this actual joined recovery and its selected native/raster owners. A committed
    /// handoff admits genuine complete descendants; a partial marker requires the exact source.
    /// Expected source and `HostReacquired` policy must come from trusted host configuration.
    /// Host-authenticated principal must be the owner. No network/provider/client starts.
    /// # Errors
    /// Absent intent/wrong source, competing owners, changed controls/custody, divergent history,
    /// torn native tails, pending rotations/uploads or native admission errors refuse. Files are
    /// never rolled back, trimmed or scavenged; preserve them for explicit host-directed recovery.
    pub fn resume(
        root: &Path,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
        principal: &str,
    ) -> Result<Self> {
        Self::open_operational(root, backup, expected, policy, principal, OpenMode::Resume)
    }

    pub(super) fn open_operational(
        root: &Path,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
        principal: &str,
        mode: OpenMode,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        let directory = GenerationDirectory::open(root)?;
        let marker: Marker = files::read(&directory.path.join(".recovery.json"))?;
        credentials::hash(&marker.id)?;
        if marker.format != "breditor/server-log-generation-room-recovery"
            || marker.format_version != 1
            || marker.identity != *expected
        {
            return Err(Error::Contract("continuing joined recovery source differs"));
        }
        let context = Context::read(&directory, &marker)?;
        if !matches!(mode, OpenMode::Resume) && !context.committed {
            return Err(Error::Contract("existing committed operational marker required"));
        }
        let attempt = ServerLogGenerationRoomRecovery {
            directory,
            marker,
            #[cfg(test)]
            stop_after: None,
        };
        let native_selection = attempt
            .native_selection()?
            .ok_or(Error::Contract("continuing joined native selection absent"))?;
        let raster_selection = attempt
            .raster_selection()?
            .ok_or(Error::Contract("continuing joined raster selection absent"))?;
        let controls = RecoveryControlSeal::capture_excluding(
            &attempt.directory,
            None,
            &context.extra,
            &std::collections::BTreeSet::from([
                native_selection.directory.clone(),
                raster_selection.directory.clone(),
            ]),
        )?;
        if controls.fingerprint()? != context.marker.selection.controls {
            return Err(Error::Contract("continuing joined recovery controls differ"));
        }
        let native_directory =
            GenerationDirectory::open(&attempt.directory.path.join(&native_selection.directory))?;
        let native = RecoveredLogGenerationRoom::open_continuing(
            native_directory,
            backup.native(),
            &native_selection.witness,
            context.marker.selection.native_controls,
            |directory| read_operating_log(directory, mode),
        )?;
        let native_controls = native.recovery_control_seal()?;
        let raster_directory = RasterDirectory::open(
            &attempt.directory.path.join(&raster_selection.directory),
            &raster_selection.witness,
        )?;
        let (assets, raster) =
            mode.raster_store(raster_directory, native.room().asset_binding())?;
        let (authority, native_directory) = native.into_joined_parts();
        let custody = super::super::custody::JoinedRecoveryCustody {
            directory: attempt.directory,
            marker: attempt.marker,
            controls,
            native_controls,
            native_directory,
            raster,
        };
        let mut recovered = RecoveredLogGenerationServerRoom { custody, room: authority, assets };
        match mode {
            // This mode is used only by the dedicated inspection, which checks the captured
            // physical ancestry under the same retained component custody.
            #[cfg(feature = "server")]
            OpenMode::InspectPendingRotation
            | OpenMode::InspectPendingRotationAndRaster
            | OpenMode::InspectPendingRaster
            | OpenMode::InspectNativePrefixAndRaster => {}
            _ => recovered.check_source(backup, principal, !context.committed, &context.extra)?,
        }
        if matches!(mode, OpenMode::Resume) {
            context.publish(&recovered.custody.directory, &Interruption::default())?;
            recovered.check_source(backup, principal, !context.committed, &context.extra)?;
        }
        let value = Self { recovered, context };
        if !value.context.guard(&value.recovered.custody.directory)? {
            return Err(Error::Contract("continuing generation marker not committed"));
        }
        Ok(value)
    }
}
