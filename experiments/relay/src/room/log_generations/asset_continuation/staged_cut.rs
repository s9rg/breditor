//! Verify the original records and an exact selected addition to the active generation.
use super::{ContinuedAssetBackupFiles, ContinuedAssetBackupIdentity, ContinuedAssetStore};
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
            let name = format!("{}.asset", asset_key(id)?);
            if self.retained.entries().contains_key(&name)
                || self.active.entries().contains_key(&name)
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
        expected: &AssetBackupIdentity,
    ) -> Result<()> {
        self.check_active_prefix(current, selected, Some(expected))
    }

    pub(in crate::room::log_generations) fn check_serving_prefix(
        &self,
        current: &ContinuedAssetStore,
        selected: &[String],
    ) -> Result<()> {
        self.check_active_prefix(current, selected, None)
    }

    fn check_active_prefix(
        &self,
        current: &ContinuedAssetStore,
        selected: &[String],
        exact: Option<&AssetBackupIdentity>,
    ) -> Result<()> {
        self.check_new_rasters(selected)?;
        current.guard()?;
        let active = current.active.prepare_backup_stream()?;
        if current.identity.lineage != self.lineage
            || exact.is_some_and(|expected| {
                active.identity != *expected
                    || active.identity.assets != self.active.identity.assets + selected.len() as u64
            })
        {
            return Err(Error::Contract("staged continued raster cut differs"));
        }
        active.check_retains(&self.active.identity, self.active.entries())?;
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

    pub(in crate::room::log_generations) fn check_selected_cut(
        &self,
        capture: &ContinuedAssetBackupIdentity,
        active: &AssetBackupIdentity,
    ) -> Result<()> {
        if self.identity.lineage != capture.lineage || self.active_backup_identity()? != *active {
            return Err(Error::Contract("restored continued assets advanced"));
        }
        Ok(())
    }
}
