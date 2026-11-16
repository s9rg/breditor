//! Explicit continuation of one original raster archive into a fresh bounded active generation.
mod archive;
mod backup;
#[cfg(feature = "server")]
pub(super) use backup::ContinuedAssetBackupFiles;
mod open;
mod operations;
#[cfg(feature = "server")]
mod staged_cut;
#[cfg(test)]
mod tests;

use self::archive::AssetArchive;
use super::server_recovery::{raster_directory::RasterCustody, selection::RasterWitness};
use crate::{
    Result,
    archive_input::ArchiveInput,
    assets::{AssetBackupIdentity, AssetStore, asset_id},
    log::generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
};
use serde::{Deserialize, Serialize};

const FORMAT: &str = "breditor/relay-continued-assets";
const CONTROL: &str = "asset-continuation.json";
const ARCHIVE: &str = "predecessor.rasset";
const ACTIVE: &str = "active";
const MAX_CONTROL: u64 = 4096;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Lineage {
    predecessor: AssetBackupIdentity,
    namespace: String,
}

impl Lineage {
    fn active_binding(&self) -> Result<String> {
        crate::credentials::hash(&self.namespace)?;
        Ok(asset_id(&serde_json::to_vec(&(FORMAT, 1_u32, self))?))
    }
}

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

/// Independently selected predecessor and active archives for portable raster continuation restore.
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

/// One immutable original raster archive and one separate writable, bounded active generation.
pub struct ContinuedAssetStore {
    directory: GenerationDirectory,
    identity: ContinuedAssetStoreIdentity,
    control: ArchiveInput,
    control_witness: GenerationFileWitness,
    retained: AssetArchive,
    active: AssetStore,
    active_custody: RasterCustody,
}
