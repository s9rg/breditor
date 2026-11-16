//! Portable pair of original bounded archives captured under one continued raster owner.
use super::{ContinuedAssetBackupIdentity, ContinuedAssetStore, FORMAT};
use crate::Result;
use std::io::Write;

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
