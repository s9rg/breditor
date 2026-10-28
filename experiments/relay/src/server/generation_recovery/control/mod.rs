//! Opt-in separately authenticated read-only operator checks, never service activation.
mod accepted_native;
mod asset_requirements;
mod identity;
mod lease;
mod original_review;
mod prepare;
mod routes;
pub use identity::ServerLogGenerationRecoveryControlIdentity;
pub use lease::ServerLogGenerationRecoveryControl;
pub use prepare::prepare_log_generation_recovery_control;
