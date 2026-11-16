//! Verify the original records and an exact selected addition to the active generation.
use super::{ContinuedAssetBackupFiles, ContinuedAssetStore};
use crate::{
    Error, Result,
    archive_input::ArchiveEntry,
    assets::{AssetBackupIdentity, asset_key},
};
use std::collections::BTreeMap;

impl ContinuedAssetBackupFiles {
    pub(in crate::room::log_generations) fn active_entries(
        &self,
    ) -> &BTreeMap<String, ArchiveEntry> {
        self.active.entries()
    }

    pub(in crate::room::log_generations) fn check_new_rasters(
        &self,
        selected: &[String],
    ) -> Result<()> {
        for id in selected {
            let digest = asset_key(id)?;
            if self.retained.contains(digest)
                || self.active.entries().contains_key(&format!("{digest}.asset"))
            {
                return Err(Error::Contract(
                    "selected client raster already belongs to the capture",
                ));
            }
        }
        self.check()
    }

    pub(in crate::room::log_generations) fn check_active_extension(
        &self,
        current: &ContinuedAssetStore,
        selected: &[String],
        rolled: bool,
        expected: &AssetBackupIdentity,
    ) -> Result<()> {
        self.check_active_prefix(current, selected, rolled, Some(expected), None)
    }

    pub(in crate::room::log_generations) fn check_serving_prefix(
        &self,
        current: &ContinuedAssetStore,
        selected: &[String],
        rolled: bool,
        pending: Option<&str>,
    ) -> Result<()> {
        self.check_active_prefix(current, selected, rolled, None, pending)
    }

    fn check_active_prefix(
        &self,
        current: &ContinuedAssetStore,
        selected: &[String],
        rolled: bool,
        exact: Option<&AssetBackupIdentity>,
        pending: Option<&str>,
    ) -> Result<()> {
        self.check_new_rasters(selected)?;
        current.guard()?;
        let active = current.active.prepare_backup_stream_with_pending(pending)?;
        let original_assets = if rolled {
            current.identity.lineage.check_rollover_from(
                &self.lineage,
                self.retained.root_archive_bytes(),
                &self.active.identity,
                self.active.bytes(),
            )?;
            0
        } else {
            if current.identity.lineage != self.lineage {
                return Err(Error::Contract("continued raster lineage differs"));
            }
            active.check_retains(&self.active.identity, self.active.entries())?;
            self.active.identity.assets
        };
        if exact.is_some_and(|expected| {
            active.identity != *expected
                || active.identity.assets != original_assets + selected.len() as u64
        }) {
            return Err(Error::Contract("staged continued raster cut differs"));
        }
        for id in selected {
            if current.active.get(id)?.is_none() {
                return Err(Error::Contract("selected staged raster missing"));
            }
        }
        current.guard()?;
        self.check()
    }
}

impl ContinuedAssetStore {
    pub(in crate::room::log_generations) fn active_backup_identity(
        &self,
    ) -> Result<AssetBackupIdentity> {
        self.guard()?;
        let identity = self.active.prepare_backup_stream()?.identity;
        self.guard()?;
        Ok(identity)
    }
}
