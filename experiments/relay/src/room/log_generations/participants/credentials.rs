//! Complete protected original registrations, checked against native and physical selections.
use super::{ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory};
use crate::{MissingRecoveryRegistration, RecoveryRegistrationCredentials, Result, Room};

/// Native source and every original secret matched. Not account authentication, cross-host
/// fencing, provider/client coverage or authority to activate a service. No public constructor.
///
/// ```compile_fail
/// use breditor_collab_relay::VerifiedGenerationRecoveryRegistrations;
/// let _: VerifiedGenerationRecoveryRegistrations = serde_json::from_str("{}").unwrap();
/// ```
#[derive(Clone, Debug)]
pub struct VerifiedGenerationRecoveryRegistrations {
    identity: ServerLogGenerationParticipantIdentity,
}
impl VerifiedGenerationRecoveryRegistrations {
    /// Detached exact selection; serializing this DTO cannot construct a native proof.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationParticipantIdentity {
        self.identity.clone()
    }
    /// Recheck the actual complete physical/native source under current owner access.
    /// # Errors
    /// Changed source, a later rotation, non-owner access or uncertain storage refuse.
    pub fn check_live(&self, room: &mut Room, authenticated_owner: &str) -> Result<()> {
        if room.log_generation_participant_inventory(authenticated_owner)?.identity()
            != self.identity
        {
            return Err(crate::Error::Contract("verified generation registrations are stale"));
        }
        Ok(())
    }
}
/// Incomplete protected input never yields a partial usable proof; wrong supplied secrets reject.
pub enum GenerationRecoveryRegistrationCoverage {
    /// The entire native inventory, selected archive and original protected registration set match.
    Verified(VerifiedGenerationRecoveryRegistrations),
    /// Keep the source and obtain these separately protected original records, including revoked.
    Pending {
        /// Every missing document/review record; no resume secret appears here.
        missing: Vec<MissingRecoveryRegistration>,
    },
}
impl ServerLogGenerationParticipantInventory {
    /// Verify every protected document/review resume record after checking this actual source.
    /// Reads no host credential store, restores no permission and acquires no connection lease.
    /// # Errors
    /// Stale/fabricated source, non-owner access, unknown/duplicate/foreign registrations and
    /// malformed or wrong original secrets refuse without native or durable mutation.
    pub fn verify_registrations(
        &self,
        room: &mut Room,
        authenticated_owner: &str,
        supplied: &RecoveryRegistrationCredentials,
    ) -> Result<GenerationRecoveryRegistrationCoverage> {
        self.verify_native(room, authenticated_owner)?;
        let missing = room.missing_recovery_registrations(&self.metadata.native, supplied)?;
        if missing.is_empty() {
            Ok(GenerationRecoveryRegistrationCoverage::Verified(
                VerifiedGenerationRecoveryRegistrations { identity: self.identity() },
            ))
        } else {
            Ok(GenerationRecoveryRegistrationCoverage::Pending { missing })
        }
    }
}
