//! Repack a stopped portable backup using bounded reads from its selected files.
use super::{
    backup_files::copy_file,
    capture::{CHECKPOINT, NATIVE, RASTERS},
    native_lineage, packed_clients,
    packed_native_lineage::Encoding,
    portable_backup::NamedPortableBackup,
    retained_backup::ClientLayout,
};
use crate::{
    MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, RelaySegmentBaseFile, Result,
    assets::MAX_SERVER_ASSET_BACKUP_BYTES,
    log::generations::GenerationDirectory,
    server::{
        RelaySegmentPortableBackupIdentity, RelaySegmentRetainedBackup,
        RelaySegmentRetiredHistorySelection,
    },
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
        Self::copy_portable_with_layout(
            source,
            destination,
            expected,
            ClientLayout::Split,
            Encoding::Raw,
            None,
        )
        .map(|_| ())
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
        Self::copy_portable_with_layout(
            source,
            destination,
            expected,
            ClientLayout::Packed,
            Encoding::Raw,
            None,
        )
        .map(|_| ())
    }

    /// Copy an existing portable backup with lossless predecessor checkpoint compression.
    /// Supply the independently saved selection and a fresh path. The ordinary packed
    /// copy methods can export the exact original checkpoint representation again.
    /// # Errors
    /// Refuses invalid inputs or invalid destinations. A failed attempt may leave a
    /// partial target. Retry at a fresh path.
    pub fn copy_portable_with_compressed_checkpoints(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<()> {
        Self::copy_portable_with_layout(
            source,
            destination,
            expected,
            ClientLayout::Packed,
            Encoding::Compressed,
            None,
        )
        .map(|_| ())
    }

    /// Verify the selected portable backup and copy it into a fresh directory.
    /// Omit certified predecessor WAL archives while retaining the original selection,
    /// exact checkpoints, terminal archive and every retained client input.
    ///
    /// # Errors
    /// Refuses changed inputs, unsupported paths and occupied destinations.
    /// Retry a failed copy at another absent path.
    pub fn copy_portable_with_compacted_history(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<()> {
        Self::copy_portable_with_layout(
            source,
            destination,
            expected,
            ClientLayout::Packed,
            Encoding::Compacted,
            None,
        )
        .map(|_| ())
    }

    /// Copy an independently selected backup into a new portable directory.
    /// Retire every predecessor archive after verifying its original cut and
    /// carry a supplemental proof for each older checkpoint. Keep the returned
    /// selection in trusted recovery storage outside the backup.
    ///
    /// # Errors
    /// Refuses changed input, missing ancestry, oversized proof data,
    /// occupied destinations and inputs that already require a retirement selection.
    pub fn copy_portable_with_retired_history(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<RelaySegmentRetiredHistorySelection> {
        let lineage_sha256 = Self::copy_portable_with_layout(
            source,
            destination,
            expected,
            ClientLayout::Packed,
            Encoding::Retired,
            None,
        )?;
        Ok(RelaySegmentRetiredHistorySelection { backup: expected.clone(), lineage_sha256 })
    }

    /// Copy a selected retirement pack using a proof for each ancestor and
    /// the original full terminal checkpoint. Retain the new selection separately.
    ///
    /// # Errors
    /// Refuses changed storage, unavailable input, an unsupported proof,
    /// oversized data and occupied or nested destinations.
    pub fn copy_portable_with_ancestry_proofs(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentRetiredHistorySelection,
    ) -> Result<RelaySegmentRetiredHistorySelection> {
        let lineage_sha256 = Self::copy_portable_with_layout(
            source,
            destination,
            expected.backup(),
            ClientLayout::Packed,
            Encoding::Proofs,
            expected.lineage_sha256,
        )?;
        Ok(RelaySegmentRetiredHistorySelection {
            backup: expected.backup().clone(),
            lineage_sha256,
        })
    }

    fn copy_portable_with_layout(
        source: &Path,
        destination: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
        layout: ClientLayout,
        encoding: Encoding,
        source_digest: Option<[u8; 32]>,
    ) -> Result<Option<[u8; 32]>> {
        expected.retained.verify_pins(&BTreeSet::new())?;
        let source = GenerationDirectory::open(source)?;
        let destination = source.create_outside(destination)?;
        let digest = native_lineage::copy_packed(
            &source,
            &destination,
            &expected.native_predecessors,
            encoding,
            source_digest,
        )?;
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
        NamedPortableBackup::open_at_digest(destination, expected, digest)?;
        Ok(digest)
    }
}
