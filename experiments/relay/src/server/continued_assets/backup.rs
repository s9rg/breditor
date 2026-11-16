//! Capture the actual native and continued raster cuts under one current serving permit.
use super::ContinuedAssetServerHandle;
use crate::{
    ContinuedAssetBackupIdentity, Error, RelaySegmentBaseIdentity, Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
    server::{RoomDeploymentSelection, deployment_fence},
};
use serde::{Deserialize, Serialize};
use std::path::Path;

const FORMAT: &str = "breditor/relay-continued-raster-room-backup";

/// Exact combined capture of a physical native room and both raster generations.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedRasterRoomBackupIdentity {
    /// Combined capture family.
    pub format: String,
    /// Exact combined capture revision.
    pub format_version: u32,
    /// Physical native archive and checkpoint captured under the same room lock.
    pub native: RelaySegmentBaseIdentity,
    /// Exact predecessor and active raster archives.
    pub rasters: ContinuedAssetBackupIdentity,
    /// Serving epoch at this cut. This selection gives no activation permission.
    pub source_epoch: RoomDeploymentSelection,
}

impl ContinuedRasterRoomBackupIdentity {
    pub(crate) fn check_selection(&self) -> Result<()> {
        let native = &self.native.predecessor.source;
        if self.format != FORMAT
            || self.format_version != 1
            || self.source_epoch.validate_pin()? == 0
            || native.asset_binding != self.rasters.predecessor().binding
            || native.deployment_binding()? != self.source_epoch.identity.binding
        {
            return Err(Error::Contract("continued raster room backup selection differs"));
        }
        Ok(())
    }
}

impl ContinuedAssetServerHandle {
    /// Capture an exact physical-room cut and both raster generations into an absent directory.
    /// The four private files are `native.archive`, `native.checkpoint`,
    /// `rasters-predecessor.archive`, and `rasters-active.archive`.
    /// Save the returned selection independently. Preserve any existing native predecessors
    /// and retained client archives required by the room. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses non-owner credentials, stale service, nonphysical native rooms, changed custody,
    /// occupied paths and I/O failures. A failed destination stays unpublished.
    pub fn capture(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<ContinuedRasterRoomBackupIdentity> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                let mut native = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                native.log_generation_descriptor(principal)?;
                native.recovery_inventory_owner(principal)?;
                if let Some(held) = &host.continued_custody {
                    held.check(&native)?;
                }
                let rasters = host
                    .continued_assets
                    .as_ref()
                    .ok_or(Error::NeedsRecovery)?
                    .lock()
                    .map_err(|_| Error::NeedsRecovery)?;
                rasters.guard()?;
                let output = GenerationDirectory::create(destination)?;
                let mut wal = output.create_file("native.archive", &[])?;
                let mut checkpoint = output.create_file("native.checkpoint", &[])?;
                let mut predecessor = output.create_file("rasters-predecessor.archive", &[])?;
                let mut active = output.create_file("rasters-active.archive", &[])?;
                let native = native.write_relay_segment_base_with_compactable_history(
                    principal,
                    &mut wal,
                    &mut checkpoint,
                )?;
                let rasters = rasters.write_backup(&mut predecessor, &mut active)?;
                for (name, file) in [
                    ("native.archive", &wal),
                    ("native.checkpoint", &checkpoint),
                    ("rasters-predecessor.archive", &predecessor),
                    ("rasters-active.archive", &active),
                ] {
                    file.sync_all()?;
                    GenerationFileWitness::of(file)?.guard(file, &output.path.join(name))?;
                }
                output.sync()?;
                output.guard()?;
                Ok(ContinuedRasterRoomBackupIdentity {
                    format: FORMAT.into(),
                    format_version: 1,
                    native,
                    rasters,
                    source_epoch: lease.selection(),
                })
            })
        })
    }
}
