//! Genuine current native server-reference and provider-byte checks, never a global activation grant.
mod capture;
mod provider;
mod read_budget;
pub(in crate::server) use read_budget::check as check_complete_asset_read_budget;
mod recovery;
mod report;
mod resolve;
mod verification;
pub use provider::{ContentAddressedServerAssets, ServerRecoveryAssetProvider};
pub use recovery::{ServerRecoveryAssetCoverage, VerifiedServerRecoveryAssets};
pub use report::{
    MAX_SERVER_ASSET_AVAILABILITY_BYTES, ServerAssetAvailabilityMissing,
    ServerAssetAvailabilityRead, ServerAssetRecoveryState, ServerAssetResolution,
};
pub use verification::{ServerAssetAvailabilityCoverage, VerifiedServerAssetAvailability};
