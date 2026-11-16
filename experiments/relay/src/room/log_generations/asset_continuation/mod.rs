//! Continue exact retained raster archives in a fresh bounded writable generation.
mod archive;
mod backup;
#[cfg(feature = "server")]
pub(super) use backup::ContinuedAssetBackupFiles;
mod lineage;
mod open;
mod operations;
#[cfg(feature = "server")]
mod pending_upload;
mod retained;
#[cfg(feature = "server")]
mod staged_cut;
#[cfg(test)]
mod tests;

use self::{archive::AssetArchive, lineage::Lineage, retained::RetainedArchives};
use super::server_recovery::{raster_directory::RasterCustody, selection::RasterWitness};
use crate::{
    archive_input::ArchiveInput,
    assets::{AssetBackupIdentity, AssetStore},
    log::generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
};
use serde::{Deserialize, Serialize};

const FORMAT: &str = "breditor/relay-continued-assets";
const CONTROL: &str = "asset-continuation.json";
const ARCHIVE: &str = "predecessor.rasset";
const ACTIVE: &str = "active";

/// Exact local continuation selection. Save it independently of the selected directory.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedAssetStoreIdentity {
    format: String,
    format_version: u32,
    lineage: Lineage,
    directory: GenerationDirectoryWitness,
    active: RasterWitness,
    archive: GenerationFileWitness,
}

/// Independently selected retained and active archives for portable raster continuation restore.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedAssetBackupIdentity {
    format: String,
    format_version: u32,
    lineage: Lineage,
    active: AssetBackupIdentity,
}

impl ContinuedAssetBackupIdentity {
    /// Trusted selection of the complete, original predecessor archive.
    #[must_use]
    pub fn predecessor(&self) -> &AssetBackupIdentity {
        &self.lineage.predecessor
    }

    /// Trusted selection of the complete active raster files at capture.
    #[must_use]
    pub const fn active(&self) -> &AssetBackupIdentity {
        &self.active
    }
}

/// Immutable raster archives and one separate writable, bounded active generation.
pub struct ContinuedAssetStore {
    directory: GenerationDirectory,
    identity: ContinuedAssetStoreIdentity,
    control: ArchiveInput,
    control_witness: GenerationFileWitness,
    retained: RetainedArchives,
    active: AssetStore,
    active_custody: RasterCustody,
}
