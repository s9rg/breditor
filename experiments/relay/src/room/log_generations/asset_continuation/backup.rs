//! Portable pair of original bounded archives captured under one continued raster owner.
use super::{AssetArchive, ContinuedAssetBackupIdentity, ContinuedAssetStore, FORMAT, Lineage};
use crate::{Error, Result};
use std::{collections::BTreeSet, fs::File, io::Write, path::Path};

pub(in crate::room::log_generations) struct ContinuedAssetBackupFiles {
    retained: AssetArchive,
    active: AssetArchive,
    lineage: Lineage,
}

impl ContinuedAssetBackupFiles {
    pub(in crate::room::log_generations) fn admit(
        predecessor: File,
        active: File,
        selected: &ContinuedAssetBackupIdentity,
    ) -> Result<Self> {
        if selected.format != FORMAT
            || selected.format_version != 1
            || selected.active.binding != selected.lineage.active_binding()?
        {
            return Err(Error::Contract("raster continuation backup selection differs"));
        }
        let retained = AssetArchive::admit(predecessor, selected.predecessor())?;
        let active = AssetArchive::admit(active, selected.active())?;
        let previous: BTreeSet<_> = retained.keys().collect();
        if active.keys().any(|digest| previous.contains(digest)) {
            return Err(Error::Contract("raster continuation generations overlap"));
        }
        Ok(Self { retained, active, lineage: selected.lineage.clone() })
    }

    #[cfg(feature = "server")]
    pub(in crate::room::log_generations) fn check(&self) -> Result<()> {
        self.retained.check()?;
        self.active.check()
    }

    pub(in crate::room::log_generations) fn restore(
        &self,
        path: &Path,
    ) -> Result<ContinuedAssetStore> {
        ContinuedAssetStore::install(path, self.lineage.clone(), &self.retained, Some(&self.active))
    }
}

impl ContinuedAssetStore {
    /// Stream the unchanged original predecessor and the active store to separate outputs.
    /// Retain the returned pair selection independently of both archive files.
    ///
    /// # Errors
    /// Refuses changed custody, invalid file bytes, poisoned active state or output failures.
    pub fn write_backup(
        &self,
        predecessor: &mut impl Write,
        active: &mut impl Write,
    ) -> Result<ContinuedAssetBackupIdentity> {
        self.guard()?;
        self.retained.write_to(predecessor)?;
        let active = self.active.write_backup(active)?;
        self.guard()?;
        Ok(ContinuedAssetBackupIdentity {
            format: FORMAT.into(),
            format_version: 1,
            lineage: self.identity.lineage.clone(),
            active,
        })
    }
}

#[cfg(feature = "server")]
impl ContinuedAssetStore {
    pub(in crate::room::log_generations) fn check_backup_cut(
        &self,
        expected: &ContinuedAssetBackupIdentity,
    ) -> Result<()> {
        self.guard()?;
        if self.identity.lineage != expected.lineage
            || self.active.prepare_backup_stream()?.identity != expected.active
        {
            return Err(Error::Contract("restored continued assets advanced"));
        }
        self.guard()
    }
}
