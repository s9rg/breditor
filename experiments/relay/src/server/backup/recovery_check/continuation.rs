//! Fresh current-cut authentication with original log and immutable raster continuity.
use super::{ServerBackupHandle, ServerRecoveryStateIdentity, VerifiedServerRecoveryState};
use crate::{
    Error, MissingRecoveryRegistration, RecoveryRegistrationCoverage,
    RecoveryRegistrationCredentials, Result, RoomParticipantInventory, ServerRoomBackup,
    ServerRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Independently retained original source and freshly selected current server/inventory cuts.
/// These serializable identities grant no authentication, native custody or activation authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerRecoveryContinuationIdentity {
    /// Original immutable server bundle, not a replacement selected from the latest files.
    pub origin: ServerRoomBackupIdentity,
    /// Current complete native log/raster and every currently registered stream.
    pub current: ServerRecoveryStateIdentity,
}

/// Current exact native files and all protected registrations matched on this one live host,
/// while retaining the complete original log prefix and every original immutable raster record.
/// No bearer token, resume secret, live lease or strong host reference is retained.
/// The proof is invalid after any selected native state changes; recheck at later use.
/// It is not a durable operational marker or a global/client/provider activation grant.
///
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerRecoveryContinuation;
/// let _: VerifiedServerRecoveryContinuation = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerRecoveryContinuation;
/// let _: VerifiedServerRecoveryContinuation = Default::default();
/// ```
pub struct VerifiedServerRecoveryContinuation {
    origin: Box<ServerRoomBackupIdentity>,
    current: VerifiedServerRecoveryState,
}

/// Missing protected current credentials never produce a partially usable live proof.
pub enum ServerRecoveryContinuationCoverage {
    /// Fresh owner authentication, both current native files, original file continuity and all
    /// current registration credentials matched under the same room-then-assets locks.
    Verified(VerifiedServerRecoveryContinuation),
    /// Original and current native files matched, but these protected inputs are still absent.
    Pending {
        /// All missing original or later registered document/review credentials, including revoked
        /// and permanently non-authoring streams. Account roles are never restored by this check.
        missing: Vec<MissingRecoveryRegistration>,
    },
}

impl ServerBackupHandle {
    /// Check an actual current server cut without forgetting its independently selected origin.
    /// All currently registered document/review credentials are required, including streams added
    /// after the original capture. Native log prefixes and complete immutable raster records,
    /// not matching seed names or caller-provided metadata, establish file continuity.
    /// No role, registration, connection lease, receipt, file, router or upload is changed.
    ///
    /// Supply `expected` from trusted original selection and fresh owner-authenticated capture,
    /// never from the incoming archive or inventory. Retain the original archive independently.
    /// This transaction is a check at one instant; deployment fencing, client/historic-copy
    /// reconciliation, provider closure and an atomic later activation barrier remain separate.
    ///
    /// # Errors
    /// Rejects wrong current authentication/non-owners, an original archive differing from the
    /// selection, a stale current cut/inventory, native forks, lost/changed original rasters,
    /// malformed or wrong protected credentials, uncertain storage and existing admission bounds.
    /// Missing credentials return Pending only after both actual native cuts have been checked.
    pub async fn verify_continued_recovery_state(
        &self,
        principal: &str,
        token: &str,
        original: ServerRoomBackup,
        expected: ServerRecoveryContinuationIdentity,
        inventory: RoomParticipantInventory,
        supplied: RecoveryRegistrationCredentials,
    ) -> Result<ServerRecoveryContinuationCoverage> {
        self.host.authentication.authenticate(principal, token)?;
        if original.info().identity != expected.origin
            || inventory.identity() != expected.current.participants
        {
            return Err(Error::Contract("continued recovery selection differs"));
        }
        let assets = self.host.assets.clone().ok_or(Error::Contract("recovery assets absent"))?;
        let owner = principal.to_owned();
        let current = expected.current.clone();
        let coverage = self
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                super::check_selected(room, &mut assets, &owner, &current)?;
                original.verify_retained_components(room, &mut assets)?;
                inventory.verify_registrations(room, &owner, &supplied)
            })
            .await?;
        Ok(match coverage {
            RecoveryRegistrationCoverage::Pending { missing } => {
                ServerRecoveryContinuationCoverage::Pending { missing }
            }
            RecoveryRegistrationCoverage::Verified(_) => {
                ServerRecoveryContinuationCoverage::Verified(VerifiedServerRecoveryContinuation {
                    origin: Box::new(expected.origin),
                    current: VerifiedServerRecoveryState {
                        identity: Box::new(expected.current),
                        owner: principal.into(),
                        room: Arc::downgrade(&self.host.room),
                    },
                })
            }
        })
    }
}

impl VerifiedServerRecoveryContinuation {
    /// Detached original/current selections, not another authentication or activation proof.
    #[must_use]
    pub fn identity(&self) -> ServerRecoveryContinuationIdentity {
        ServerRecoveryContinuationIdentity {
            origin: (*self.origin).clone(),
            current: self.current.identity(),
        }
    }

    /// Authenticate again and check the same complete current cut on the same live native host.
    /// Exact current byte/inventory equality preserves the previously verified origin relation;
    /// later valid appends or rasters require a new current selection and full verification.
    /// The weak proof neither retains stopped owners nor authorizes another/restored host.
    ///
    /// # Errors
    /// Rejects wrong authentication, different/dead host or owner, changed native files,
    /// registrations, permissions or original admission/decoding limits. It grants no later lock.
    pub async fn check_live(
        &self,
        handle: &ServerBackupHandle,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        self.current.check_live(handle, principal, token).await
    }
}
