//! Closed local phase records. Source pins and inode witnesses are not portable writer rights.
use super::super::super::ServerLogGenerationRoomBackupIdentity;
use crate::log::generations::{GenerationDirectoryWitness, GenerationFileWitness};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Selection {
    pub recovery: String,
    pub source: ServerLogGenerationRoomBackupIdentity,
    pub root: GenerationDirectoryWitness,
    pub controls: [u8; 32],
    pub native_controls: [u8; 32],
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Intent {
    pub format: String,
    pub format_version: u32,
    pub selection: Selection,
    pub stage: String,
    pub witness: GenerationFileWitness,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Marker {
    pub format: String,
    pub format_version: u32,
    pub selection: Selection,
    pub intent: GenerationFileWitness,
}
