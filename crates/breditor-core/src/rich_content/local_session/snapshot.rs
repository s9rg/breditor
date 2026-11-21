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
    restricted: Option<Arc<crate::rich_content::RichRestrictedPolicy>>,
}

impl RichLocalSnapshot {
    pub(super) fn new(
        token: Arc<()>,
        state: RichLocalState,
        read_only: bool,
        read_only_revision: Option<crate::state::Revision>,
        restricted: Option<Arc<crate::rich_content::RichRestrictedPolicy>>,
    ) -> Self {
        Self { token, state, read_only, read_only_revision, restricted }
    }
    /// Host restricted-editing policy at this exact publication, if any.
    #[must_use]
    pub fn restricted_policy(&self) -> Option<&crate::rich_content::RichRestrictedPolicy> {
        self.restricted.as_deref()
    }
    /// Whether this publication's selection lies inside one editable region.
    ///
    /// `true` without a policy. Advisory action state; admission compares effects.
    #[must_use]
    pub fn selection_is_editable(&self) -> bool {
        self.restricted.as_ref().is_none_or(|policy| {
            policy.selection_is_editable(
                &self.state.document,
                self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind),
            )
        })
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
