//! Detached complete read metadata, never an upload receipt, live proof or activation grant.
use super::super::ServerLogGenerationRecoveryControlIdentity;
use crate::{assets::AssetInfo, server::ServerAssetResolution};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use serde::Serialize;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(super) enum Missing {
    Mapping { reference: VersionAssetReference },
    Bytes { reference: VersionAssetReference, content_asset: String },
    UploadBytes { content_asset: String },
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Read {
    pub format: &'static str,
    pub format_version: u32,
    pub selection: ServerLogGenerationRecoveryControlIdentity,
    pub request_sha256: String,
    pub scope: &'static str,
    pub resolutions: Vec<ServerAssetResolution>,
    pub assets: Vec<AssetInfo>,
    pub missing: Vec<Missing>,
}
