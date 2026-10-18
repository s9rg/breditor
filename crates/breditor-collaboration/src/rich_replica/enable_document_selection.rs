//! One-way explicit scope/recovery admission, independent from causal document grammar.
use super::{RichReplica, SharedObservation, general_history::ReplayContract};
use crate::Error;
impl RichReplica {
    /// Enable the separate document-selection selective-history family without reinterpreting old edits.
    /// Existing original/general entries and Redo remain intact. This also retains general-range
    /// capabilities; matching explicit/natural document recovery is required after this publication.
    /// # Errors
    /// Stale/read-only, replay, mode or save-policy failure leaves the original owner unchanged.
    pub fn enable_document_selection_guarded(
        &mut self,
        observation: &SharedObservation,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if self.document_selection_enabled() {
            return Ok(false);
        }
        self.require_writable()?;
        let mut candidate = self.staged()?;
        candidate.replay_contract = ReplayContract::DocumentV1;
        let (format, version) = candidate.history_family(candidate.typing.is_some());
        candidate.journal.format = format.into();
        candidate.journal.version = version;
        self.adopt(candidate)?;
        Ok(true)
    }
}
