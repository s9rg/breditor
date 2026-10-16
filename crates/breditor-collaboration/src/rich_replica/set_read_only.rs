//! Local host editing policy; never an engine operation, wire permission or history entry.
//!
//! Staging replays journals without host policy, then copies the current live mode.
//! Thus imports and selection changes cannot unlock a read-only owner. A genuine
//! mode change advances the original publication counter and observation token,
//! invalidating work prepared before either a lock or a subsequent unlock.

use super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Whether this live owner refuses local content/history/pending-format edits.
    #[must_use]
    pub const fn is_read_only(&self) -> bool {
        self.read_only
    }

    /// Set host policy while retaining all content, UI, history and causal operations.
    ///
    /// Selection, copying, presence and authorized incoming updates remain usable.
    /// A repeated value is a true no-op. Checkpoints retain only the publication
    /// counter, not permission: hosts must reapply policy after restore.
    /// # Errors
    /// Rejects stale/foreign observations, replay/admission/limit or revision failure atomically.
    pub fn set_read_only_guarded(
        &mut self,
        observation: &SharedObservation,
        read_only: bool,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if self.read_only == read_only {
            return Ok(false);
        }
        let mut candidate = self.staged()?;
        candidate.read_only = read_only;
        self.adopt(candidate)?;
        self.read_only_revision = Some(self.journal.publication.clone());
        Ok(true)
    }

    pub(super) fn require_writable(&self) -> Result<(), Error> {
        if self.read_only {
            return Err(Error::ReadOnly);
        }
        Ok(())
    }
}
