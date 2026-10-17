//! Recheck an opaque native operation proof against its exact original owner/publication.
use super::{VerifiedDocumentSuggestionEffect, verify_suggestion_effect::vector};
use crate::{
    Error,
    rich_replica::{RichReplica, session::writer_id, writer_transport::counter},
};
impl RichReplica {
    /// Recheck the exact live owner/publication before a future history adoption. This is not
    /// a decision executor or authority grant, and no proof can be attached to a different owner.
    /// # Errors
    /// A stale or foreign proof, or an unavailable retained semantic span, refuses without mutation.
    pub fn check_document_suggestion_effect_proof(
        &self,
        proof: &VerifiedDocumentSuggestionEffect,
    ) -> Result<(), Error> {
        self.check(&proof.observed)?;
        let before = vector(&self.doc, &proof.before)?;
        let after = vector(&self.doc, &proof.after)?;
        let writer = writer_id(&proof.effect.writer_group.writer)?;
        if before.get(&writer).copied().unwrap_or(0) != counter(&proof.effect.semantic_from)?
            || after.get(&writer).copied().unwrap_or(0)
                != counter(&proof.effect.writer_group.through)?
        {
            return Err(Error::Contract("suggestion effect proof semantic range"));
        }
        Ok(())
    }
}
