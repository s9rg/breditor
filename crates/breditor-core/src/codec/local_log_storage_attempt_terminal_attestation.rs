use std::fmt;

use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

/// The exact host-observed terminal branch for one physical storage attempt.
///
/// This is an adapter attestation category, not browser evidence independently
/// verified by `breditor-core`.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAttemptTerminalAttestationKind {
    /// An exact, publication-armed transaction emitted its `complete` event.
    PublicationCompleted,
    /// The associated physical transaction emitted its `abort` event.
    TransactionAborted,
    /// The adapter invocation closed before creating a publication transaction.
    NotAttempted,
}

impl LocalLogStorageAttemptTerminalAttestationKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PublicationCompleted => "publication_completed",
            Self::TransactionAborted => "transaction_aborted",
            Self::NotAttempted => "not_attempted",
        }
    }
}

/// One process-local host attestation about a physical storage attempt.
///
/// The constructors are deliberately named as attestations. Rust checks the
/// opaque attempt correlation and legal typestate transition, but cannot
/// inspect an `IDBTransaction`, prove event provenance, or stop a host from
/// making a false assertion. This value is non-`Clone` so one constructed
/// observation has one consuming application path; the attempt ID itself is
/// ordinary clonable correlation and is not a capability.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAttemptTerminalAttestation>();
/// ```
///
/// Complete/abort cannot be attested with a pre-egress attempt ID:
///
/// ```compile_fail
/// fn premature(id: &breditor_core::local_log::LocalLogStorageAttemptId) {
///     let _ = breditor_core::codec::LocalLogStorageAttemptTerminalAttestation::
///         publication_completed(id);
/// }
/// ```
#[must_use = "a terminal attestation must be applied to its exact retained attempt"]
pub struct LocalLogStorageAttemptTerminalAttestation {
    attempt_id: LocalLogStorageAttemptId,
    request_id: Option<LocalLogStorageAttemptRequestId>,
    kind: LocalLogStorageAttemptTerminalAttestationKind,
}

impl LocalLogStorageAttemptTerminalAttestation {
    /// Attests an exact publication transaction's successful commit event.
    ///
    /// The host may call this only for the exact transaction object associated
    /// with `request_id`, on its publication branch, after all independent
    /// checks passed, the complete exact mutation set was enqueued, and that
    /// same transaction emitted `complete`. A resolver, cleanup, validation-
    /// only, or idempotent no-write transaction is not publication-complete.
    /// The core cannot independently verify these host-side conditions.
    pub fn publication_completed(request_id: &LocalLogStorageAttemptRequestId) -> Self {
        Self {
            attempt_id: request_id.attempt_id().clone(),
            request_id: Some(request_id.clone()),
            kind: LocalLogStorageAttemptTerminalAttestationKind::PublicationCompleted,
        }
    }

    /// Attests that the associated physical transaction emitted `abort`.
    ///
    /// This says only that the one transaction associated with this attempt
    /// rolled back. An uncorrelated copied dispatch of the plan may still
    /// commit and must be discovered through storage resolution.
    pub fn transaction_aborted(request_id: &LocalLogStorageAttemptRequestId) -> Self {
        Self {
            attempt_id: request_id.attempt_id().clone(),
            request_id: Some(request_id.clone()),
            kind: LocalLogStorageAttemptTerminalAttestationKind::TransactionAborted,
        }
    }

    /// Attests that one adapter invocation closed before creating a
    /// publication-capable transaction.
    ///
    /// This closes only the named physical invocation. It is not plan-level
    /// noncommit proof and says nothing about request bytes copied into an
    /// uncorrelated invocation.
    pub fn not_attempted(attempt_id: &LocalLogStorageAttemptId) -> Self {
        Self {
            attempt_id: attempt_id.clone(),
            request_id: None,
            kind: LocalLogStorageAttemptTerminalAttestationKind::NotAttempted,
        }
    }

    /// Returns the physical-attempt correlation named by the host.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        &self.attempt_id
    }

    /// Returns emitted-request correlation for complete or abort attestations.
    ///
    /// `NotAttempted` has no associated publication request token.
    #[must_use]
    pub const fn request_id(&self) -> Option<&LocalLogStorageAttemptRequestId> {
        self.request_id.as_ref()
    }

    /// Returns the attested physical terminal branch.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageAttemptTerminalAttestationKind {
        self.kind
    }
}

impl fmt::Debug for LocalLogStorageAttemptTerminalAttestation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAttemptTerminalAttestation")
            .field("attempt_id", &self.attempt_id)
            .field("request_id", &self.request_id)
            .field("kind", &self.kind)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageAttemptTerminalAttestation, LocalLogStorageAttemptTerminalAttestationKind,
    };
    use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

    #[test]
    fn constructors_bind_kind_and_exact_attempt_identity() {
        let attempt_id = LocalLogStorageAttemptId::new();
        let other_id = LocalLogStorageAttemptId::new();
        let request_id = LocalLogStorageAttemptRequestId::new(&attempt_id);

        for (attestation, expected) in [
            (
                LocalLogStorageAttemptTerminalAttestation::publication_completed(&request_id),
                LocalLogStorageAttemptTerminalAttestationKind::PublicationCompleted,
            ),
            (
                LocalLogStorageAttemptTerminalAttestation::transaction_aborted(&request_id),
                LocalLogStorageAttemptTerminalAttestationKind::TransactionAborted,
            ),
            (
                LocalLogStorageAttemptTerminalAttestation::not_attempted(&attempt_id),
                LocalLogStorageAttemptTerminalAttestationKind::NotAttempted,
            ),
        ] {
            assert_eq!(attestation.attempt_id(), &attempt_id);
            assert_ne!(attestation.attempt_id(), &other_id);
            assert_eq!(attestation.kind(), expected);
            assert_eq!(
                attestation.request_id().is_some(),
                expected != LocalLogStorageAttemptTerminalAttestationKind::NotAttempted
            );
            assert!(!format!("{attestation:?}").contains("PAYLOADSENTINEL"));
        }
    }

    #[test]
    fn terminal_attestation_kind_spellings_are_stable() {
        assert_eq!(
            LocalLogStorageAttemptTerminalAttestationKind::PublicationCompleted.as_str(),
            "publication_completed"
        );
        assert_eq!(
            LocalLogStorageAttemptTerminalAttestationKind::TransactionAborted.as_str(),
            "transaction_aborted"
        );
        assert_eq!(
            LocalLogStorageAttemptTerminalAttestationKind::NotAttempted.as_str(),
            "not_attempted"
        );
    }
}
