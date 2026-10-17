//! Select the explicit local recovery contract without authoring document operations.
use super::{ReviewedHistory, ReviewedHistoryIdentity};
use crate::{
    Error,
    rich_replica::{RichReplica, SharedObservation, session::Entry},
};
impl RichReplica {
    pub(in crate::rich_replica) fn initialize_reviewed_history(
        &mut self,
        identity: ReviewedHistoryIdentity,
    ) -> Result<(), Error> {
        if self.reviewed_history.is_some() {
            return Err(Error::Contract("reviewed history already enabled"));
        }
        let history = ReviewedHistory::from_ordinary(self, identity)?;
        self.reviewed_contract = true;
        self.reviewed_history = Some(history);
        if let Some(typing) = &mut self.typing {
            typing.continuation = None;
        }
        Ok(())
    }
    /// Enable one ordered local history while retaining existing Undo/Redo, UI and writer end.
    /// Select/pin the suggestion identity from authenticated host metadata. Thereafter use only
    /// the new reviewed checkpoint/factory; old saves and constructors do not silently upgrade.
    /// # Errors
    /// Stale/read-only, different identity, replay, checkpoint or resource failures are atomic.
    pub fn enable_reviewed_history_guarded(
        &mut self,
        observed: &SharedObservation,
        identity: ReviewedHistoryIdentity,
    ) -> Result<bool, Error> {
        self.check(observed)?;
        identity.check(self.writer())?;
        if let Some(history) = &self.reviewed_history {
            if history.identity != identity {
                return Err(Error::Contract("reviewed history identity is immutable"));
            }
            return Ok(false);
        }
        self.require_writable()?;
        let mut candidate = self.staged()?;
        let ui = candidate.journal.ui.clone();
        candidate.initialize_reviewed_history(identity.clone())?;
        candidate.journal.entries.push(Entry::ReviewedHistoryV1 { identity, ui });
        self.adopt(candidate)?;
        Ok(true)
    }
}
