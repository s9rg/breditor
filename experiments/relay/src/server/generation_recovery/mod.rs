//! Authenticated generation recovery and opt-in fenced native-service activation.
pub(in crate::server) mod durable_activation;
pub use durable_activation::{
    NativeGenerationActivationCheckpointStatus, NativeGenerationActivationPrepareOptions,
    PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
};
mod activate_native;
mod activation_identity;
pub use activate_native::ActivatedNativeLogGenerationHost;
pub(super) use activate_native::NativeGenerationServingCustody;
pub use activation_identity::NativeLogGenerationActivationIdentity;
pub(super) use selected::check_selected as check_generation_selected;
mod asset_availability;
mod asset_state;
pub use asset_availability::{
    ServerLogGenerationAssetAvailabilityRead, ServerLogGenerationRecoveryAssetCoverage,
    VerifiedServerLogGenerationRecoveryAssets,
};
mod control;
mod control_work;
pub use control::{
    ServerLogGenerationRecoveryControl, ServerLogGenerationRecoveryControlIdentity,
    prepare_log_generation_recovery_control,
};
mod delivery_control;
pub use delivery_control::{
    ServerLogGenerationDeliveryRecoveryControl, ServerLogGenerationDeliveryRecoveryControlIdentity,
    prepare_log_generation_delivery_recovery_control,
};
mod delivery_path_control;
pub use delivery_path_control::{
    ServerLogGenerationDeliveryPathRecoveryControl,
    ServerLogGenerationDeliveryPathRecoveryControlIdentity,
    prepare_log_generation_delivery_path_recovery_control,
};
mod delivery_continuation;
pub use delivery_continuation::{
    ServerLogGenerationDeliveryContinuationIdentity,
    VerifiedServerLogGenerationDeliveryContinuation,
};
mod delivery_path;
pub use delivery_path::{
    MAX_DELIVERY_PATH_ANCESTORS, MAX_DELIVERY_PATH_ARCHIVE_BYTES,
    ServerLogGenerationDeliveryPathIdentity, VerifiedServerLogGenerationDeliveryPath,
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
