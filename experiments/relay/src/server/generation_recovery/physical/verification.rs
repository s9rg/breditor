//! Current authentication and every current protected stream under actual A/B/C custody.
use super::{
    PhysicalServerRoomRecoveryStateIdentity, PreparedPhysicalRoomRecoveryHost,
    selected::{check_retained, check_selected},
};
use crate::{
    Error, GenerationRecoveryRegistrationCoverage, MissingRecoveryRegistration,
    RecoveryRegistrationCredentials, Result, Room, ServerLogGenerationParticipantInventory,
};
use std::sync::{Arc, Mutex, Weak};

/// Weak proof of one exact host, current owner and complete A/B/C native cut. Not serializable,
/// not portable authentication, not a host lease and not an atomic later activation grant.
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedPhysicalServerRoomRecoveryState;
/// let _: VerifiedPhysicalServerRoomRecoveryState = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedPhysicalServerRoomRecoveryState;
/// let _: VerifiedPhysicalServerRoomRecoveryState = Default::default();
/// ```
pub struct VerifiedPhysicalServerRoomRecoveryState {
    identity: Box<PhysicalServerRoomRecoveryStateIdentity>,
    owner: String,
    room: Weak<Mutex<Room>>,
}
/// Missing protected input never yields a partially usable proof.
pub enum PhysicalServerRoomRecoveryCoverage {
    /// Every actual source and current protected stream matched this host.
    Verified(VerifiedPhysicalServerRoomRecoveryState),
    /// Retain every source and separately obtain these current protected credentials.
    Pending {
        /// Includes revoked and permanent-observer streams; old source grants are not current auth.
        missing: Vec<MissingRecoveryRegistration>,
    },
}
impl PreparedPhysicalRoomRecoveryHost {
    /// Verify independently selected A/B/C plus every current protected stream in one serialized
    /// native transaction. No metadata field can substitute for actual local control custody or
    /// ancestor/raster retention. No role, event, file, lease, acknowledgement or provider changes.
    /// # Errors
    /// Wrong auth/non-owner, false/stale source, wrong credentials, changed custody or uncertain
    /// storage refuses. Missing credentials become Pending only after native verification.
    pub async fn verify_selected_recovery_state(
        &self,
        principal: &str,
        token: &str,
        expected: PhysicalServerRoomRecoveryStateIdentity,
        inventory: ServerLogGenerationParticipantInventory,
        supplied: RecoveryRegistrationCredentials,
    ) -> Result<PhysicalServerRoomRecoveryCoverage> {
        self.local.host.authentication.authenticate(principal, token)?;
        if inventory.identity() != expected.participants {
            return Err(Error::Contract("physical host selected inventory differs"));
        }
        let assets = self
            .local
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("physical host actual rasters absent"))?;
        let custody = self
            .local
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("physical host actual local custody absent"))?;
        let original = self.local.original.clone();
        let ancestor = self.ancestor.clone();
        let owner = principal.to_owned();
        let selected = expected.clone();
        let coverage = self
            .local
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(
                    room,
                    &mut assets,
                    &original,
                    &ancestor,
                    &custody,
                    &owner,
                    &selected,
                )?;
                let coverage = inventory.verify_registrations(room, &owner, &supplied)?;
                check_retained(room, &mut assets, &original, &ancestor, &custody, &owner)?;
                Ok(coverage)
            })
            .await?;
        Ok(match coverage {
            GenerationRecoveryRegistrationCoverage::Pending { missing } => {
                PhysicalServerRoomRecoveryCoverage::Pending { missing }
            }
            GenerationRecoveryRegistrationCoverage::Verified(_) => {
                PhysicalServerRoomRecoveryCoverage::Verified(
                    VerifiedPhysicalServerRoomRecoveryState {
                        identity: Box::new(expected),
                        owner: principal.into(),
                        room: Arc::downgrade(&self.local.host.room),
                    },
                )
            }
        })
    }
}
impl VerifiedPhysicalServerRoomRecoveryState {
    /// Detached selections only, not a native/authority/activation capability.
    #[must_use]
    pub fn identity(&self) -> PhysicalServerRoomRecoveryStateIdentity {
        (*self.identity).clone()
    }
    /// Reauthenticate and recheck every actual source on this same native host. Physical-only,
    /// raster-only and registration changes stale the proof even with identical visible content.
    /// # Errors
    /// Wrong auth/owner, dead/different host, different ancestor/local-origin/current cut,
    /// lost retained bytes or uncertain storage refuses. Grants no later mutation/activation.
    pub async fn check_live(
        &self,
        handle: &PreparedPhysicalRoomRecoveryHost,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        handle.local.host.authentication.authenticate(principal, token)?;
        if principal != self.owner
            || !self.room.upgrade().is_some_and(|room| Arc::ptr_eq(&room, &handle.local.host.room))
        {
            return Err(Error::Contract("physical verification belongs to a different owner/host"));
        }
        let assets = handle
            .local
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("physical host actual rasters absent"))?;
        let custody = handle
            .local
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("physical host actual local custody absent"))?;
        let original = handle.local.original.clone();
        let ancestor = handle.ancestor.clone();
        let expected = self.identity.clone();
        let owner = self.owner.clone();
        handle
            .local
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &original, &ancestor, &custody, &owner, &expected)
            })
            .await
    }
}
