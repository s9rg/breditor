//! Explicit one-way search recovery admission, retaining every existing history boundary.
use super::super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Whether this owner explicitly selected bounded semantic bulk-replacement history.
    #[must_use]
    pub const fn search_history_enabled(&self) -> bool {
        self.search_contract
    }

    /// Enable the separate search checkpoint family without changing content, writer or Undo/Redo.
    ///
    /// Search reads need no upgrade. Mutation requires this explicit choice; old
    /// encoders/factories refuse the new family even before its first replacement.
    /// Scope, natural typing and reviewed-history choices remain independently usable.
    /// # Errors
    /// Stale/foreign/read-only observations, replay/save bounds or revision failure
    /// leave the old owner and its exact checkpoint unchanged.
    pub fn enable_search_history_guarded(
        &mut self,
        observed: &SharedObservation,
    ) -> Result<bool, Error> {
        self.check(observed)?;
        if self.search_contract {
            return Ok(false);
        }
        self.require_writable()?;
        let mut candidate = self.staged()?;
        candidate.search_contract = true;
        let (format, version) = candidate.history_family(candidate.typing.is_some());
        candidate.journal.format = format.into();
        candidate.journal.version = version;
        self.adopt(candidate)?;
        Ok(true)
    }
}
