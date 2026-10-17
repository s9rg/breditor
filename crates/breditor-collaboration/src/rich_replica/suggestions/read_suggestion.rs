//! Read descriptive proposal metadata without accepting it or conferring creator permissions.
use super::{DocumentSuggestionInfo, packet::Packet};
use crate::{Error, rich_replica::RichReplica};
impl RichReplica {
    /// Read the closed source-bound proposal header. Missing source operations remain admissible
    /// for storage; `verify_document_suggestion_source` separately proves the actual native intent.
    /// # Errors
    /// Wrong family, digest, source binding, unknown actions, labels and resource budgets reject.
    pub fn read_document_suggestion(&self, input: &str) -> Result<DocumentSuggestionInfo, Error> {
        Ok(Packet::read(self, input)?.info())
    }
}
