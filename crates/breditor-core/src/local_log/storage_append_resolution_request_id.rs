use std::{fmt, sync::Arc};

/// Opaque process-local identity of one emitted append-resolution request.
///
/// The core creates this value only when an append-resolution owner yields its
/// one borrowed adapter request. Clones retain allocation identity; every
/// fresh resolver invocation receives a distinct identity. Resolution evidence
/// must carry a clone obtained from that emitted request, so safe callers
/// cannot correlate evidence before request egress.
///
/// This is volatile same-process correlation only. It is not interchangeable
/// with an append attempt or append request ID, a transaction handle, storage
/// evidence, acknowledgement, retry authority, or a durable identifier. It
/// deliberately has no string, ordering, hash, serialization, or wire form.
///
/// Callers cannot mint this identity:
///
/// ```compile_fail
/// let _ = breditor_core::local_log::LocalLogStorageAppendResolutionRequestId::new();
/// ```
///
/// It deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(id: &breditor_core::local_log::LocalLogStorageAppendResolutionRequestId) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageAppendResolutionRequestId(
    Arc<LocalLogStorageAppendResolutionRequestIdentity>,
);

impl LocalLogStorageAppendResolutionRequestId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(LocalLogStorageAppendResolutionRequestIdentity))
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("LocalLogStorageAppendResolutionRequestId").finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageAppendResolutionRequestId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for LocalLogStorageAppendResolutionRequestId {}

struct LocalLogStorageAppendResolutionRequestIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageAppendResolutionRequestId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_identity_and_new_tokens_are_distinct() {
        assert_send_sync::<LocalLogStorageAppendResolutionRequestId>();
        let first = LocalLogStorageAppendResolutionRequestId::new();
        let cloned = first.clone();
        let second = LocalLogStorageAppendResolutionRequestId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_allocation_identity() {
        let id = LocalLogStorageAppendResolutionRequestId::new();

        assert_eq!(format!("{id:?}"), "LocalLogStorageAppendResolutionRequestId { .. }");
    }
}
