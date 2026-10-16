//! Unforgeable process-local publication observation, never a wire/content identity.

use super::RichLocalState;
use std::sync::Arc;

/// Immutable observation used to reject stale queued work and foreign local owners.
///
/// The opaque token identifies a live owner's publication, not semantic document
/// equality. Independently decoded equal documents remain semantically equal but
/// cannot use another mutable owner's queued-work authorization token.
#[derive(Clone, Debug)]
pub struct RichLocalSnapshot {
    token: Arc<()>,
    state: RichLocalState,
    read_only: bool,
    read_only_revision: Option<crate::state::Revision>,
}

impl RichLocalSnapshot {
    pub(super) fn new(
        token: Arc<()>,
        state: RichLocalState,
        read_only: bool,
        read_only_revision: Option<crate::state::Revision>,
    ) -> Self {
        Self { token, state, read_only, read_only_revision }
    }
    /// Last live policy publication, absent until this owner changes policy.
    #[must_use]
    pub const fn read_only_revision(&self) -> Option<crate::state::Revision> {
        self.read_only_revision
    }
    /// Host policy at this exact frozen publication; not persisted permission.
    #[must_use]
    pub const fn is_read_only(&self) -> bool {
        self.read_only
    }
    pub(super) fn belongs_to(&self, token: &Arc<()>) -> bool {
        Arc::ptr_eq(&self.token, token)
    }
    /// Complete immutable values observed at capture time.
    #[must_use]
    pub const fn state(&self) -> &RichLocalState {
        &self.state
    }
}
