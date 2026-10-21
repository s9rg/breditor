//! Detached selection of one live operator control instance and the exact complete native cut.
use super::super::PhysicalServerRoomRecoveryStateIdentity;
use serde::{Deserialize, Serialize};

/// Independent selection for a read-only native recovery control, not a serialized capability.
/// An instance changes on each explicit preparation, even for byte-identical native sources.
/// Current separate operator authentication and actual native/provider checks remain required.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhysicalRoomRecoveryControlIdentity {
    /// Closed family, breditor/physical-room-recovery-control.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Fresh nonsecret 256-bit instance identity; never an authentication token.
    pub instance: String,
    /// Independently selected ancestor, real local origin, current native/raster and participants.
    pub source: PhysicalServerRoomRecoveryStateIdentity,
}
