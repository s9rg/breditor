//! Preserve the active store's exact staged upload separately from admitted immutable images.
use super::ContinuedAssetStore;
use crate::{
    Result,
    assets::{AssetBackupIdentity, PendingRasterUpload},
};

impl ContinuedAssetStore {
    pub(in crate::room::log_generations) fn inspect_pending_upload(
        &self,
    ) -> Result<Option<PendingRasterUpload>> {
        self.guard()?;
        self.active.inspect_pending_upload()
    }

    pub(in crate::room::log_generations) fn active_identity_with_pending(
        &self,
        pending: Option<&PendingRasterUpload>,
    ) -> Result<AssetBackupIdentity> {
        self.guard()?;
        let active = self
            .active
            .prepare_backup_stream_with_pending(pending.map(|file| file.file_name.as_str()))?;
        if let Some(pending) = pending {
            self.active.recheck_pending_upload(pending.selection_sha256)?;
        }
        self.guard()?;
        Ok(active.identity)
    }

    pub(in crate::room::log_generations) fn finish_pending_upload(
        &mut self,
        selected: Option<&PendingRasterUpload>,
    ) -> Result<()> {
        self.guard()?;
        if let Some(selected) = selected {
            self.active.retire_pending_upload(selected)?;
        } else {
            self.active.sync_retired_upload()?;
        }
        self.guard()
    }
}
