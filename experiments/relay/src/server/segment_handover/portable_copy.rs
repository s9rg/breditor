//! Repack a stopped portable backup using bounded reads from its selected files.
use super::{
    backup_files::copy_file,
    capture::{CHECKPOINT, NATIVE, RASTERS},
    native_lineage, packed_clients,
    portable_backup::NamedPortableBackup,
    retained_backup::ClientLayout,
};
use crate::{
    MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, RelaySegmentBaseFile, Result,
    assets::MAX_SERVER_ASSET_BACKUP_BYTES,
    log::generations::GenerationDirectory,
    server::{RelaySegmentPortableBackupIdentity, RelaySegmentRetainedBackup},
};
use std::{collections::BTreeSet, path::Path};

impl RelaySegmentRetainedBackup {
    /// Copy a split or packed backup into a new portable directory with packed predecessors.
    /// Supply the independently saved identity. The original files and serving authority are
    /// left intact. Copying keeps at most one predecessor pair open at a time, then verifies
    /// the complete destination using ordinary portable admission. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses changed or missing inputs, invalid selections, a destination within the source,
    /// an occupied destination, and I/O errors. A failed copy may leave a partial destination.
    /// Use another absent path to retry.
    pub fn copy_portable_packed(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<()> {
        Self::copy_portable_with_layout(source, destination, expected, ClientLayout::Split)
    }

    /// Copy into a fresh portable directory with native predecessors and retained
    /// client inputs in separate packed files. Validate all ranges against the
    /// independently saved identity. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid inputs, an occupied destination or a destination under the
    /// source. A failed copy may leave a partial destination. Retry at a fresh path.
    pub fn copy_portable_fully_packed(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<()> {
        Self::copy_portable_with_layout(source, destination, expected, ClientLayout::Packed)
    }

    fn copy_portable_with_layout(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
        layout: ClientLayout,
    ) -> Result<()> {
        expected.retained.verify_pins(&BTreeSet::new())?;
        let source = GenerationDirectory::open(source)?;
        let destination = source.create_outside(destination)?;
        native_lineage::copy_packed(&source, &destination, expected.native_predecessors.len())?;
        for (name, limit) in [
            (NATIVE, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES),
            (CHECKPOINT, RelaySegmentBaseFile::CHECKPOINT_LIMIT),
            (RASTERS, MAX_SERVER_ASSET_BACKUP_BYTES),
        ] {
            copy_file(&source, &destination, name, limit)?;
        }
        match layout {
            ClientLayout::Split => expected.retained.copy_clients(&source, &destination)?,
            ClientLayout::Packed => {
                packed_clients::copy(&source, &destination, &expected.retained)?;
            }
        }
        source.guard()?;
        destination.sync()?;
        NamedPortableBackup::open_at(destination, expected)?;
        Ok(())
    }
}
