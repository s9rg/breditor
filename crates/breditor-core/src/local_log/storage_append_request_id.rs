use std::{fmt, sync::Arc};

use super::LocalLogStorageAppendAttemptId;

/// Opaque process-local identity of one emitted queue-head append request.
///
/// The core creates this value only when an uncertain append attempt yields its
/// one borrowed adapter request. A future terminal append-complete or
/// transaction-abort attestation must carry the emitted request identity,
/// which is unavailable before request egress through the safe public API. The
/// embedded attempt ID binds it to one adapter invocation; allocation identity
/// prevents a stale or cross-request identity from matching another request.
///
/// This ID is volatile correlation only. It is not a mutation token, queue-head
/// identity, chunk start, transaction handle, storage evidence,
/// acknowledgement, durability receipt, or serialization format. A copied
/// external dispatch is outside its one-request/one-transaction contract.
///
/// Callers cannot forge a request identity from a pre-egress attempt ID:
///
/// ```compile_fail
/// fn forge(id: &breditor_core::local_log::LocalLogStorageAppendAttemptId) {
///     let _ = breditor_core::local_log::LocalLogStorageAppendRequestId::new(id);
/// }
/// ```
///
/// Publication request identities are nominally distinct:
///
/// ```compile_fail
/// fn wrong_protocol(id: &breditor_core::local_log::LocalLogStorageAttemptRequestId) {
///     let _: &breditor_core::local_log::LocalLogStorageAppendRequestId = id;
/// }
/// ```
///
/// The volatile identity deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(id: &breditor_core::local_log::LocalLogStorageAppendRequestId) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageAppendRequestId {
    attempt_id: LocalLogStorageAppendAttemptId,
    identity: Arc<LocalLogStorageAppendRequestIdentity>,
}

impl LocalLogStorageAppendRequestId {
    pub(crate) fn new(attempt_id: &LocalLogStorageAppendAttemptId) -> Self {
        Self {
            attempt_id: attempt_id.clone(),
            identity: Arc::new(LocalLogStorageAppendRequestIdentity),
        }
    }

    /// Returns the queue-head append attempt that emitted this request.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        &self.attempt_id
    }
}

impl fmt::Debug for LocalLogStorageAppendRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendRequestId")
            .field("attempt_id", &self.attempt_id)
            .finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageAppendRequestId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.identity, &other.identity)
    }
}

impl Eq for LocalLogStorageAppendRequestId {}

struct LocalLogStorageAppendRequestIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageAppendRequestId;
    use crate::local_log::LocalLogStorageAppendAttemptId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_request_identity_and_new_ids_are_distinct() {
        assert_send_sync::<LocalLogStorageAppendRequestId>();
        let attempt = LocalLogStorageAppendAttemptId::new();
        let first = LocalLogStorageAppendRequestId::new(&attempt);
        let cloned = first.clone();
        let second = LocalLogStorageAppendRequestId::new(&attempt);

        assert_eq!(first, cloned);
        assert_ne!(first, second);
        assert_eq!(first.attempt_id(), &attempt);
    }

    #[test]
    fn request_identity_includes_its_attempt_identity() {
        let first_attempt = LocalLogStorageAppendAttemptId::new();
        let second_attempt = LocalLogStorageAppendAttemptId::new();
        let first = LocalLogStorageAppendRequestId::new(&first_attempt);
        let second = LocalLogStorageAppendRequestId::new(&second_attempt);

        assert_ne!(first, second);
        assert_eq!(first.attempt_id(), &first_attempt);
        assert_eq!(second.attempt_id(), &second_attempt);
    }

    #[test]
    fn debug_output_redacts_request_and_attempt_allocation_identities() {
        let id = LocalLogStorageAppendRequestId::new(&LocalLogStorageAppendAttemptId::new());

        assert_eq!(
            format!("{id:?}"),
            concat!(
                "LocalLogStorageAppendRequestId { ",
                "attempt_id: LocalLogStorageAppendAttemptId { .. }, .. }"
            )
        );
    }
}
