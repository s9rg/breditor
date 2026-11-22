//! Live host restricted-editing policy, separate from content and retained history.
//!
//! Like read-only, a genuine policy change is an effective publication: the
//! revision and opaque observation advance and `read_only_revision` records the
//! transition, fencing queued or asynchronous work. The policy is never part of
//! a document, checkpoint or history entry; restored owners start unrestricted.

use std::sync::Arc;

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichSelectionUpdate,
};
use crate::rich_content::{RichDocument, RichRestrictedPolicy, RichSelectionKind};

impl RichLocalSession {
    /// Current live restricted-editing policy, if any.
    #[must_use]
    pub fn restricted_policy(&self) -> Option<&RichRestrictedPolicy> {
        self.restricted.as_deref()
    }

    /// Install, replace or clear (`None`) the host restricted-editing policy.
    ///
    /// Content, selection, pending styles and history are retained. Repeating
    /// the current policy is a true no-op.
    /// # Errors
    /// Rejects stale/foreign observations or revision overflow atomically.
    pub fn set_restricted_editing(
        &mut self,
        observation: &RichLocalSnapshot,
        policy: Option<RichRestrictedPolicy>,
    ) -> Result<bool, RichLocalSessionError> {
        self.check(observation)?;
        if self.restricted.as_deref() == policy.as_ref() {
            return Ok(false);
        }
        let mut state = self.state.clone();
        state.revision = state.revision.successor()?;
        self.restricted = policy.map(Arc::new);
        self.read_only_revision = Some(state.revision);
        self.publish(state);
        Ok(true)
    }

    /// Move the selection into the next or previous editable region (no wrap).
    ///
    /// Returns `Unchanged` when no further region exists, so hosts can let
    /// keyboard focus leave the editor. Selection-only; never creates history.
    /// # Errors
    /// Rejects stale observations, an owner without policy or revision overflow.
    pub fn navigate_restricted_region(
        &mut self,
        observation: &RichLocalSnapshot,
        forward: bool,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(observation)?;
        let policy = self.restricted.clone().ok_or(RichLocalSessionError::Restricted)?;
        let document = &self.state.document;
        let current = self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind);
        let Some(kind) = policy
            .adjacent_region(document, current, forward)
            .and_then(|region| RichRestrictedPolicy::region_selection(document, &region))
        else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        self.dispatch(observation, &[], RichSelectionUpdate::Set(Some(kind)))
    }

    /// Refuse a complete candidate that changes protected content.
    pub(super) fn require_restricted(
        &self,
        after: &RichDocument,
    ) -> Result<(), RichLocalSessionError> {
        match &self.restricted {
            Some(policy) if !policy.admits(&self.state.document, after) => {
                Err(RichLocalSessionError::Restricted)
            }
            _ => Ok(()),
        }
    }

    /// Refuse explicit pending styles unless the selection is inside one editable region.
    pub(super) fn require_restricted_selection(
        &self,
        document: &RichDocument,
        selection: Option<&RichSelectionKind>,
    ) -> Result<(), RichLocalSessionError> {
        match &self.restricted {
            Some(policy) if !policy.selection_is_editable(document, selection) => {
                Err(RichLocalSessionError::Restricted)
            }
            _ => Ok(()),
        }
    }
}
