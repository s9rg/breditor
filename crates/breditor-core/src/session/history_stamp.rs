use std::{fmt, sync::Arc};

/// Opaque process-local identity for one exact session-history observation.
///
/// Clones retain the same identity. Equality uses allocation identity rather
/// than a public counter, so hosts can detect a changed history observation
/// without relying on an ordering, serializable token, or implementation
/// detail. A stamp is meaningful only while comparing observations from the
/// same live [`super::EditorSession`].
#[derive(Clone)]
pub struct HistoryStamp(Arc<HistoryStampIdentity>);

impl HistoryStamp {
    pub(crate) fn new() -> Self {
        Self(Arc::new(HistoryStampIdentity))
    }
}

impl fmt::Debug for HistoryStamp {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("HistoryStamp").finish_non_exhaustive()
    }
}

impl PartialEq for HistoryStamp {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for HistoryStamp {}

struct HistoryStampIdentity;
