use std::{fmt, sync::Arc};

/// Opaque process-local identity of one emitted rotation-resolution request.
///
/// The core creates this value only when a rotation-resolution owner yields its
/// one borrowed adapter request. Clones retain the same allocation identity,
/// while every later resolver invocation receives a distinct identity. A
/// completed-resolution assertion must carry a clone obtained from that
/// emitted request, so safe callers cannot correlate evidence before egress.
///
/// This is volatile correlation only. It is not interchangeable with a root-
/// resolution or publication-attempt request ID, a transaction handle, storage
/// evidence, retry authority, or a durable identifier. It deliberately has no
/// string, ordering, hash, serialization, or wire representation.
///
/// Callers cannot mint this identity:
///
/// ```compile_fail
/// let _ = breditor_core::local_log::LocalLogStorageRotationResolutionRequestId::new();
/// ```
///
/// It deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(id: &breditor_core::local_log::LocalLogStorageRotationResolutionRequestId) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageRotationResolutionRequestId(
    Arc<LocalLogStorageRotationResolutionRequestIdentity>,
);

impl LocalLogStorageRotationResolutionRequestId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(LocalLogStorageRotationResolutionRequestIdentity))
    }
}

impl fmt::Debug for LocalLogStorageRotationResolutionRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("LocalLogStorageRotationResolutionRequestId").finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageRotationResolutionRequestId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for LocalLogStorageRotationResolutionRequestId {}

struct LocalLogStorageRotationResolutionRequestIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageRotationResolutionRequestId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_identity_and_new_tokens_are_distinct() {
        assert_send_sync::<LocalLogStorageRotationResolutionRequestId>();
        let first = LocalLogStorageRotationResolutionRequestId::new();
        let cloned = first.clone();
        let second = LocalLogStorageRotationResolutionRequestId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_allocation_identity() {
        let id = LocalLogStorageRotationResolutionRequestId::new();

        assert_eq!(format!("{id:?}"), "LocalLogStorageRotationResolutionRequestId { .. }");
    }
}
