use std::{fmt, sync::Arc};

/// Opaque, ABA-safe process-local identity of one physical storage attempt.
///
/// Clones retain the same identity. Equality uses allocation identity rather
/// than a caller value or public counter. Every core-created identity is
/// therefore distinct while an earlier identity remains observable, including
/// through a delayed callback that holds a clone.
///
/// An attempt ID is volatile correlation only. It has no string, ordering,
/// hash, serialization, or wire representation and is not transaction/plan
/// identity, publication authority, terminal evidence, or a durability
/// receipt. Future adapters must keep it as an opaque process-local handle.
#[derive(Clone)]
pub struct LocalLogStorageAttemptId(Arc<LocalLogStorageAttemptIdentity>);

impl LocalLogStorageAttemptId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(LocalLogStorageAttemptIdentity))
    }
}

impl fmt::Debug for LocalLogStorageAttemptId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("LocalLogStorageAttemptId").finish_non_exhaustive()
    }
}

impl PartialEq for LocalLogStorageAttemptId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for LocalLogStorageAttemptId {}

struct LocalLogStorageAttemptIdentity;

#[cfg(test)]
mod tests {
    use super::LocalLogStorageAttemptId;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn clones_retain_identity_and_every_new_id_is_distinct() {
        assert_send_sync::<LocalLogStorageAttemptId>();
        let first = LocalLogStorageAttemptId::new();
        let cloned = first.clone();
        let second = LocalLogStorageAttemptId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_process_local_identity() {
        let id = LocalLogStorageAttemptId::new();

        assert_eq!(format!("{id:?}"), "LocalLogStorageAttemptId { .. }");
    }
}
