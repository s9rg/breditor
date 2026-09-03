use std::{fmt, sync::Arc};

/// Opaque, ABA-safe process-local identity of one writer-fence acquisition attempt.
///
/// One attempt means one adapter invocation and at most one acquisition-capable
/// storage transaction associated with that invocation. Clones retain the same
/// correlation identity. Equality uses allocation identity rather than a
/// caller value or public counter. Every core-created identity is therefore
/// distinct while an earlier identity remains observable, including through a
/// delayed callback that holds a clone.
///
/// A caller can copy an exposed request and start an extra transaction, but
/// that duplicate is outside this attempt correlation and must not reuse the ID
/// in a terminal attestation. Its possible storage effects require serialized
/// storage resolution.
///
/// An acquisition-attempt ID is volatile correlation only. It has no string,
/// ordering, hash, serialization, or wire representation and is not a writer
/// epoch, fence binding, mutation token, transaction handle, storage evidence,
/// or durability receipt. Future adapters must keep it as an opaque
/// process-local handle.
///
/// Callers cannot mint their own acquisition-attempt identity:
///
/// ```compile_fail
/// let _ = breditor_core::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId::new();
/// ```
///
/// The volatile identity deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(
///     id: &breditor_core::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId,
/// ) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageWriterFenceAcquisitionAttemptId(
    Arc<LocalLogStorageWriterFenceAcquisitionAttemptIdentity>,
);

impl LocalLogStorageWriterFenceAcquisitionAttemptId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(LocalLogStorageWriterFenceAcquisitionAttemptIdentity))
    }
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionAttemptId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageWriterFenceAcquisitionAttemptId")
            .finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageWriterFenceAcquisitionAttemptId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for LocalLogStorageWriterFenceAcquisitionAttemptId {}

struct LocalLogStorageWriterFenceAcquisitionAttemptIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageWriterFenceAcquisitionAttemptId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_identity_and_every_new_id_is_distinct() {
        assert_send_sync::<LocalLogStorageWriterFenceAcquisitionAttemptId>();
        let first = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
        let cloned = first.clone();
        let second = LocalLogStorageWriterFenceAcquisitionAttemptId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_process_local_identity() {
        let id = LocalLogStorageWriterFenceAcquisitionAttemptId::new();

        assert_eq!(format!("{id:?}"), "LocalLogStorageWriterFenceAcquisitionAttemptId { .. }");
    }
}
