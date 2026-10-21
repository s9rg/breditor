//! Separate physical server byte-availability read; no live proof is decoded from metadata.
use super::super::PhysicalServerAssetRecoveryState;
use crate::{assets::AssetInfo, server::ServerAssetResolution};
use serde::Serialize;

/// Detached complete physical server byte availability, not client/outbox or activation coverage.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalServerAssetAvailabilityRead {
    /// Separate availability family, breditor/physical-server-asset-availability.
    pub format: &'static str,
    /// Closed independent revision, currently one.
    pub format_version: u32,
    /// Whole A/B/C current state and conservative retained native dependencies.
    pub state: PhysicalServerAssetRecoveryState,
    /// Every unchanged native asset/generation pair and its actual canonical raster target.
    pub resolutions: Vec<ServerAssetResolution>,
    /// Each required immutable payload once, after actual native byte admission and decoding.
    pub assets: Vec<AssetInfo>,
}
