use std::{fmt, sync::Arc};

use super::{ActionStateBatch, ActionStateObservationId};

/// Immutable, identity-bearing view of one complete action-state batch.
///
/// Cloning an observation shares both its opaque identity and immutable batch.
/// The identity is process-local; the batch remains the authoritative public
/// read model for the observed editor-state and history instant.
#[derive(Clone, Eq, PartialEq)]
pub struct ActionStateObservation {
    id: ActionStateObservationId,
    batch: Arc<ActionStateBatch>,
}

impl ActionStateObservation {
    pub(crate) const fn new(id: ActionStateObservationId, batch: Arc<ActionStateBatch>) -> Self {
        Self { id, batch }
    }

    /// Returns the opaque identity of this exact observation.
    #[must_use]
    pub const fn id(&self) -> &ActionStateObservationId {
        &self.id
    }

    /// Returns the complete immutable action-state batch.
    #[must_use]
    pub fn batch(&self) -> &ActionStateBatch {
        &self.batch
    }

    /// Returns the shared owner of the complete immutable batch.
    #[must_use]
    pub const fn shared_batch(&self) -> &Arc<ActionStateBatch> {
        &self.batch
    }
}

impl fmt::Debug for ActionStateObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ActionStateObservation")
            .field("id", &self.id)
            .field("entry_count", &self.batch.summary().entry_count())
            .finish_non_exhaustive()
    }
}
