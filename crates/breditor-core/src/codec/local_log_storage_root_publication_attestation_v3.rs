use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

use super::{
    LocalLogStorageAttemptTerminalAttestation, LocalLogStorageAttemptTerminalAttestationKind,
};

/// Profile-specific host claim about one Root V3 invocation, not durable proof.
///
/// Core checks correlation, not host truth or event provenance. This type is
/// intentionally distinct from legacy terminal attestations and is not Clone.
///
/// ```compile_fail
/// fn premature(id: &breditor_core::local_log::LocalLogStorageAttemptId) {
///     let _ = breditor_core::codec::LocalLogStorageRootPublicationAttestationV3::publication_completed(id);
/// }
/// ```
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootPublicationAttestationV3>();
/// ```
#[derive(Debug)]
#[must_use]
pub struct LocalLogStorageRootPublicationAttestationV3(
    pub(super) LocalLogStorageAttemptTerminalAttestation,
);

impl LocalLogStorageRootPublicationAttestationV3 {
    /// Attests that the exact publication-armed transaction emitted `complete`.
    ///
    /// The host must have independently checked database/scope identity,
    /// provisioning and empty-scope preconditions and enqueued the complete
    /// atomic mutation set for these exact bytes. Request success, `commit()`
    /// return, a resolver/read-only transaction, or a no-write idempotency check
    /// cannot support this claim. This is historical completion, not currentness
    /// or a writer grant; the core cannot verify these host obligations.
    #[must_use = "the host claim must be correlated with its uncertain owner"]
    pub fn publication_completed(request_id: &LocalLogStorageAttemptRequestId) -> Self {
        Self(LocalLogStorageAttemptTerminalAttestation::publication_completed(request_id))
    }

    /// Attests rollback of the one transaction associated with this request.
    /// Copies dispatched elsewhere are not covered by this rollback claim.
    #[must_use = "the host claim must be correlated with its uncertain owner"]
    pub fn transaction_aborted(request_id: &LocalLogStorageAttemptRequestId) -> Self {
        Self(LocalLogStorageAttemptTerminalAttestation::transaction_aborted(request_id))
    }

    /// Attests this invocation closed before creating any publication-capable
    /// transaction. Legal before or after request issuance, never merely timeout.
    /// This is not plan-wide noncommit evidence or permission to retry.
    #[must_use = "the host claim must be correlated with its uncertain owner"]
    pub fn not_attempted(attempt_id: &LocalLogStorageAttemptId) -> Self {
        Self(LocalLogStorageAttemptTerminalAttestation::not_attempted(attempt_id))
    }

    /// Returns the host-asserted terminal category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageAttemptTerminalAttestationKind {
        self.0.kind()
    }

    /// Returns the exact invocation named by the host.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.0.attempt_id()
    }

    /// Returns request-issued correlation for completion or rollback claims.
    #[must_use]
    pub const fn request_id(&self) -> Option<&LocalLogStorageAttemptRequestId> {
        self.0.request_id()
    }
}
