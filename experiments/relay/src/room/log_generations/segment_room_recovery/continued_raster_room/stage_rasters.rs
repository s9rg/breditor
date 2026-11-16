//! Durable evidence of additions sourced from original client files during an absent-only restore.
use super::{ContinuedAssetBackupFiles, ContinuedAssetStore, RecoveredContinuedRasterRoom};
use crate::{
    Result,
    assets::AssetBackupIdentity,
    room::log_generations::segment_room_recovery::{
        client_rasters::SelectedRaster, restore_retaining_client_uploads::check_queued_rasters,
    },
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StagedRasters {
    pub ids: Vec<String>,
    pub active: AssetBackupIdentity,
}

impl StagedRasters {
    pub fn install(
        assets: &mut ContinuedAssetStore,
        inputs: &[SelectedRaster<'_>],
    ) -> Result<Option<Self>> {
        if inputs.is_empty() {
            return Ok(None);
        }
        for input in inputs {
            assets.put(input.prepare()?)?;
        }
        let active = assets.active_backup_identity()?;
        let ids = inputs.iter().map(|input| input.info.asset.clone()).collect();
        Ok(Some(Self { ids, active }))
    }

    pub fn verify(
        &self,
        files: &ContinuedAssetBackupFiles,
        assets: &ContinuedAssetStore,
    ) -> Result<()> {
        check_queued_rasters(&self.ids)?;
        files.check_active_extension(assets, &self.ids, &self.active)
    }
}

impl RecoveredContinuedRasterRoom {
    /// Exact content IDs staged from selected client originals during this restore.
    #[must_use]
    pub fn staged_rasters(&self) -> &[String] {
        self.completed.staged.as_ref().map_or(&[], |staged| staged.ids.as_slice())
    }
}
