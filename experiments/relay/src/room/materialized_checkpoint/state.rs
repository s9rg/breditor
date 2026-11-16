//! Exact durable room state. Connection leases and presence never appear here.
use super::{
    FORMAT, PhysicalClosure, RelayCheckpointIdentity, SegmentCheckpointEncoding, check_selection,
    present,
};
use crate::{
    DurableReceipt, Result, Role, Room, RoomBackupIdentity, ServerNativeHistoryBoundary,
    ServerNativeHistoryLane,
    room::{
        asset_references::PacketHistory, native_history::checkpoint::document_checkpoint,
        recovered_discussion::StoredDiscussion, review::ReviewCheckpoint,
        suggestions::SuggestionCheckpoint, versions::VersionCheckpoint,
    },
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct Checkpoint {
    pub(super) format: String,
    pub(super) format_version: u32,
    pub(super) source: RoomBackupIdentity,
    pub(super) manifest: [u8; 32],
    pub(super) configuration: String,
    pub(super) document: ReplicaCheckpoint,
    pub(super) seed_writer_through: String,
    pub(super) roles: BTreeMap<String, Role>,
    pub(super) writers: Vec<WriterCheckpoint>,
    pub(super) receipts: Vec<DurableReceipt>,
    pub(super) boundaries: Vec<BoundaryCheckpoint>,
    pub(super) review: Option<ReviewCheckpoint>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) discussions: Vec<StoredDiscussion>,
    pub(super) versions: Option<VersionCheckpoint>,
    pub(super) suggestions: Option<SuggestionCheckpoint>,
    #[serde(default, deserialize_with = "present", skip_serializing_if = "Option::is_none")]
    asset_packet_history: Option<PacketHistory>,
    #[serde(default, deserialize_with = "present", skip_serializing_if = "Option::is_none")]
    archive_closure: Option<PhysicalClosure>,
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
    pub(in crate::room) fn recovered_discussion_source_digests(&self) -> BTreeSet<[u8; 32]> {
        self.discussions.iter().map(StoredDiscussion::archive_sha256).collect()
    }

    pub(in crate::room) fn check_selection(
        &self,
        expected: &RelayCheckpointIdentity,
    ) -> Result<()> {
        check_selection(
            &self.format,
            self.format_version,
            &self.source,
            self.manifest,
            (self.asset_packet_history.is_some(), self.archive_closure.is_some()),
            expected,
        )
        .map(|_| ())
    }

    pub(in crate::room) fn include_asset_history(&mut self, history: PacketHistory) {
        self.format_version = SegmentCheckpointEncoding::IndexedAssetHistory.version();
        self.asset_packet_history = Some(history);
    }

    pub(in crate::room) fn include_physical_closure(
        &mut self,
        encoding: SegmentCheckpointEncoding,
        closure: PhysicalClosure,
    ) {
        self.format_version = encoding.version();
        self.archive_closure = Some(closure);
    }

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
            discussions: room.discussions.checkpoint(),
            versions: room.versions.as_ref().map(VersionCheckpoint::capture),
            suggestions: room
                .suggestions
                .as_ref()
                .map(SuggestionCheckpoint::capture)
                .transpose()?,
            asset_packet_history: None,
            archive_closure: None,
        })
    }
}
