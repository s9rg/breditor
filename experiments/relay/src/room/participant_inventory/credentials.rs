//! Match protected original resume records without changing roles or acquiring/replacing leases.
use super::{
    MissingRecoveryRegistration, RecoveryRegistrationCredentials, RoomParticipantInventory,
    RoomParticipantInventoryIdentity,
};
use crate::{Error, Result, Room};

/// All original registration secrets matched this selected native cut. Not authentication,
/// live fencing, client journal coverage or permission to activate an account.
/// The proof has no public constructor and cannot be deserialized from metadata.
///
/// ```compile_fail
/// use breditor_collab_relay::VerifiedRecoveryRegistrations;
/// let _: VerifiedRecoveryRegistrations = serde_json::from_str("{}").unwrap();
/// ```
#[derive(Clone, Debug)]
pub struct VerifiedRecoveryRegistrations {
    identity: RoomParticipantInventoryIdentity,
}
impl VerifiedRecoveryRegistrations {
    /// Detached selected-cut identity. A copied DTO cannot construct another native proof.
    #[must_use]
    pub fn identity(&self) -> RoomParticipantInventoryIdentity {
        self.identity.clone()
    }
    /// Recheck the actual native room before using an earlier registration-continuity proof.
    /// Authentication and cross-device deployment fencing remain the host's responsibilities.
    /// # Errors
    /// Rejects a non-owner, poisoned/changed source or different actual registration inventory.
    pub fn check_live(&self, room: &mut Room, authenticated_owner: &str) -> Result<()> {
        if room.participant_inventory(authenticated_owner)?.identity != self.identity {
            return Err(Error::Contract("verified registrations belong to a different cut"));
        }
        Ok(())
    }
}

/// Missing protected records produce no partially usable proof. Wrong supplied secrets reject.
pub enum RecoveryRegistrationCoverage {
    /// The explicitly selected native inventory and every original registration matched.
    Verified(VerifiedRecoveryRegistrations),
    /// Preserve the source and collect these separately protected original identities.
    Pending {
        /// Original document and metadata registrations still needing protected input.
        missing: Vec<MissingRecoveryRegistration>,
    },
}

impl RoomParticipantInventory {
    /// Verify the complete registered document/review set against host-protected original secrets.
    /// This reads no host secret store and returns no raw secret/hash, token, role or writer lease.
    /// Revoked registrations remain required; matching their secrets does not restore permissions.
    /// # Errors
    /// Rejects non-owner native calls, stale/fabricated native inventories, unknown/duplicate
    /// registrations, foreign accounts and wrong or malformed original resume secrets.
    pub fn verify_registrations(
        &self,
        room: &mut Room,
        authenticated_owner: &str,
        supplied: &RecoveryRegistrationCredentials,
    ) -> Result<RecoveryRegistrationCoverage> {
        self.verify_native(room, authenticated_owner)?;
        let missing = room.missing_recovery_registrations(&self.metadata, supplied)?;
        if missing.is_empty() {
            Ok(RecoveryRegistrationCoverage::Verified(VerifiedRecoveryRegistrations {
                identity: self.identity.clone(),
            }))
        } else {
            Ok(RecoveryRegistrationCoverage::Pending { missing })
        }
    }
}
