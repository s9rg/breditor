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
    RelaySegmentBaseIdentity, RelaySegmentRoomBackupIdentity, Result,
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
}

/// The path-bound witnesses stay held while the portable seal is committed.
pub(in crate::server) struct NamedPortableBackup {
    directory: GenerationDirectory,
    lineage: NativeLineage,
    copies: RetainedBackupCopies,
}

impl NamedPortableBackup {
    pub(in crate::server) fn checkpoint_encoding(&self) -> SegmentCheckpointEncoding {
        self.copies.room.backup.checkpoint_encoding()
    }

    pub(super) fn open(path: &Path, expected: &RelaySegmentPortableBackupIdentity) -> Result<Self> {
        Self::open_at(GenerationDirectory::open(path)?, expected)
    }

    pub(super) fn open_at(
        directory: GenerationDirectory,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<Self> {
        let lineage = NativeLineage::open(&directory, &expected.native_predecessors)?;
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

    fn capture_portable_relay_segment_with_layout(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
        lineage_layout: LineageLayout,
        client_layout: ClientLayout,
        encoding: SegmentCheckpointEncoding,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
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
        Ok(RelaySegmentPortableBackupIdentity { retained, native_predecessors })
    }
}
