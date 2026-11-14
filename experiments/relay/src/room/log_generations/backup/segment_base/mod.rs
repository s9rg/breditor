//! Exact predecessors for a continuation that keeps original event positions.
mod capture;
mod open;
mod successor;
#[cfg(test)]
mod successor_tests;
#[cfg(test)]
mod tests;

use crate::{
    RelayCheckpointIdentity, ServerLogGenerationBackupIdentity,
    archive_input::{ArchiveEntry, ArchiveInput},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The exact closed input to a relay continuation. Store independently of the artifact bytes.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentBaseIdentity {
    /// Complete canonical archive of the predecessor, including packets and physical lineage.
    pub predecessor: ServerLogGenerationBackupIdentity,
    /// Native replay state at the same absolute position, bound to the selected physical head.
    pub checkpoint: RelayCheckpointIdentity,
}

/// A verified archive and native state at one exact WAL cut, held open for positional reads.
/// This object provides recovery evidence. A host separately authenticates service activation.
pub struct RelaySegmentBaseFile {
    identity: RelaySegmentBaseIdentity,
    archive: ArchiveInput,
    checkpoint: ArchiveInput,
    sections: BTreeMap<String, ArchiveEntry>,
}
