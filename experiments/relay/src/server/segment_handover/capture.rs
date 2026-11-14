//! Stream to a private, absent-only capture directory under the live serving epoch.
use crate::{
    Error, RelaySegmentRoomBackupIdentity, Result,
    log::generations::GenerationDirectory,
    server::{RoomDeploymentSelection, ServerBackupHandle, deployment_fence},
};
use std::path::Path;

impl ServerBackupHandle {
    /// Capture the complete terminal native archive, checkpoint and raster store from a fenced host.
    /// Syncs `native.archive`, `native.checkpoint` and `rasters.archive` in an absent destination.
    /// Keep earlier native segments separately. Persist the returned identity and source epoch.
    ///
    /// # Errors
    /// Refuses non-owner calls, noncurrent leases, occupied paths and uncertain files.
    /// A failed capture may leave an incomplete directory. Retry at a new path.
    pub fn capture_relay_segment(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<(RelaySegmentRoomBackupIdentity, RoomDeploymentSelection)> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                if let Some(custody) = &host.relay_segment_custody {
                    custody.check()?;
                }
                let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                room.recovery_inventory_owner(principal)?;
                room.log_generation_descriptor(principal)?;
                let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
                let assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                let directory = GenerationDirectory::create(destination)?;
                let mut native = directory.create_file("native.archive", &[])?;
                let mut checkpoint = directory.create_file("native.checkpoint", &[])?;
                let mut raster = directory.create_file("rasters.archive", &[])?;
                let backup = room.write_relay_segment_room_backup(
                    principal,
                    &assets,
                    &mut native,
                    &mut checkpoint,
                    &mut raster,
                )?;
                for (file, name) in [
                    (&native, "native.archive"),
                    (&checkpoint, "native.checkpoint"),
                    (&raster, "rasters.archive"),
                ] {
                    file.sync_all()?;
                    crate::log::generations::GenerationFileWitness::of(file)?
                        .guard(file, &directory.path.join(name))?;
                }
                directory.sync()?;
                directory.guard()?;
                if let Some(custody) = &host.relay_segment_custody {
                    custody.check()?;
                }
                Ok((backup, lease.selection()))
            })
        })
    }
}
