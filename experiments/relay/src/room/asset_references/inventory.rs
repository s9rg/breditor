//! Detached complete-read data. Native ownership, provider authority and deletion are not inferred.
use crate::RoomBackupIdentity;
use breditor_collab_feasibility::rich_replica::{
    PacketAssetIdentity, VersionAssetReference, WriterDependency,
};
use serde::Serialize;

/// Separate complete-result read bound; no stored native history or packet limit is increased.
pub const MAX_SERVER_ASSET_REFERENCE_PAIRS: usize = 100_000;
/// Complete canonical encoded inventory bound, including packet provenance and Pending reasons.
pub const MAX_SERVER_ASSET_REFERENCE_BYTES: usize = 8 * 1024 * 1024;

/// A complete original packet at a durable log position, even when its revision Prepare is inert.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerAssetReferenceSource {
    /// Original complete record sequence. A revision Prepare is not a committed publication.
    pub sequence: String,
    /// Native admitted version, proposal or original revision identity.
    pub packet: PacketAssetIdentity,
}
/// A retained original packet cannot yet prove its complete historical dependencies.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerAssetReferencePending {
    /// Exact retained packet and original log position, not an active publication assertion.
    pub source: ServerAssetReferenceSource,
    /// Exact missing native operation ends. No partial reference list is returned.
    pub missing: Vec<WriterDependency>,
}
/// Full server-scope completeness; neither variant establishes client or provider completeness.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ServerAssetReferenceOutcome {
    /// Conservative native causal history, effect history and every retained complete packet.
    Ready {
        /// Unique complete opaque asset/generation pairs in canonical native identity order.
        references: Vec<VersionAssetReference>,
    },
    /// Preserve the whole server state and resolve these dependencies; never infer an empty set.
    Pending {
        /// Original complete packets whose historical source is not available to the native read.
        packets: Vec<ServerAssetReferencePending>,
    },
}
/// One exact, owner-selected complete server log cut. Serialized metadata is not a live proof.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRetainedAssetReferences {
    /// Independent read family, never an original document, log or checkpoint family.
    pub format: &'static str,
    /// Exact independent read contract revision.
    pub format_version: u32,
    /// Original native compiler, transport, genesis and entire current durable log cut.
    pub room: RoomBackupIdentity,
    /// Explicitly excludes client/offline stores, external extensions and current providers.
    pub scope: &'static str,
    /// Every retained complete packet record, including orphaned/superseded preparations.
    pub sources: Vec<ServerAssetReferenceSource>,
    /// Whole Ready or whole Pending; errors never truncate this result.
    pub outcome: ServerAssetReferenceOutcome,
}
