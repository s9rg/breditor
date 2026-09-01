use std::{fmt, sync::Arc};

/// Opaque, ABA-safe process-local identity of one action-state observation.
///
/// Clones retain the same identity. Equality uses allocation identity rather
/// than a public counter, so a later observation cannot compare equal while an
/// earlier identity remains observable. IDs have no stable ordering or wire
/// representation and are meaningful only inside the current process.
#[derive(Clone)]
pub struct ActionStateObservationId(Arc<ActionStateObservationIdentity>);

impl ActionStateObservationId {
    pub(crate) fn new() -> Self {
        Self(Arc::new(ActionStateObservationIdentity))
    }
}

impl fmt::Debug for ActionStateObservationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("ActionStateObservationId").finish_non_exhaustive()
    }
}

impl PartialEq for ActionStateObservationId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for ActionStateObservationId {}

struct ActionStateObservationIdentity;

#[cfg(test)]
mod tests {
    use super::ActionStateObservationId;

    #[test]
    fn clones_retain_identity_and_new_ids_are_distinct() {
        let first = ActionStateObservationId::new();
        let cloned = first.clone();
        let second = ActionStateObservationId::new();

        assert_eq!(first, cloned);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_redacts_process_local_identity() {
        let id = ActionStateObservationId::new();

        assert_eq!(format!("{id:?}"), "ActionStateObservationId { .. }");
    }
}
