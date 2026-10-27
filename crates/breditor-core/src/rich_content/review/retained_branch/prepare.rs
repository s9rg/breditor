//! Private review candidate preparation; no role is inferred from retained content.
use super::{
    super::{
        ReviewActorPolicy, ReviewError, ReviewEventId, ReviewObservation, ReviewPrincipalId,
        ReviewSession, event,
    },
    PreparedReviewBranch,
};
impl ReviewSession {
    /// Stage missing peer events using an explicit original grant for EACH event.
    /// The caller authenticates both the exact source event lineage and its
    /// original role outside this native metadata; saved content grants neither.
    /// Source own-writer suffixes cannot create local Undo history. Current local
    /// history, Redo, access and immutable files remain unchanged. Every admitted
    /// anchor is validated by the actual document backend supplied by the caller.
    /// Neither original changes, including on a late role/anchor/budget failure.
    /// # Errors
    /// Incompatible sources, bounds, missing/false historical grants, native event
    /// or anchor failures reject before any target publication.
    pub fn prepare_retained_branch_guarded(
        &self,
        observed: &ReviewObservation,
        source: &Self,
        source_observed: &ReviewObservation,
        maximum_incoming_bytes: usize,
        mut authorize: impl FnMut(
            &ReviewEventId,
            &ReviewPrincipalId,
        ) -> Result<ReviewActorPolicy, ReviewError>,
        mut validate_anchor: impl FnMut(&str) -> Result<(), ReviewError>,
    ) -> Result<PreparedReviewBranch, ReviewError> {
        let bytes = self.retained_branch_input_bytes_guarded(observed, source, source_observed)?;
        if bytes > maximum_incoming_bytes || bytes > event::MAX_BYTES {
            return Err(ReviewError::Limit("review retained branch input bytes"));
        }
        if bytes == 0 {
            return Ok(PreparedReviewBranch {
                source: observed.clone(),
                candidate: None,
                incoming_bytes: 0,
            });
        }
        let ordered = super::order::missing(self, source)?;
        let mut candidate = self.staged();
        for event in ordered {
            let verified = authorize(&event.id, &event.principal)?;
            super::validate_event::validate(&candidate, event, &verified, &mut validate_anchor)?;
            candidate.events.push(event.clone());
        }
        candidate.admit()?;
        candidate.verify_retained_branch_guarded(&candidate.observe(), source, source_observed)?;
        Ok(PreparedReviewBranch {
            source: observed.clone(),
            candidate: Some(candidate),
            incoming_bytes: bytes,
        })
    }
}
