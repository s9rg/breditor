//! Current authentication, original protected registrations and exact native files in one check.
//! This host-local proof is not a client-coverage, asset-reference-closure or activation grant.
use super::{ServerBackupHandle, ServerRecoveryStateIdentity};
use crate::{
    Error, MissingRecoveryRegistration, RecoveryRegistrationCoverage,
    RecoveryRegistrationCredentials, Result, Room, RoomParticipantInventory, ServerRoomBackup,
    assets::AssetStore,
};
use std::sync::{Arc, Mutex, Weak};
mod continuation;
pub use continuation::{
    ServerRecoveryContinuationCoverage, ServerRecoveryContinuationIdentity,
    VerifiedServerRecoveryContinuation,
};

/// A checked original cut belongs to this exact native host and authenticated owner.
/// No token, resume secret, writer lease or serialized readiness flag is retained.
/// The value does not hold a host alive and must be checked again at later use.
/// There is deliberately no public constructor, deserializer or network activation method.
///
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerRecoveryState;
/// let _: VerifiedServerRecoveryState = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerRecoveryState;
/// let _: VerifiedServerRecoveryState = Default::default();
/// ```
pub struct VerifiedServerRecoveryState {
    identity: Box<ServerRecoveryStateIdentity>,
    owner: String,
    room: Weak<Mutex<Room>>,
}

/// No partially verified proof is returned when any original registration secret is absent.
pub enum ServerRecoveryCoverage {
    /// Current native authentication, complete original registration continuity and both exact
    /// native files matched under the same room-then-assets locks on this host.
    Verified(VerifiedServerRecoveryState),
    /// Preserve all selected files and obtain these separately protected original credentials.
    Pending {
        /// Original document/review registrations still needing protected input.
        missing: Vec<MissingRecoveryRegistration>,
    },
}

/// Native admission replays/reads actual owners. Expected digests alone never create a proof.
fn check_selected(
    room: &mut Room,
    assets: &mut AssetStore,
    owner: &str,
    expected: &ServerRecoveryStateIdentity,
) -> Result<()> {
    if expected.participants.room != expected.server.room
        || room.participant_inventory(owner)?.identity() != expected.participants
    {
        return Err(Error::Contract("selected server participant cut differs"));
    }
    if ServerRoomBackup::capture(room, assets)?.info().identity != expected.server {
        return Err(Error::Contract("selected native server files differ"));
    }
    Ok(())
}

impl ServerBackupHandle {
    /// Check fresh host authentication, every protected original registration and the selected
    /// complete log/raster archive in one serialized native transaction. No registration,
    /// permission, acknowledgement, writer lease, router or upload is changed or started.
    /// Use an independently retained owner-selected identity, not incoming archive metadata.
    ///
    /// # Errors
    /// Rejects wrong current account credentials, non-owners, changed/mismatched native files,
    /// fabricated/stale inventories and malformed/wrong original registration credentials.
    /// Native archive budgets and full raster decoding remain in force. Missing credentials
    /// return Pending only after the selected native files have actually been checked.
    pub async fn verify_selected_recovery_state(
        &self,
        principal: &str,
        token: &str,
        expected: ServerRecoveryStateIdentity,
        inventory: RoomParticipantInventory,
        supplied: RecoveryRegistrationCredentials,
    ) -> Result<ServerRecoveryCoverage> {
        self.host.authentication.authenticate(principal, token)?;
        if inventory.identity() != expected.participants {
            return Err(Error::Contract("selected recovery inventory differs"));
        }
        let assets = self.host.assets.clone().ok_or(Error::Contract("recovery assets absent"))?;
        let owner = principal.to_owned();
        let selected = expected.clone();
        let coverage = self
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &owner, &selected)?;
                inventory.verify_registrations(room, &owner, &supplied)
            })
            .await?;
        Ok(match coverage {
            RecoveryRegistrationCoverage::Pending { missing } => {
                ServerRecoveryCoverage::Pending { missing }
            }
            RecoveryRegistrationCoverage::Verified(_) => {
                ServerRecoveryCoverage::Verified(VerifiedServerRecoveryState {
                    identity: Box::new(expected),
                    owner: principal.into(),
                    room: Arc::downgrade(&self.host.room),
                })
            }
        })
    }
}

impl VerifiedServerRecoveryState {
    /// Detached original selection, not a portable authentication/activation capability.
    #[must_use]
    pub fn identity(&self) -> ServerRecoveryStateIdentity {
        (*self.identity).clone()
    }

    /// Authenticate again and recheck both actual complete native files under the same lock
    /// order. A byte-identical restored second host cannot reuse this host-local proof.
    /// This is a check at one instant, not a lock or grant covering a later mutation/handoff.
    /// Current deployment fencing, provider reference closure, client/offline/Undo coverage
    /// and an atomic activation barrier remain separate required work.
    ///
    /// # Errors
    /// Rejects wrong current account credentials, a different owner or host (including a
    /// restarted identical host), dead source ownership, changed permissions/registrations,
    /// divergent server/raster bytes, poisoned owners and original native admission limits.
    pub async fn check_live(
        &self,
        handle: &ServerBackupHandle,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        handle.host.authentication.authenticate(principal, token)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if !self.room.upgrade().is_some_and(|room| Arc::ptr_eq(&room, &handle.host.room)) {
            return Err(Error::Contract("recovery verification belongs to a different host"));
        }
        let assets = handle.host.assets.clone().ok_or(Error::Contract("recovery assets absent"))?;
        let expected = self.identity.clone();
        let owner = self.owner.clone();
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &owner, &expected)
            })
            .await
    }
}
