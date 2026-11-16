//! Portable retained and active archives captured under one continued raster owner.
use super::{
    AssetArchive, ContinuedAssetBackupIdentity, ContinuedAssetStore, FORMAT, Lineage,
    RetainedArchives,
};
use crate::{Error, Result};
use std::{fs::File, io::Write, path::Path};

pub(in crate::room::log_generations) struct ContinuedAssetBackupFiles {
    pub(super) retained: RetainedArchives,
    pub(super) active: AssetArchive,
    pub(super) lineage: Lineage,
}

impl ContinuedAssetBackupFiles {
    pub(in crate::room::log_generations) fn admit(
        predecessor: File,
        active: File,
        selected: &ContinuedAssetBackupIdentity,
    ) -> Result<Self> {
        if selected.format != FORMAT
            || selected.format_version != selected.lineage.format_version()
            || selected.active.binding != selected.lineage.active_binding()?
        {
            return Err(Error::Contract("raster continuation backup selection differs"));
        }
        let retained = RetainedArchives::admit(predecessor, &selected.lineage)?;
        let active = AssetArchive::admit(active, selected.active())?;
        if active.keys().any(|digest| retained.contains(digest)) {
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
        ContinuedAssetStore::install(
            path,
            self.lineage.clone(),
            &self.retained,
            None,
            Some(&self.active),
        )
    }

    #[cfg(feature = "server")]
    pub(in crate::room::log_generations) fn check_rollover_capacity(&self) -> Result<()> {
        self.lineage.check_rollover(&self.active.identity)
    }

    pub(in crate::room::log_generations) fn rollover(
        &self,
        path: &Path,
    ) -> Result<ContinuedAssetStore> {
        let lineage = self.lineage.next(
            self.retained.root_archive_bytes(),
            &self.active.identity,
            self.active.bytes(),
        )?;
        ContinuedAssetStore::install(path, lineage, &self.retained, Some(&self.active), None)
    }
}

impl ContinuedAssetStore {
    /// Compare the held immutable pack selection and the actual current active archive.
    /// The pack was fully admitted when its inode was opened. Both guards check that same
    /// named file and change stamp while active records are streamed for the comparison.
    #[cfg(feature = "server")]
    pub(crate) fn matches_backup(&self, selected: &ContinuedAssetBackupIdentity) -> Result<bool> {
        self.guard()?;
        let matches = selected.format == FORMAT
            && selected.format_version == self.identity.format_version
            && selected.lineage == self.identity.lineage
            && selected.active == self.active.prepare_backup_stream()?.identity;
        self.guard()?;
        Ok(matches)
    }

    /// Stream the unchanged retained archives and the active store to separate outputs.
    /// Retain the returned selection independently of both archive files.
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
            format_version: self.identity.format_version,
            lineage: self.identity.lineage.clone(),
            active,
        })
    }
}
