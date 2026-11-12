//! Closed detached selection shared by inspection and explicit repair.
use super::{destination::FilePin, request::Mode};
use breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity;
use serde::{Deserialize, Serialize};

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PendingWrites {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) wal_suffix: Option<FilePin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) rotation: Option<RotationPin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) raster_stage: Option<RasterPin>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RotationPin {
    pub(super) evidence: FilePin,
    pub(super) planned_manifest: [u8; 32],
    pub(super) head_published: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RasterPin {
    pub(super) evidence: FilePin,
    pub(super) selection_sha256: [u8; 32],
    pub(super) published_asset: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Selection {
    pub(super) format: String,
    pub(super) format_version: u32,
    pub(super) mode: Mode,
    pub(super) current: ServerLogGenerationRecoveryStateIdentity,
    pub(super) archive: FilePin,
    pub(super) participants: FilePin,
    pub(super) pending: PendingWrites,
}
