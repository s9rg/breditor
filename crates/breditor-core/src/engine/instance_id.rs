use std::{fmt, sync::Arc};

/// Opaque, ABA-safe identity of one live [`super::EditorEngine`] instance.
///
/// Clones retain allocation identity. Constructing a new engine always creates
/// a distinct identity, even when it receives the same session and action
/// registry. This prevents an observation captured before `into_parts` from
/// authorizing work after the owned components are reassembled.
#[derive(Clone)]
pub(super) struct EditorEngineInstanceId(Arc<EditorEngineInstanceIdentity>);

impl EditorEngineInstanceId {
    pub(super) fn new() -> Self {
        Self(Arc::new(EditorEngineInstanceIdentity))
    }
}

impl fmt::Debug for EditorEngineInstanceId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("EditorEngineInstanceId").finish_non_exhaustive()
    }
}

impl PartialEq for EditorEngineInstanceId {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for EditorEngineInstanceId {}

struct EditorEngineInstanceIdentity;

#[cfg(test)]
mod tests {
    use super::EditorEngineInstanceId;

    #[test]
    fn clones_retain_identity_and_new_instances_are_distinct() {
        let first = EditorEngineInstanceId::new();
        let clone = first.clone();
        let second = EditorEngineInstanceId::new();

        assert_eq!(first, clone);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_does_not_disclose_identity_material() {
        let id = EditorEngineInstanceId::new();

        assert_eq!(format!("{id:?}"), "EditorEngineInstanceId { .. }");
    }
}
