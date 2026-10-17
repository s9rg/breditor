//! Bounded immutable relation reads never expose proposal bytes after read revocation.
use super::super::check_id;
use super::{Room, StoredSuggestionRevision};
use crate::{Error, Result};
impl Room {
    /// Read an exact committed relation, including its original supersession and publication order.
    /// # Errors
    /// Denied readers, disabled revisions, malformed IDs and uncertain storage reject.
    pub fn document_suggestion_revision(
        &self,
        principal: &str,
        id: &str,
    ) -> Result<Option<StoredSuggestionRevision>> {
        self.document_suggestion_revisions_descriptor(principal)?;
        check_id(id)?;
        Ok(self
            .suggestions_state()?
            .revisions
            .as_ref()
            .ok_or(Error::NeedsRecovery)?
            .retained
            .get(id)
            .map(|row| row.receipt.clone()))
    }
    /// Read a predecessor's original winning successor; a final Accept/ordinary Reject has none.
    /// # Errors
    /// The same current reader, activation and identity checks as exact revision reads apply.
    pub fn document_suggestion_successor(
        &self,
        principal: &str,
        id: &str,
    ) -> Result<Option<StoredSuggestionRevision>> {
        self.document_suggestion_revisions_descriptor(principal)?;
        check_id(id)?;
        let revisions = self.suggestions_state()?.revisions.as_ref().ok_or(Error::NeedsRecovery)?;
        Ok(revisions
            .by_parent
            .get(id)
            .and_then(|id| revisions.retained.get(id))
            .map(|row| row.receipt.clone()))
    }
    /// Download the first exact committed native revision envelope, not a reconstructed packet.
    /// # Errors
    /// Current reader revocation, disabled lanes, malformed IDs or uncertain storage reject.
    pub fn document_suggestion_revision_packet(
        &self,
        principal: &str,
        id: &str,
    ) -> Result<Option<String>> {
        self.document_suggestion_revisions_descriptor(principal)?;
        check_id(id)?;
        Ok(self
            .suggestions_state()?
            .revisions
            .as_ref()
            .ok_or(Error::NeedsRecovery)?
            .retained
            .get(id)
            .map(|row| row.packet.clone()))
    }
}
