use std::fmt;

use crate::local_log::{
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

/// Host-observed terminal branch for one physical acquisition attempt.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind {
    /// The exact comparison-and-write transaction emitted `complete`.
    AcquisitionCompleted,
    /// The associated physical transaction emitted `abort`.
    TransactionAborted,
    /// The adapter invocation closed without creating a transaction.
    NotAttempted,
}

impl LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::AcquisitionCompleted => "acquisition_completed",
            Self::TransactionAborted => "transaction_aborted",
            Self::NotAttempted => "not_attempted",
        }
    }
}

/// One process-local host attestation about an acquisition transaction.
///
/// Rust validates typestate and opaque request correlation but cannot inspect
/// browser transaction provenance. The host can lie. `acquisition_completed`
/// is valid only when the exact request's fixed-scope comparison-and-write
/// transaction emitted `complete`; observing the target tuple in a later or
/// no-write transaction is not equivalent.
///
/// This value is non-`Clone` so one constructed observation has one consuming
/// application path. Its clonable IDs are correlation, not capabilities.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<
///     breditor_core::codec::LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
/// >();
/// ```
///
/// Publication request identities are nominally distinct:
///
/// ```compile_fail
/// fn wrong_protocol(id: &breditor_core::local_log::LocalLogStorageAttemptRequestId) {
///     let _ =
///         breditor_core::codec::LocalLogStorageWriterFenceAcquisitionTerminalAttestation::
///             acquisition_completed(id);
/// }
/// ```
#[must_use = "an acquisition terminal attestation must be applied to its exact attempt"]
pub struct LocalLogStorageWriterFenceAcquisitionTerminalAttestation {
    attempt_id: LocalLogStorageWriterFenceAcquisitionAttemptId,
    request_id: Option<LocalLogStorageWriterFenceAcquisitionRequestId>,
    kind: LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind,
}

impl LocalLogStorageWriterFenceAcquisitionTerminalAttestation {
    /// Attests that the exact acquisition transaction emitted `complete`.
    ///
    /// The host may call this only when the request's fixed-scope transaction
    /// independently reconstructed and matched the complete selected envelope,
    /// matched both exact JSON values and the expected writer pair, enqueued the
    /// exact planned writer-pair update, and that same transaction emitted
    /// terminal `complete`. Scope-write request success, `commit()` return, an
    /// unrelated or later observation, an already-present target pair, and a
    /// validation-only or otherwise no-write transaction do not qualify. The
    /// core cannot independently verify these host-side facts.
    pub fn acquisition_completed(
        request_id: &LocalLogStorageWriterFenceAcquisitionRequestId,
    ) -> Self {
        Self {
            attempt_id: request_id.attempt_id().clone(),
            request_id: Some(request_id.clone()),
            kind:
                LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::AcquisitionCompleted,
        }
    }

    /// Attests that the exact acquisition transaction emitted `abort`.
    pub fn transaction_aborted(
        request_id: &LocalLogStorageWriterFenceAcquisitionRequestId,
    ) -> Self {
        Self {
            attempt_id: request_id.attempt_id().clone(),
            request_id: Some(request_id.clone()),
            kind: LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::TransactionAborted,
        }
    }

    /// Attests that the invocation closed before creating a transaction.
    ///
    /// This closes only the named invocation. If a request was exposed, copied
    /// data may still have been dispatched outside this correlation contract.
    pub fn not_attempted(attempt_id: &LocalLogStorageWriterFenceAcquisitionAttemptId) -> Self {
        Self {
            attempt_id: attempt_id.clone(),
            request_id: None,
            kind: LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::NotAttempted,
        }
    }

    /// Returns the acquisition-attempt identity named by the host.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        &self.attempt_id
    }

    /// Returns request correlation for complete or abort attestations.
    #[must_use]
    pub const fn request_id(&self) -> Option<&LocalLogStorageWriterFenceAcquisitionRequestId> {
        self.request_id.as_ref()
    }

    /// Returns the attested terminal branch.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind {
        self.kind
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionTerminalAttestation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionTerminalAttestation")
            .field("attempt_id", &self.attempt_id)
            .field("request_id", &self.request_id)
            .field("kind", &self.kind)
            .finish_non_exhaustive()
    }
}
