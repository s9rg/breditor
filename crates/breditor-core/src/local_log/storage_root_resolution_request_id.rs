use std::{fmt, sync::Arc};

/// Opaque process-local identity of one emitted root-resolution request.
///
/// The core creates this value only when a root-resolution owner yields its
/// one borrowed adapter request. Clones retain the same allocation identity,
/// while every later resolver invocation receives a distinct identity. A
/// future completed-resolution attestation must carry a clone obtained from
/// that emitted request, preventing safe callers from constructing correlated
/// terminal evidence before request egress.
///
/// This ID is volatile correlation only. It is not interchangeable with a
/// publication-attempt request ID, a browser transaction handle, storage
/// evidence, retry authority, or a durable identifier. It deliberately has no
/// string, ordering, hash, serialization, or wire representation.
///
/// Callers cannot mint a root-resolution request identity:
///
/// ```compile_fail
/// let _ = breditor_core::local_log::LocalLogStorageRootResolutionRequestId::new();
/// ```
///
/// The volatile identity deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(id: &breditor_core::local_log::LocalLogStorageRootResolutionRequestId) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageRootResolutionRequestId(
    Arc<LocalLogStorageRootResolutionRequestIdentity>,
);

impl LocalLogStorageRootResolutionRequestId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(LocalLogStorageRootResolutionRequestIdentity))
    }
}

impl fmt::Debug for LocalLogStorageRootResolutionRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("LocalLogStorageRootResolutionRequestId").finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageRootResolutionRequestId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for LocalLogStorageRootResolutionRequestId {}

struct LocalLogStorageRootResolutionRequestIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageRootResolutionRequestId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_identity_and_new_tokens_are_distinct() {
        assert_send_sync::<LocalLogStorageRootResolutionRequestId>();
        let first = LocalLogStorageRootResolutionRequestId::new();
        let cloned = first.clone();
        let second = LocalLogStorageRootResolutionRequestId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_allocation_identity() {
        let id = LocalLogStorageRootResolutionRequestId::new();

        assert_eq!(format!("{id:?}"), "LocalLogStorageRootResolutionRequestId { .. }");
    }
}
