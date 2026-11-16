//! Closed local ownership selections; no portable writer, provider or deployment authority.
use super::super::ServerLogGenerationRoomBackupIdentity;
use crate::log::generations::{GenerationDirectoryWitness, GenerationFileWitness};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Marker {
    pub format: String,
    pub format_version: u32,
    pub id: String,
    pub identity: ServerLogGenerationRoomBackupIdentity,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NativeComponent {
    pub format: String,
    pub format_version: u32,
    pub recovery: String,
    pub directory: String,
    pub witness: GenerationDirectoryWitness,
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room::log_generations) struct RasterWitness {
    pub device: u64,
    pub inode: u64,
    pub lock: GenerationFileWitness,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RasterComponent {
    pub format: String,
    pub format_version: u32,
    pub recovery: String,
    pub directory: String,
    pub witness: RasterWitness,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RasterPart {
    pub format: String,
    pub format_version: u32,
    pub recovery: String,
    pub directory: String,
    pub name: String,
    pub bytes: u64,
    pub sha256: [u8; 32],
    pub stage: String,
    pub witness: GenerationFileWitness,
}
