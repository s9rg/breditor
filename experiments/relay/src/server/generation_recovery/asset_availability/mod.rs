//! Genuine independent server-log-generation native/provider continuity, not physical-host relabeling.
mod check;
mod proof;
mod report;
mod verification;
pub use proof::VerifiedServerLogGenerationRecoveryAssets;
pub use report::ServerLogGenerationAssetAvailabilityRead;
pub use verification::ServerLogGenerationRecoveryAssetCoverage;
