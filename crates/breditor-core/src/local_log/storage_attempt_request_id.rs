use std::{fmt, sync::Arc};

use super::LocalLogStorageAttemptId;

/// Opaque process-local identity of one emitted storage-attempt request.
///
/// The core creates this value only when an uncertain attempt yields its one
/// adapter request. A terminal publication-complete or transaction-abort
/// attestation must carry a clone obtained from that emitted request, so such
/// an attestation cannot be constructed before egress through the safe public
/// API. The embedded attempt ID binds it to one adapter invocation; allocation
/// identity prevents a stale or cross-request token from matching another.
///
/// This ID is volatile correlation, not a capability, transaction handle,
/// persistence receipt, or serialization format. A copied external dispatch
/// is outside its one-request/one-transaction contract.
///
/// Callers cannot forge a request token from a pre-egress attempt ID:
///
/// ```compile_fail
/// fn forge(id: &breditor_core::local_log::LocalLogStorageAttemptId) {
///     let _ = breditor_core::local_log::LocalLogStorageAttemptRequestId::new(id);
/// }
/// ```
///
/// The volatile identity deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(id: &breditor_core::local_log::LocalLogStorageAttemptRequestId) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageAttemptRequestId {
    attempt_id: LocalLogStorageAttemptId,
    identity: Arc<LocalLogStorageAttemptRequestIdentity>,
}

impl LocalLogStorageAttemptRequestId {
    pub(crate) fn new(attempt_id: &LocalLogStorageAttemptId) -> Self {
        Self {
            attempt_id: attempt_id.clone(),
            identity: Arc::new(LocalLogStorageAttemptRequestIdentity),
        }
    }

    /// Returns the adapter invocation that emitted this request.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        &self.attempt_id
    }
}

impl fmt::Debug for LocalLogStorageAttemptRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAttemptRequestId")
            .field("attempt_id", &self.attempt_id)
            .finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageAttemptRequestId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.identity, &other.identity)
    }
}

impl Eq for LocalLogStorageAttemptRequestId {}

struct LocalLogStorageAttemptRequestIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageAttemptRequestId;
    use crate::local_log::LocalLogStorageAttemptId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_request_identity_and_new_tokens_are_distinct() {
        assert_send_sync::<LocalLogStorageAttemptRequestId>();
        let attempt = LocalLogStorageAttemptId::new();
        let first = LocalLogStorageAttemptRequestId::new(&attempt);
        let cloned = first.clone();
        let second = LocalLogStorageAttemptRequestId::new(&attempt);

        assert_eq!(first, cloned);
        assert_ne!(first, second);
        assert_eq!(first.attempt_id(), &attempt);
    }

    #[test]
    fn debug_output_redacts_request_allocation_identity() {
        let token = LocalLogStorageAttemptRequestId::new(&LocalLogStorageAttemptId::new());

        assert_eq!(
            format!("{token:?}"),
            "LocalLogStorageAttemptRequestId { attempt_id: LocalLogStorageAttemptId { .. }, .. }"
        );
    }
}
