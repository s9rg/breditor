//! Verify that a displayed native proposal preview still belongs to this exact live publication.
use super::DocumentSuggestionPreview;
use crate::{Error, rich_replica::RichReplica};
impl RichReplica {
    /// Recheck the opaque source witness without authoring or granting decision authority.
    /// A future server decision must re-prepare after any intervening publication and authenticate
    /// its account separately; successful checking is not Accept, a receipt or a portable token.
    /// # Errors
    /// A preview from another owner or an older content/UI/history publication rejects.
    pub fn check_document_suggestion_preview(
        &self,
        preview: &DocumentSuggestionPreview,
    ) -> Result<(), Error> {
        self.check(&preview.observed)
    }
}
