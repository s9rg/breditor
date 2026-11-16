//! Exact, unserved reconstruction of a native cut and two continued raster generations.
mod clients;
mod inspect;
mod open;
mod reconciliation;
mod restore;
mod serving;
mod stage_rasters;
pub(crate) use serving::ContinuedServingCustody;

use super::super::asset_continuation::ContinuedAssetBackupFiles;
use crate::{
    ContinuedAssetStore, RelaySegmentBaseFile, Room, log::generations::GenerationDirectory,
    server::ContinuedRasterRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub use clients::ContinuedRasterRoomClientArchives;

/// Held portable continued-raster capture admitted against an independent host selection.
pub struct ContinuedRasterRoomBackupFiles {
    identity: ContinuedRasterRoomBackupIdentity,
    directory: GenerationDirectory,
    native: Arc<RelaySegmentBaseFile>,
    rasters: ContinuedAssetBackupFiles,
    files: open::CaptureFiles,
}

/// Independent local pin for a completed restore. Keep it separate from the recovery directory.
/// The pin binds the local owners and the exact set of retained client archives.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveredContinuedRasterRoomIdentity {
    completion_sha256: [u8; 32],
}

/// A fresh, unserved restore. All methods provide trusted-host inspection and export.
/// Serving requires separate reconciliation and deployment authority.
pub struct RecoveredContinuedRasterRoom {
    directory: GenerationDirectory,
    room: Room,
    assets: ContinuedAssetStore,
    clients: clients::RetainedClients,
    identity: RecoveredContinuedRasterRoomIdentity,
    completed: restore::Completion,
}
