use std::{fmt, sync::Arc};

use super::LocalLogStorageWriterFenceAcquisitionAttemptId;

/// Opaque process-local identity of one emitted writer-fence acquisition request.
///
/// The core creates this value only when an acquisition attempt yields its one
/// borrowed adapter request. A terminal completion or abort attestation must
/// carry a clone obtained from that emitted request, so such an attestation
/// cannot be constructed before egress through the safe public API. The
/// embedded attempt ID binds it to one adapter invocation; allocation identity
/// prevents a stale or cross-request identity from matching another request.
///
/// This ID is volatile correlation only. It is not mutation authority, a
/// writer epoch, fence binding, transaction handle, terminal evidence,
/// persistence receipt, or serialization format. A copied external dispatch
/// is outside its one-request/one-transaction contract.
///
/// Callers cannot forge a request identity from a pre-egress attempt ID:
///
/// ```compile_fail
/// fn forge(
///     id: &breditor_core::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId,
/// ) {
///     let _ =
///         breditor_core::local_log::LocalLogStorageWriterFenceAcquisitionRequestId::new(id);
/// }
/// ```
///
/// The volatile identity deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(
///     id: &breditor_core::local_log::LocalLogStorageWriterFenceAcquisitionRequestId,
/// ) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageWriterFenceAcquisitionRequestId {
    attempt_id: LocalLogStorageWriterFenceAcquisitionAttemptId,
    identity: Arc<LocalLogStorageWriterFenceAcquisitionRequestIdentity>,
}

impl LocalLogStorageWriterFenceAcquisitionRequestId {
    pub(crate) fn new(attempt_id: &LocalLogStorageWriterFenceAcquisitionAttemptId) -> Self {
        Self {
            attempt_id: attempt_id.clone(),
            identity: Arc::new(LocalLogStorageWriterFenceAcquisitionRequestIdentity),
        }
    }

    /// Returns the acquisition attempt that emitted this request.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        &self.attempt_id
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionRequestId")
            .field("attempt_id", &self.attempt_id)
            .finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageWriterFenceAcquisitionRequestId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.identity, &other.identity)
    }
}

impl Eq for LocalLogStorageWriterFenceAcquisitionRequestId {}

struct LocalLogStorageWriterFenceAcquisitionRequestIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageWriterFenceAcquisitionRequestId;
    use crate::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_request_identity_and_new_ids_are_distinct() {
        assert_send_sync::<LocalLogStorageWriterFenceAcquisitionRequestId>();
        let attempt = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
        let first = LocalLogStorageWriterFenceAcquisitionRequestId::new(&attempt);
        let cloned = first.clone();
        let second = LocalLogStorageWriterFenceAcquisitionRequestId::new(&attempt);

        assert_eq!(first, cloned);
        assert_ne!(first, second);
        assert_eq!(first.attempt_id(), &attempt);
    }

    #[test]
    fn request_identity_includes_its_attempt_identity() {
        let first_attempt = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
        let second_attempt = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
        let first = LocalLogStorageWriterFenceAcquisitionRequestId::new(&first_attempt);
        let second = LocalLogStorageWriterFenceAcquisitionRequestId::new(&second_attempt);

        assert_ne!(first, second);
        assert_eq!(first.attempt_id(), &first_attempt);
        assert_eq!(second.attempt_id(), &second_attempt);
    }

    #[test]
    fn debug_output_redacts_request_and_attempt_allocation_identities() {
        let id = LocalLogStorageWriterFenceAcquisitionRequestId::new(
            &LocalLogStorageWriterFenceAcquisitionAttemptId::new(),
        );

        assert_eq!(
            format!("{id:?}"),
            concat!(
                "LocalLogStorageWriterFenceAcquisitionRequestId { ",
                "attempt_id: LocalLogStorageWriterFenceAcquisitionAttemptId { .. }, .. }"
            )
        );
    }
}
