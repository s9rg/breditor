//! Local restore selections and actual held outer/native owners, never portable writer rights.
use super::super::ServerLogGenerationBackupIdentity;
use crate::{
    Room,
    log::generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Exclusively owned inactive recovery directory. Keep the source archive for explicit resume.
/// No router, provider, uploader or client session is started by this coordinator.
pub struct ServerLogGenerationRecovery {
    pub(super) directory: GenerationDirectory,
    pub(super) marker: Marker,
    #[cfg(test)]
    pub(super) stop_after: Option<super::interruption::RestorePoint>,
}
/// Read-only physical progress, not native replay or host activation proof.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ServerLogGenerationRecoveryProgress {
    /// An actual component directory has a synced local inode/owner selection.
    pub component_selected: bool,
    /// Exact complete final source files currently present; readiness can still be private.
    pub files_published: usize,
    /// Total source file count for this exact selected archive.
    pub files_total: usize,
    /// Public native readiness exists on its selected owned inode.
    pub native_ready: bool,
    /// Outer completion exists; revalidation/native locking is still mandatory at finish.
    pub completion_record: bool,
}
/// Actual restored native room and outer recovery lease. Not a service activation capability.
pub struct RecoveredLogGenerationRoom {
    pub(super) room: Room,
    pub(super) directory: GenerationDirectory,
}
impl RecoveredLogGenerationRoom {
    /// Inspect the actual native room while retaining its physical ownership.
    #[must_use]
    pub fn room(&self) -> &Room {
        &self.room
    }
    /// Use the native room under current host-authenticated account permissions.
    #[must_use]
    pub fn room_mut(&mut self) -> &mut Room {
        &mut self.room
    }
    /// Inactive recovery root; the host must separately authorize any deployment.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.directory.path
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Marker {
    pub format: String,
    pub format_version: u32,
    pub id: String,
    pub identity: ServerLogGenerationBackupIdentity,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Component {
    pub format: String,
    pub format_version: u32,
    pub recovery: String,
    pub directory: String,
    pub witness: GenerationDirectoryWitness,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Part {
    pub format: String,
    pub format_version: u32,
    pub recovery: String,
    pub directory: String,
    pub name: String,
    pub target: String,
    pub bytes: u64,
    pub sha256: [u8; 32],
    pub stage: String,
    pub witness: GenerationFileWitness,
}
