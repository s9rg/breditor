//! Canonical attempted-event byte accounting before staging or policy callbacks.
use super::super::{ReviewError, ReviewObservation, ReviewSession};
use std::collections::BTreeSet;
impl ReviewSession {
    /// Unique source event bytes absent from this exact owner. Counts canonical
    /// event values, not outer transport whitespace or a server acknowledgement.
    /// # Errors
    /// Stale guards, incompatible own history/files, forks or overflow refuse.
    pub fn retained_branch_input_bytes_guarded(
        &self,
        observed: &ReviewObservation,
        source: &Self,
        source_observed: &ReviewObservation,
    ) -> Result<usize, ReviewError> {
        self.check(observed)?;
        source.check(source_observed)?;
        super::verify::compatible(self, source)?;
        let known = self.events.iter().map(|event| &event.id).collect::<BTreeSet<_>>();
        source.events.iter().filter(|event| !known.contains(&event.id)).try_fold(
            0_usize,
            |total, event| {
                total
                    .checked_add(serde_json::to_vec(event)?.len())
                    .ok_or(ReviewError::Limit("review retained branch input bytes"))
            },
        )
    }
}
