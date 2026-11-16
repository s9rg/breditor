//! A portable backup includes each linked native component needed to open the retained cut.
use super::{
    capture::begin_capture,
    native_lineage::{LineageLayout, NativeLineage},
    packed_native_lineage::Encoding,
    retained_backup::{
        ClientLayout, RelaySegmentRetainedBackup, RelaySegmentRetainedBackupIdentity,
        RetainedBackupCopies, RetainedCopies,
    },
};
use crate::{
    Error, RelaySegmentBaseFile, RelaySegmentBaseIdentity, RelaySegmentRoomBackupIdentity, Result,
    log::generations::GenerationDirectory, room::SegmentCheckpointEncoding,
    server::ServerBackupHandle,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Independently selected portable room cut and all its linked native predecessors.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentPortableBackupIdentity {
    /// Latest native and raster cut with all retained client input pins.
    pub retained: RelaySegmentRetainedBackupIdentity,
    /// Oldest to newest. Each pair is named `native-lineage/{index}.archive` and
    /// `native-lineage/{index}.checkpoint` in a split backup. A packed backup
    /// stores the same ordered bytes in `native-lineage/packed.bin`.
    pub native_predecessors: Vec<RelaySegmentBaseIdentity>,
}

/// Independently retained selection for a portable pack that retires older archives.
/// The original room backup identity still names the same absolute cut and histories.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentRetiredHistorySelection {
    pub(super) backup: RelaySegmentPortableBackupIdentity,
    pub(super) lineage_sha256: Option<[u8; 32]>,
}

impl RelaySegmentRetiredHistorySelection {
    /// Original portable room cut to use for seal and deployment decisions.
    #[must_use]
    pub fn backup(&self) -> &RelaySegmentPortableBackupIdentity {
        &self.backup
    }
}

impl RelaySegmentRetainedBackup {
    /// Open a portable bundle using its independently saved identity.
    /// Every linked predecessor is verified from the bundle itself.
    ///
    /// # Errors
    /// Refuses incomplete or altered files, changed membership, or a different native lineage.
    pub fn open_portable(
        path: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<Self> {
        Ok(NamedPortableBackup::open(path, expected)?.copies.into_backup())
    }

    /// Open a migrated backup with its original cut and separately retained pack digest.
    ///
    /// # Errors
    /// Refuses absent or changed files, stale selections and inconsistent retirement proofs.
    pub fn open_portable_with_retired_history(
        path: &Path,
        expected: &RelaySegmentRetiredHistorySelection,
    ) -> Result<Self> {
        Ok(NamedPortableBackup::open_retired(path, expected)?.copies.into_backup())
    }
}

/// The path-bound witnesses stay held while the portable seal is committed.
pub(in crate::server) struct NamedPortableBackup {
    directory: GenerationDirectory,
    lineage: NativeLineage,
    copies: RetainedBackupCopies,
}

impl NamedPortableBackup {
    pub(in crate::server) fn checkpoint_encoding(&self) -> Result<SegmentCheckpointEncoding> {
        self.copies.room.backup.checkpoint_encoding()
    }

    pub(super) fn open(path: &Path, expected: &RelaySegmentPortableBackupIdentity) -> Result<Self> {
        Self::open_at(GenerationDirectory::open(path)?, expected)
    }

    pub(super) fn open_at(
        directory: GenerationDirectory,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<Self> {
        Self::open_at_digest(directory, expected, None)
    }

    pub(super) fn open_retired(
        path: &Path,
        expected: &RelaySegmentRetiredHistorySelection,
    ) -> Result<Self> {
        if expected.lineage_sha256.is_some() == expected.backup.native_predecessors.is_empty() {
            return Err(Error::Contract("portable archive retirement selection shape"));
        }
        Self::open_at_digest(
            GenerationDirectory::open(path)?,
            &expected.backup,
            expected.lineage_sha256,
        )
    }

    pub(super) fn open_at_digest(
        directory: GenerationDirectory,
        expected: &RelaySegmentPortableBackupIdentity,
        digest: Option<[u8; 32]>,
    ) -> Result<Self> {
        let lineage = NativeLineage::open_with_retired_digest(
            &directory,
            &expected.native_predecessors,
            digest,
        )?;
        let copies = RetainedBackupCopies::open(&directory, lineage.parent(), &expected.retained)?;
        let backup = Self { directory, lineage, copies };
        backup.check_files()?;
        Ok(backup)
    }

    pub(in crate::server) fn identity(&self) -> &RelaySegmentRoomBackupIdentity {
        self.copies.room.backup.identity()
    }

    pub(in crate::server) fn check_files(&self) -> Result<()> {
        self.directory.guard()?;
        self.lineage.check()?;
        self.copies.check(&self.directory)
    }

    pub(in crate::server) fn check_retired_history(
        &self,
        source: Option<&RelaySegmentBaseFile>,
    ) -> Result<()> {
        self.lineage.check_retired_history(source)
    }
}

impl ServerBackupHandle {
    /// Capture the exact native and raster cut, its native predecessor chain, and the
    /// client archives already held by the relay. Retain the returned identity independently.
    /// Predecessors and client archives copy outside the initial serving transaction.
    /// Run this blocking operation off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, a superseded epoch, changed files and occupied destinations.
    /// Retry a failed capture at another absent path.
    pub fn capture_portable_relay_segment(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_relay_segment_with_layout(
            principal,
            token,
            destination,
            LineageLayout::Split,
            ClientLayout::Split,
            SegmentCheckpointEncoding::Original,
        )
    }

    /// Capture the same selected room and predecessors as a split portable backup.
    /// Store all native predecessor pairs in one file. Opening the bundle holds
    /// one descriptor for that file regardless of the number of predecessors.
    /// Older readers require the split layout. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, a superseded epoch, changed inputs,
    /// occupied destinations and I/O failures. Retry at another absent path.
    pub fn capture_packed_portable_relay_segment(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_relay_segment_with_layout(
            principal,
            token,
            destination,
            LineageLayout::Packed(Encoding::Raw),
            ClientLayout::Split,
            SegmentCheckpointEncoding::Original,
        )
    }

    /// Capture a portable room with one file for native predecessors and another for
    /// retained client inputs. The independent selection and exact original bytes
    /// match the split capture at the same source cut. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, a superseded epoch, changed inputs,
    /// occupied destinations and I/O failures. Retry at another absent path.
    pub fn capture_fully_packed_portable_relay_segment(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_relay_segment_with_layout(
            principal,
            token,
            destination,
            LineageLayout::Packed(Encoding::Raw),
            ClientLayout::Packed,
            SegmentCheckpointEncoding::Original,
        )
    }

    /// Capture a fully packed portable backup using lossless compression for predecessor
    /// checkpoints. The original checkpoint bytes and independently saved identity are
    /// verified before the capture is confirmed. Run off async I/O workers.
    /// # Errors
    /// Refuses invalid owner authentication, stale authority, changed files,
    /// occupied destinations and I/O failures. Retry at a fresh absent path.
    pub fn capture_portable_relay_segment_with_compressed_checkpoints(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_relay_segment_with_layout(
            principal,
            token,
            destination,
            LineageLayout::Packed(Encoding::Compressed),
            ClientLayout::Packed,
            SegmentCheckpointEncoding::Original,
        )
    }

    /// Capture a portable backup that preserves literal asset packet history at the terminal cut.
    /// On recovery, asset inventory reads that checkpoint projection for the indexed segment.
    /// The backup still includes the original WAL and uses compressed ancestor checkpoints.
    ///
    /// # Errors
    /// Refuses unauthorized or superseded sources, changed files, oversized history,
    /// occupied destinations and I/O failures. Retry at a fresh absent path.
    pub fn capture_portable_relay_segment_with_indexed_asset_history(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_relay_segment_with_layout(
            principal,
            token,
            destination,
            LineageLayout::Packed(Encoding::Compressed),
            ClientLayout::Packed,
            SegmentCheckpointEncoding::IndexedAssetHistory,
        )
    }

    /// Copy a portable room while retiring WAL archives for certified predecessors.
    /// The terminal segment is captured in full and can be compacted as an ancestor.
    /// Keep the selected identity independently so recovery can verify the retained bytes.
    ///
    /// # Errors
    /// Refuses unauthorized or superseded sources, changing inputs, oversized histories,
    /// occupied destinations and I/O errors. Retry at a fresh absent path.
    pub fn capture_portable_relay_segment_with_compacted_history(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_relay_segment_with_layout(
            principal,
            token,
            destination,
            LineageLayout::Packed(Encoding::Compacted),
            ClientLayout::Packed,
            SegmentCheckpointEncoding::Compactable,
        )
    }

    fn capture_portable_relay_segment_with_layout(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
        lineage_layout: LineageLayout,
        client_layout: ClientLayout,
        encoding: SegmentCheckpointEncoding,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        self.capture_portable_with_lineage(
            principal,
            token,
            destination,
            lineage_layout,
            client_layout,
            encoding,
        )
        .map(|selection| selection.backup)
    }

    /// Capture an authenticated portable cut and retire all verified predecessor archives,
    /// including those written before compactable checkpoints were supported.
    /// Retain the returned selection independently of the backup files.
    ///
    /// # Errors
    /// Refuses unauthorized or superseded sources, changed files, oversized history
    /// and occupied destinations. Retry at a fresh absent path after failure.
    pub fn capture_portable_relay_segment_with_retired_history(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentRetiredHistorySelection> {
        self.capture_portable_with_lineage(
            principal,
            token,
            destination,
            LineageLayout::Retired,
            ClientLayout::Packed,
            SegmentCheckpointEncoding::Compactable,
        )
    }

    /// Capture the exact serving cut with proof-only predecessors and a full
    /// terminal checkpoint. Retain the resulting selection outside the backup.
    ///
    /// # Errors
    /// Refuses unavailable ancestry, changed files, stale authority and occupied
    /// destinations. Retry failed capture at a fresh absent path.
    pub fn capture_portable_relay_segment_with_ancestry_proofs(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentRetiredHistorySelection> {
        self.capture_portable_with_lineage(
            principal,
            token,
            destination,
            LineageLayout::Proofs,
            ClientLayout::Packed,
            SegmentCheckpointEncoding::Compactable,
        )
    }

    /// Capture a portable room with proof-only predecessors and an extended,
    /// losslessly compressed terminal checkpoint. The independent identity
    /// selects the decoded checkpoint. Native lane limits continue to apply.
    ///
    /// # Errors
    /// Refuses changed ancestry, unauthorized or superseded sources, over-budget
    /// checkpoint data, occupied destinations and I/O failures.
    pub fn capture_portable_relay_segment_with_extended_terminal(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentRetiredHistorySelection> {
        self.capture_portable_with_lineage(
            principal,
            token,
            destination,
            LineageLayout::Proofs,
            ClientLayout::Packed,
            SegmentCheckpointEncoding::ExtendedTerminal,
        )
    }

    fn capture_portable_with_lineage(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
        lineage_layout: LineageLayout,
        client_layout: ClientLayout,
        encoding: SegmentCheckpointEncoding,
    ) -> Result<RelaySegmentRetiredHistorySelection> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        let (captured, source_epoch) = begin_capture(host, principal, destination, encoding)?;
        let (retained, client_copies) =
            RetainedCopies::capture(host, &captured, source_epoch, client_layout)?;
        let (native_predecessors, lineage) =
            NativeLineage::export(&captured.directory, captured.parent.as_deref(), lineage_layout)?;
        captured.confirm(host, &retained.source_epoch, || {
            if let Some(parent) = &captured.parent {
                parent.check()?;
            }
            lineage.check()?;
            client_copies.check(&captured.directory)
        })?;
        Ok(RelaySegmentRetiredHistorySelection {
            backup: RelaySegmentPortableBackupIdentity { retained, native_predecessors },
            lineage_sha256: lineage.retired_digest(),
        })
    }
}
