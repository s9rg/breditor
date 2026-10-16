//! Explicit local whole-document scope, never authored as replicated content or two text anchors.
use super::{RichReplica, SharedObservation};
use crate::Error;
impl RichReplica {
    /// Select all current root content, including hidden/no-text documents, without clearing Redo.
    /// Read-only owners may select after the document-selection family has been explicitly enabled.
    /// # Errors
    /// Stale/foreign observations, wrong family and failed replay/admission/save budgets are atomic.
    pub fn select_document_guarded(
        &mut self,
        observation: &SharedObservation,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if !self.document_selection_enabled() {
            return Err(Error::Contract("document selection history required"));
        }
        if self.journal.ui.document_selected() {
            return Ok(false);
        }
        let mut candidate = self.staged()?;
        candidate.journal.ui.select_document();
        self.adopt(candidate)?;
        Ok(true)
    }
    /// Current explicit whole-document scope, not a causal selection encoded in an old DTO.
    #[must_use]
    pub fn document_selected(&self) -> bool {
        self.journal.ui.document_selected()
    }
}
