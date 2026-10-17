//! Bind an owned Accept to the exact active client document writer, without reserving its counters.
use super::{
    DocumentSuggestionDecisionAdmission, Room, SuggestionDecision, SuggestionDecisionRequest,
};
use crate::{Error, Lease, Result};
impl Room {
    /// Finalize Accept with an explicitly authenticated document stream for later native history
    /// adoption. Both account rights and the exact active lease must still hold. Another tab's
    /// retry returns the original stream, never reassigned ownership. This records authority; it
    /// does not yet author an Undo marker or transfer the host writer's native history.
    /// # Errors
    /// Non-Accept requests, wrong/replaced/revoked leases, current rights, native/source/budget or
    /// persistence failures refuse. No client counter is allocated or fenced by preparation.
    pub fn accept_document_suggestion_owned(
        &mut self,
        principal: &str,
        lease: &Lease,
        request: &SuggestionDecisionRequest,
    ) -> Result<DocumentSuggestionDecisionAdmission> {
        self.validate_lease(principal, lease)?;
        if request.decision != SuggestionDecision::Accept {
            return Err(Error::Contract("owned suggestion finalization requires Accept"));
        }
        self.decide_suggestion_inner(principal, request, Some(&lease.writer))
    }
}
