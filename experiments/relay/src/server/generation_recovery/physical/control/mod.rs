//! Opt-in separately authenticated read-only operator checks, never service activation.
mod asset_requirements;
mod identity;
mod lease;
mod prepare;
mod routes;
pub use identity::PhysicalRoomRecoveryControlIdentity;
pub use lease::PhysicalRoomRecoveryControl;
pub use prepare::prepare_physical_room_recovery_control;
