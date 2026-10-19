//! Host-owned current mapping authority. No saved receipt or serialized host-verified flag suffices.
use crate::Result;
use breditor_collab_feasibility::rich_replica::VersionAssetReference;

/// Explicit current host mapping from opaque native asset/generation pairs to immutable rasters.
/// The native host authenticates the owner and re-admits the actual bound raster bytes separately.
/// Keep this provider guard alive and valid while its proof is needed; proofs retain it weakly.
/// Callbacks run synchronously under the serialized native room/assets locks: do not reenter the
/// host, perform remote I/O or block waiting for those locks. Acquire remote authority beforehand.
pub trait ServerRecoveryAssetProvider: Send + Sync {
    /// Verify the retained mapping epoch, current host/provider authority and guard lifetime.
    /// Return no value on success; no permission is inferred from a digest or metadata flag.
    /// # Errors
    /// Rejects closed/stale guards, changed epochs or revoked provider/account authority.
    fn check(&self) -> Result<()>;
    /// Resolve an exact original opaque pair to a canonical content ID in this room's raster store.
    /// None means unresolved, not an empty complete inventory. Native SHA-256 IDs are never remapped.
    /// One original asset must keep the same immutable bytes across its binding generations.
    /// # Errors
    /// Rejects invalid/unauthorized mappings. Provider failures are sanitized by the native host.
    fn resolve(&self, reference: &VersionAssetReference) -> Result<Option<String>>;
}

/// Explicit native content-addressed provider. Opaque IDs remain pending for host mapping.
/// This object grants no account rights; current native owner authentication is still required.
#[derive(Default)]
pub struct ContentAddressedServerAssets;
impl ServerRecoveryAssetProvider for ContentAddressedServerAssets {
    fn check(&self) -> Result<()> {
        Ok(())
    }
    fn resolve(&self, _reference: &VersionAssetReference) -> Result<Option<String>> {
        Ok(None)
    }
}
