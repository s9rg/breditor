//! Exact durable room state. Connection leases and presence never appear here.
use super::FORMAT;
use crate::{
    DurableReceipt, Result, Role, Room, RoomBackupIdentity, ServerNativeHistoryBoundary,
    ServerNativeHistoryLane,
    room::{
        native_history::checkpoint::document_checkpoint, review::ReviewCheckpoint,
        suggestions::SuggestionCheckpoint, versions::VersionCheckpoint,
    },
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Checkpoint {
    pub format: String,
    pub format_version: u32,
    pub source: RoomBackupIdentity,
    pub manifest: [u8; 32],
    pub configuration: String,
    pub document: ReplicaCheckpoint,
    pub seed_writer_through: String,
    pub roles: BTreeMap<String, Role>,
    pub writers: Vec<WriterCheckpoint>,
    pub receipts: Vec<DurableReceipt>,
    pub boundaries: Vec<BoundaryCheckpoint>,
    pub review: Option<ReviewCheckpoint>,
    pub versions: Option<VersionCheckpoint>,
    pub suggestions: Option<SuggestionCheckpoint>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct ReplicaCheckpoint {
    pub family: ReplicaFamily,
    pub journal: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::room) enum ReplicaFamily {
    Original,
    Selection,
    Segmented,
    Continued,
}

impl ReplicaCheckpoint {
    pub(in crate::room) fn capture(
        owner: &breditor_collab_feasibility::rich_replica::RichReplica,
    ) -> Result<Self> {
        let family = if owner.continued_history_enabled() {
            ReplicaFamily::Continued
        } else if owner.segmented_history_enabled() {
            ReplicaFamily::Segmented
        } else if owner.document_selection_enabled() {
            ReplicaFamily::Selection
        } else {
            ReplicaFamily::Original
        };
        Ok(Self { family, journal: document_checkpoint(owner)? })
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WriterCheckpoint {
    pub writer: String,
    pub principal: String,
    pub resume_hash: [u8; 32],
    pub observer: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct BoundaryCheckpoint {
    pub sequence: String,
    pub lane: ServerNativeHistoryLane,
    pub boundary: ServerNativeHistoryBoundary,
    pub before: [u8; 32],
    pub after: [u8; 32],
}

impl Checkpoint {
    pub fn capture(room: &Room, source: RoomBackupIdentity, manifest: [u8; 32]) -> Result<Self> {
        Ok(Self {
            format: FORMAT.into(),
            format_version: 1,
            source,
            manifest,
            configuration: room.configuration.clone(),
            document: ReplicaCheckpoint::capture(&room.replica)?,
            seed_writer_through: room.seed_writer_through.clone(),
            roles: room.roles.clone(),
            writers: room
                .writers
                .iter()
                .map(|(writer, entry)| WriterCheckpoint {
                    writer: writer.clone(),
                    principal: entry.principal.clone(),
                    resume_hash: entry.resume_hash,
                    observer: entry.observer,
                })
                .collect(),
            receipts: room.receipts.values().cloned().collect(),
            boundaries: room
                .native_history_boundaries
                .values()
                .map(|receipt| BoundaryCheckpoint {
                    sequence: receipt.sequence.clone(),
                    lane: receipt.lane,
                    boundary: receipt.boundary.clone(),
                    before: receipt.before,
                    after: receipt.after,
                })
                .collect(),
            review: room.review.as_ref().map(ReviewCheckpoint::capture).transpose()?,
            versions: room.versions.as_ref().map(VersionCheckpoint::capture),
            suggestions: room
                .suggestions
                .as_ref()
                .map(SuggestionCheckpoint::capture)
                .transpose()?,
        })
    }
}
