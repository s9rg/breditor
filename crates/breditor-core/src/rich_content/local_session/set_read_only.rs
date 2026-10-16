//! Live host editing policy, separate from semantic content and retained history.
//!
//! A mode change is an effective publication: its decimal revision and opaque
//! observation advance, invalidating queued intents even after a lock/unlock.
//! Only the revision is durable. A restored owner starts editable; its host must
//! reapply read-only policy before exposing it. This is not an authorization ACL.

use super::{RichLocalSession, RichLocalSessionError, RichLocalSnapshot};

impl RichLocalSession {
    /// Whether this live owner rejects content, history and pending-format edits.
    #[must_use]
    pub const fn is_read_only(&self) -> bool {
        self.read_only
    }

    /// Set host policy without changing content, selection, pending styles or history.
    ///
    /// Selection/copy remain available. Repeating the current mode is a true
    /// no-op. Policy itself is not serialized or restored as permission.
    /// # Errors
    /// Rejects stale/foreign observations or publication revision overflow atomically.
    pub fn set_read_only(
        &mut self,
        observation: &RichLocalSnapshot,
        read_only: bool,
    ) -> Result<bool, RichLocalSessionError> {
        self.check(observation)?;
        if self.read_only == read_only {
            return Ok(false);
        }
        let mut state = self.state.clone();
        state.revision = state.revision.successor()?;
        self.read_only = read_only;
        self.read_only_revision = Some(state.revision);
        self.publish(state);
        Ok(true)
    }

    pub(super) fn require_writable(&self) -> Result<(), RichLocalSessionError> {
        if self.read_only {
            return Err(RichLocalSessionError::ReadOnly);
        }
        Ok(())
    }
}
