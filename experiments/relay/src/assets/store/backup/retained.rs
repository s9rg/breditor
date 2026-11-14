//! Verify a complete live store retains each original immutable file.
use super::{AssetBackupIdentity, AssetStore, AssetStoreBackup};
use crate::{Result, archive_input::ArchiveEntry};
use std::collections::BTreeMap;

impl AssetStore {
    pub(crate) fn verify_retained_backup(
        &mut self,
        original: &AssetStoreBackup,
    ) -> Result<AssetBackupIdentity> {
        let entry = |section: &super::format::Section| ArchiveEntry {
            offset: section.offset,
            bytes: section.bytes,
            sha256: section.sha256,
        };
        let originals = std::iter::once(("store.json".into(), entry(&original.header.manifest)))
            .chain(original.header.records.iter().map(|record| {
                (super::selected_files::record_name(&record.info.asset), entry(&record.record))
            }))
            .collect::<BTreeMap<_, _>>();
        // Admit every live record, including unreferenced later uploads, one raster at a time.
        let current = self.prepare_backup_stream()?;
        current.check_retains(&original.identity, &originals)?;
        Ok(current.identity)
    }
}
