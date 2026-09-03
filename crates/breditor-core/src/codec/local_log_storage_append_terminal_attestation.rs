use std::fmt;

use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

/// Host-observed terminal branch for one physical FIFO-head append attempt.
///
/// This is a stable adapter-attestation category, not storage evidence that
/// `breditor-core` can independently verify.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendTerminalAttestationKind {
    /// The exact qualifying append transaction emitted `complete`.
    TransactionCompleted,
    /// The associated physical transaction emitted `abort`.
    TransactionAborted,
    /// The adapter invocation closed without creating a transaction.
    NotAttempted,
}

impl LocalLogStorageAppendTerminalAttestationKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::TransactionCompleted => "transaction_completed",
            Self::TransactionAborted => "transaction_aborted",
            Self::NotAttempted => "not_attempted",
        }
    }
}

/// One process-local host attestation about a physical head-append attempt.
///
/// Rust validates typestate and opaque allocation-identity correlation, but it
/// cannot inspect an `IDBTransaction`, authenticate a browser event, or stop a
/// host from lying. This value is non-`Clone` so one constructed observation
/// has one consuming application path. Its clonable IDs are correlation, not
/// capabilities or durability receipts.
///
/// For `IndexedDB` Storage Profile V1, [`Self::transaction_completed`] is valid
/// only after the exact request-correlated, fixed five-store strict
/// `readwrite` transaction revalidated every requested binding and the complete
/// active-generation tail. The transaction must either have successfully
/// added the exact head at an absent exact-tail key, or have proved that the
/// byte-identical head was already the valid final record with no later record.
/// That same transaction must then emit `complete`. An individual request
/// success, `commit()` return, validation in another transaction, or a later
/// read does not qualify. `strict` is a durability hint, so even qualifying
/// completion does not prove `fsync`, survival of eviction/reset, or permanent
/// availability.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendTerminalAttestation>();
/// ```
///
/// Complete and abort attestations require an emitted request identity:
///
/// ```compile_fail
/// fn premature(id: &breditor_core::local_log::LocalLogStorageAppendAttemptId) {
///     let _ = breditor_core::codec::LocalLogStorageAppendTerminalAttestation::
///         transaction_completed(id);
/// }
/// ```
///
/// Publication request identities are nominally distinct:
///
/// ```compile_fail
/// fn wrong_protocol(id: &breditor_core::local_log::LocalLogStorageAttemptRequestId) {
///     let _ = breditor_core::codec::LocalLogStorageAppendTerminalAttestation::
///         transaction_aborted(id);
/// }
/// ```
#[must_use = "an append terminal attestation must be applied to its exact attempt"]
pub struct LocalLogStorageAppendTerminalAttestation {
    attempt_id: LocalLogStorageAppendAttemptId,
    request_id: Option<LocalLogStorageAppendRequestId>,
    kind: LocalLogStorageAppendTerminalAttestationKind,
}

impl LocalLogStorageAppendTerminalAttestation {
    /// Attests that the exact qualifying head-append transaction completed.
    ///
    /// Both an exact newly added head and an exact idempotently present final
    /// head qualify under the complete physical conditions documented on this
    /// type. The core cannot independently verify those host-side facts.
    pub fn transaction_completed(request_id: &LocalLogStorageAppendRequestId) -> Self {
        Self {
            attempt_id: request_id.attempt_id().clone(),
            request_id: Some(request_id.clone()),
            kind: LocalLogStorageAppendTerminalAttestationKind::TransactionCompleted,
        }
    }

    /// Attests that the exact associated transaction emitted `abort`.
    ///
    /// This closes only that physical transaction. Copied request data may have
    /// escaped into an uncorrelated dispatch whose effects this attestation
    /// cannot classify.
    pub fn transaction_aborted(request_id: &LocalLogStorageAppendRequestId) -> Self {
        Self {
            attempt_id: request_id.attempt_id().clone(),
            request_id: Some(request_id.clone()),
            kind: LocalLogStorageAppendTerminalAttestationKind::TransactionAborted,
        }
    }

    /// Attests that the invocation closed before creating a transaction.
    ///
    /// This is legal before or after request egress. It closes only the named
    /// invocation and says nothing about copied request data dispatched outside
    /// the one-request/one-transaction contract.
    pub fn not_attempted(attempt_id: &LocalLogStorageAppendAttemptId) -> Self {
        Self {
            attempt_id: attempt_id.clone(),
            request_id: None,
            kind: LocalLogStorageAppendTerminalAttestationKind::NotAttempted,
        }
    }

    /// Returns the append-attempt correlation named by the host.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        &self.attempt_id
    }

    /// Returns request correlation for transaction-complete or abort evidence.
    #[must_use]
    pub const fn request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.request_id.as_ref()
    }

    /// Returns the attested terminal branch.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageAppendTerminalAttestationKind {
        self.kind
    }
}

impl fmt::Debug for LocalLogStorageAppendTerminalAttestation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendTerminalAttestation")
            .field("attempt_id", &self.attempt_id)
            .field("request_id", &self.request_id)
            .field("kind", &self.kind)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageAppendTerminalAttestation, LocalLogStorageAppendTerminalAttestationKind,
    };
    use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

    #[test]
    fn constructors_bind_kind_and_exact_attempt_identity() {
        let attempt_id = LocalLogStorageAppendAttemptId::new();
        let other_attempt_id = LocalLogStorageAppendAttemptId::new();
        let request_id = LocalLogStorageAppendRequestId::new(&attempt_id);

        for (attestation, expected_kind) in [
            (
                LocalLogStorageAppendTerminalAttestation::transaction_completed(&request_id),
                LocalLogStorageAppendTerminalAttestationKind::TransactionCompleted,
            ),
            (
                LocalLogStorageAppendTerminalAttestation::transaction_aborted(&request_id),
                LocalLogStorageAppendTerminalAttestationKind::TransactionAborted,
            ),
            (
                LocalLogStorageAppendTerminalAttestation::not_attempted(&attempt_id),
                LocalLogStorageAppendTerminalAttestationKind::NotAttempted,
            ),
        ] {
            assert_eq!(attestation.attempt_id(), &attempt_id);
            assert_ne!(attestation.attempt_id(), &other_attempt_id);
            assert_eq!(attestation.kind(), expected_kind);
            assert_eq!(
                attestation.request_id().is_some(),
                expected_kind != LocalLogStorageAppendTerminalAttestationKind::NotAttempted
            );
        }
    }

    #[test]
    fn terminal_kind_spellings_are_stable() {
        assert_eq!(
            LocalLogStorageAppendTerminalAttestationKind::TransactionCompleted.as_str(),
            "transaction_completed"
        );
        assert_eq!(
            LocalLogStorageAppendTerminalAttestationKind::TransactionAborted.as_str(),
            "transaction_aborted"
        );
        assert_eq!(
            LocalLogStorageAppendTerminalAttestationKind::NotAttempted.as_str(),
            "not_attempted"
        );
    }

    #[test]
    fn debug_output_contains_only_redacted_correlation_and_kind() {
        let attempt_id = LocalLogStorageAppendAttemptId::new();
        let request_id = LocalLogStorageAppendRequestId::new(&attempt_id);
        let debug = format!(
            "{:?}",
            LocalLogStorageAppendTerminalAttestation::transaction_completed(&request_id)
        );

        assert!(debug.contains("TransactionCompleted"));
        assert!(!debug.contains("PAYLOADSENTINEL"));
    }
}
