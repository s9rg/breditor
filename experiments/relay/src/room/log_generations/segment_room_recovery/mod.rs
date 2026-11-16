//! Bind a complete native segment chain to its exact raster archive and a new local owner.
mod capture;
#[cfg(feature = "server")]
mod continued_raster_room;
#[cfg(feature = "server")]
pub use continued_raster_room::{
    ContinuedRasterRoomBackupFiles, ContinuedRasterRoomClientArchives,
    RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity,
};
mod client_journals;
#[cfg(feature = "server")]
pub use client_journals::{
    RelaySegmentBranchClock, RelaySegmentClientJournalCoverage, RelaySegmentClientJournalHead,
    RelaySegmentPairedReviewHead, RelaySegmentParticipantBranch,
};
pub use client_journals::{
    RelaySegmentClientJournal, RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily,
    RelaySegmentJournalOwner, RelaySegmentReviewJournalFamily,
};
mod client_rasters;
pub use client_rasters::RelaySegmentClientRaster;
mod client_uploads;
pub use client_uploads::{RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin};
mod discussion_sources;
#[cfg(feature = "server")]
mod handover_target;
mod restore;
mod restore_retaining_client_uploads;
pub use restore_retaining_client_uploads::RelaySegmentQueuedRasterRestore;
#[cfg(feature = "server")]
mod serving;
#[cfg(feature = "server")]
pub(crate) use serving::RelaySegmentServingCustody;
#[cfg(test)]
mod tests;

use super::server_recovery::raster_directory::RasterCustody;
use crate::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity, Room,
    archive_input::{ArchiveEntry, ArchiveInput},
    assets::{AssetBackupIdentity, AssetStore},
    log::generations::GenerationDirectory,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Arc};

/// The exact whole room backup. Store this identity independently of the supplied archive files.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentRoomBackupIdentity {
    /// Newest native checkpoint and physical archive.
    pub native: RelaySegmentBaseIdentity,
    /// Commits to every native component in order, including the newest checkpoint.
    pub history_sha256: [u8; 32],
    /// Whole raster store, including unreferenced assets.
    pub assets: AssetBackupIdentity,
}

/// Held native history, native checkpoint and whole original raster archive.
pub struct RelaySegmentRoomBackupFiles {
    identity: RelaySegmentRoomBackupIdentity,
    native: Arc<RelaySegmentBaseFile>,
    rasters: ArchiveInput,
    entries: BTreeMap<String, ArchiveEntry>,
}

/// Restored native and raster owners. A deployment needs its own authority and client/provider
/// reconciliation. Local recovery never fences a source on another host.
pub struct RecoveredRelaySegmentRoom {
    room: Room,
    assets: AssetStore,
    raster: RasterCustody,
    directory: GenerationDirectory,
    #[cfg(feature = "server")]
    backup: RelaySegmentRoomBackupIdentity,
    #[cfg(feature = "server")]
    active: String,
    #[cfg(feature = "server")]
    client_rasters: Vec<String>,
    #[cfg(feature = "server")]
    restored_assets: crate::assets::AssetBackupIdentity,
    journals: Option<client_journals::RetainedJournals>,
    alternatives: Option<client_journals::RetainedJournals>,
    uploads: Option<client_uploads::RetainedUploads>,
}

#[cfg(feature = "server")]
pub(crate) use continued_raster_room::ContinuedServingCustody;
