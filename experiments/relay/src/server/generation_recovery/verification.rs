//! Fresh current account auth plus every original/current protected stream on this exact host.
use super::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryStateIdentity,
    selected::check_selected,
};
use crate::{
    Error, GenerationRecoveryRegistrationCoverage, MissingRecoveryRegistration,
    RecoveryRegistrationCredentials, Result, Room, ServerLogGenerationParticipantInventory,
};
use std::sync::{Arc, Mutex, Weak};

/// Original/current complete histories and all current protected credentials matched this host.
/// Keeps no host alive and grants no later mutation, router or provider/client activation rights.
/// Recheck at later use. There is no public constructor or metadata-based reconstruction.
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationRecoveryState;
/// let _: VerifiedServerLogGenerationRecoveryState = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationRecoveryState;
/// let _: VerifiedServerLogGenerationRecoveryState = Default::default();
/// ```
pub struct VerifiedServerLogGenerationRecoveryState {
    identity: Box<ServerLogGenerationRecoveryStateIdentity>,
    owner: String,
    room: Weak<Mutex<Room>>,
}
/// Missing protected input never creates a partly usable live recovery proof.
pub enum ServerLogGenerationRecoveryCoverage {
    /// Actual original/current files, physical identities and every current secret matched.
    Verified(VerifiedServerLogGenerationRecoveryState),
    /// Preserve all sources and obtain these separately protected stream credentials.
    Pending {
        /// Missing document/review streams, including revoked and permanent observer records.
        missing: Vec<MissingRecoveryRegistration>,
    },
}
impl PreparedLogGenerationRecoveryHost {
    /// Verify current host authentication, actual original/current native files, the complete
    /// physical source pin and all current protected registrations in one native transaction.
    /// Select `expected` independently from authenticated capture, never from incoming metadata.
    /// No role, registration, connection lease, native event, file or client acknowledgement changes.
    /// # Errors
    /// Wrong auth/non-owner, different origin/current host cut, fabricated/stale inventory,
    /// malformed/wrong supplied credentials, lost original bytes or uncertain storage refuse.
    /// Missing credentials return Pending only after actual native verification succeeds.
    pub async fn verify_selected_recovery_state(
        &self,
        principal: &str,
        token: &str,
        expected: ServerLogGenerationRecoveryStateIdentity,
        inventory: ServerLogGenerationParticipantInventory,
        supplied: RecoveryRegistrationCredentials,
    ) -> Result<ServerLogGenerationRecoveryCoverage> {
        self.host.authentication.authenticate(principal, token)?;
        if inventory.identity() != expected.participants
            || *self.original.identity()? != expected.origin
        {
            return Err(Error::Contract("generation host selected inventory differs"));
        }
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("generation host assets absent"))?;
        let custody = self
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("generation host custody absent"))?;
        let original = self.original.clone();
        let owner = principal.to_owned();
        let selected = expected.clone();
        let coverage = self
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &original, &custody, &owner, &selected)?;
                let coverage = inventory.verify_registrations(room, &owner, &supplied)?;
                custody.check_source(room, &mut assets, &original, &owner)?;
                Ok(coverage)
            })
            .await?;
        Ok(match coverage {
            GenerationRecoveryRegistrationCoverage::Pending { missing } => {
                ServerLogGenerationRecoveryCoverage::Pending { missing }
            }
            GenerationRecoveryRegistrationCoverage::Verified(_) => {
                ServerLogGenerationRecoveryCoverage::Verified(
                    VerifiedServerLogGenerationRecoveryState {
                        identity: Box::new(expected),
                        owner: principal.into(),
                        room: Arc::downgrade(&self.host.room),
                    },
                )
            }
        })
    }
}
impl VerifiedServerLogGenerationRecoveryState {
    /// Detached original/current selections only; never portable authentication or custody.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationRecoveryStateIdentity {
        (*self.identity).clone()
    }
    /// Authenticate again and recheck both complete current native files on this same actual host.
    /// Physical-only cuts, new rasters/registrations or grants stale this proof. Ephemeral resume
    /// alone does not change its selected files. A byte-identical second host cannot reuse it.
    /// # Errors
    /// Wrong authentication/owner, dead/different host, any changed selected cut or uncertain
    /// storage refuses. This is a check at one instant, not an atomic later activation grant.
    pub async fn check_live(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        handle.host.authentication.authenticate(principal, token)?;
        self.check_current(handle, principal).await
    }
    pub(in crate::server) async fn check_live_digest(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        digest: &[u8; 32],
    ) -> Result<()> {
        handle.host.authentication.authenticate_digest(principal, digest)?;
        self.check_current(handle, principal).await
    }
    pub(in crate::server) fn check_host(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
    ) -> Result<()> {
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if !self.room.upgrade().is_some_and(|room| Arc::ptr_eq(&room, &handle.host.room)) {
            return Err(Error::Contract("generation verification belongs to a different host"));
        }
        Ok(())
    }
    async fn check_current(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
    ) -> Result<()> {
        self.check_host(handle, principal)?;
        let assets =
            handle.host.assets.clone().ok_or(Error::Contract("generation host assets absent"))?;
        let custody = handle
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("generation host custody absent"))?;
        let original = handle.original.clone();
        let expected = self.identity.clone();
        let owner = self.owner.clone();
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &original, &custody, &owner, &expected)
            })
            .await
    }
}
