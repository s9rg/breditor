//! Detached original IDs and actual byte metadata, without native/provider proof constructors.
use super::super::ServerRecoveryStateIdentity;
use crate::{ServerRetainedAssetReferences, assets::AssetInfo};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use serde::Serialize;

/// Separate whole encoded availability-result bound; stored history/raster limits are unchanged.
pub const MAX_SERVER_ASSET_AVAILABILITY_BYTES: usize = 32 * 1024 * 1024;

/// Owner-authenticated capture of current native files and complete server-scope dependencies.
/// Serialized metadata is not a held native or provider capability.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerAssetRecoveryState {
    /// Independent read family, not a new original log/checkpoint or HTTP family.
    pub format: &'static str,
    /// Exact independent read revision.
    pub format_version: u32,
    /// Complete current server log/raster and all registered streams at the same native cut.
    pub current: ServerRecoveryStateIdentity,
    /// Native causal and full-log packet requirements; client stores remain explicitly excluded.
    pub references: ServerRetainedAssetReferences,
}
/// One unchanged native pair and its actual immutable content-addressed server payload.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerAssetResolution {
    /// Original opaque asset and exact binding generation, never rewritten in native history.
    pub reference: VersionAssetReference,
    /// Canonical SHA-256 ID whose actual stored bytes were re-admitted under the native owner.
    pub content_asset: String,
}
/// Complete detached metadata after actual bytes and current host mapping guards matched.
/// This data cannot be deserialized into a live verification proof.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerAssetAvailabilityRead {
    /// Exact native current cut and complete server dependencies.
    pub state: ServerAssetRecoveryState,
    /// Every original reference pair, mapped exactly once in native identity order.
    pub resolutions: Vec<ServerAssetResolution>,
    /// Each immutable content payload once; bytes were decoded, not inferred from receipts.
    pub assets: Vec<AssetInfo>,
}
/// A required original binding is not yet backed by a usable current native raster mapping.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ServerAssetAvailabilityMissing {
    /// The native pair is opaque and the current host resolver has no mapping.
    Mapping {
        /// Original exact pair; not a provider URL or a guessed digest.
        reference: VersionAssetReference,
    },
    /// A mapping exists, but the admitted current native store has no complete payload for it.
    Bytes {
        /// Original exact pair remains required.
        reference: VersionAssetReference,
        /// Canonical native content ID; no byte or upload receipt is fabricated.
        content_asset: String,
    },
}
