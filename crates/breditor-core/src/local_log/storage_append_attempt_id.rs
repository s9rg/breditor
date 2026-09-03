use std::{fmt, sync::Arc};

/// Opaque, ABA-safe process-local identity of one queue-head append attempt.
///
/// One attempt is eligible for at most one adapter invocation and at most one
/// append-capable storage transaction associated with that invocation. It may
/// be resubmitted or dropped before any request is emitted. Clones retain the
/// same correlation identity. Equality uses allocation identity rather than a
/// caller value or public counter. Every core-created identity is therefore
/// distinct while an earlier identity remains observable, including through a
/// delayed callback that holds a clone.
///
/// A caller can copy an exposed head frame and start an extra transaction, but
/// that duplicate is outside this attempt correlation and must not reuse the ID
/// in a terminal attestation. Its possible storage effects require serialized
/// exact-head resolution.
///
/// An append-attempt ID is volatile correlation only. It has no string,
/// ordering, hash, serialization, or wire representation and is not a queue or
/// queue-head identity, chunk start, mutation token, transaction handle,
/// storage evidence, acknowledgement, or durability receipt. Adapters must keep
/// it as an opaque process-local handle.
///
/// Callers cannot mint their own append-attempt identity:
///
/// ```compile_fail
/// let _ = breditor_core::local_log::LocalLogStorageAppendAttemptId::new();
/// ```
///
/// Publication-attempt identities are nominally distinct:
///
/// ```compile_fail
/// fn wrong_protocol(id: &breditor_core::local_log::LocalLogStorageAttemptId) {
///     let _: &breditor_core::local_log::LocalLogStorageAppendAttemptId = id;
/// }
/// ```
///
/// The volatile identity deliberately has no serialization contract:
///
/// ```compile_fail
/// fn serialize(id: &breditor_core::local_log::LocalLogStorageAppendAttemptId) {
///     let _ = serde_json::to_string(id);
/// }
/// ```
#[derive(Clone)]
pub struct LocalLogStorageAppendAttemptId(Arc<LocalLogStorageAppendAttemptIdentity>);

impl LocalLogStorageAppendAttemptId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(LocalLogStorageAppendAttemptIdentity))
    }
}

impl fmt::Debug for LocalLogStorageAppendAttemptId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("LocalLogStorageAppendAttemptId").finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageAppendAttemptId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for LocalLogStorageAppendAttemptId {}

struct LocalLogStorageAppendAttemptIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageAppendAttemptId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_identity_and_every_new_id_is_distinct() {
        assert_send_sync::<LocalLogStorageAppendAttemptId>();
        let first = LocalLogStorageAppendAttemptId::new();
        let cloned = first.clone();
        let second = LocalLogStorageAppendAttemptId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_process_local_identity() {
        let id = LocalLogStorageAppendAttemptId::new();

        assert_eq!(format!("{id:?}"), "LocalLogStorageAppendAttemptId { .. }");
    }
}
