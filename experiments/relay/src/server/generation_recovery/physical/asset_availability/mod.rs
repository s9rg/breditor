//! Explicit server-only provider/byte availability over genuine physical A/B/C native continuity.
mod check;
mod proof;
mod report;
mod verification;
pub use proof::VerifiedPhysicalServerRecoveryAssets;
pub use report::PhysicalServerAssetAvailabilityRead;
pub use verification::PhysicalServerRecoveryAssetCoverage;
