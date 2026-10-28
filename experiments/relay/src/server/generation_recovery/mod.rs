//! Owner-authenticated complete generation recovery checks without a network activation path.
mod asset_availability;
mod asset_state;
pub use asset_availability::{
    ServerLogGenerationAssetAvailabilityRead, ServerLogGenerationRecoveryAssetCoverage,
    VerifiedServerLogGenerationRecoveryAssets,
};
mod capture;
pub use asset_state::ServerLogGenerationAssetRecoveryState;
mod coordinator;
mod physical;
pub use physical::{
    PhysicalRoomRecoveryControl, PhysicalRoomRecoveryControlIdentity,
    PhysicalServerAssetAvailabilityRead, PhysicalServerAssetRecoveryState,
    PhysicalServerRecoveryAssetCoverage, PhysicalServerRoomRecoveryCoverage,
    PhysicalServerRoomRecoveryState, PhysicalServerRoomRecoveryStateIdentity,
    PreparedPhysicalRoomRecoveryHost, VerifiedPhysicalServerRecoveryAssets,
    VerifiedPhysicalServerRoomRecoveryState, prepare_physical_room_recovery_control,
    prepare_physical_room_recovery_host,
};
mod prepare;
mod selected;
mod state;
#[cfg(test)]
mod tests;
mod verification;
pub use coordinator::PreparedLogGenerationRecoveryHost;
pub use prepare::prepare_log_generation_recovery_host;
pub use state::{ServerLogGenerationRecoveryState, ServerLogGenerationRecoveryStateIdentity};
pub use verification::{
    ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationRecoveryState,
};
