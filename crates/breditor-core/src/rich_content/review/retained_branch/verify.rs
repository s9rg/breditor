//! Exact actor contribution compatibility and retained-event coverage, not role admission.
use super::super::{ReviewError, ReviewObservation, ReviewSession};
use std::collections::BTreeMap;
pub(super) fn compatible(
    current: &ReviewSession,
    source: &ReviewSession,
) -> Result<(), ReviewError> {
    if current.binding != source.binding
        || current.policy.actor != source.policy.actor
        || current.policy.principal != source.policy.principal
    {
        return Err(ReviewError::Contract("review retained branch identity differs"));
    }
    super::super::generation::check_retained_branch_generations(current, source)?;
    let mut own = current.events.iter().filter(|event| event.id.actor == current.policy.actor);
    for event in source.events.iter().filter(|event| event.id.actor == source.policy.actor) {
        if own.next() != Some(event) {
            return Err(ReviewError::WriterCollision);
        }
    }
    let held = current.events.iter().map(|event| (&event.id, event)).collect::<BTreeMap<_, _>>();
    for event in &source.events {
        if held.get(&event.id).is_some_and(|known| *known != event) {
            return Err(ReviewError::Fork);
        }
    }
    Ok(())
}
impl ReviewSession {
    /// Pure coverage for compatible same-actor branches. All source events must
    /// remain exact, including hidden actions and history toggles. This separate
    /// contract does not widen the existing exact generation-origin proof.
    /// # Errors
    /// Stale guards, another identity, incompatible files, unknown own events,
    /// a causal fork or a missing source event refuse without publication.
    pub fn verify_retained_branch_guarded(
        &self,
        observed: &ReviewObservation,
        source: &Self,
        source_observed: &ReviewObservation,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        source.check(source_observed)?;
        compatible(self, source)?;
        let held = self.events.iter().map(|event| (&event.id, event)).collect::<BTreeMap<_, _>>();
        if source.events.iter().any(|event| held.get(&event.id).copied() != Some(event)) {
            return Err(ReviewError::Contract("review retained branch event absent"));
        }
        Ok(())
    }
}
