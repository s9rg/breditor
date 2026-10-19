//! Native same-actor recovery continuity, including retained peer events and selective history.
use super::{ReviewError, ReviewObservation, ReviewSession};
use std::collections::BTreeMap;

impl ReviewSession {
    /// Check that this actual native owner retains every event of a selected native origin.
    /// Both exact live observations, binding, actor and principal must match. Native admission
    /// derives each owner's Undo/Redo stacks from its immutable events; no saved ready flag,
    /// event count or matching final discussion view substitutes for this retained-event check.
    /// Current access is deliberately excluded: restored history is never an editing grant.
    ///
    /// # Errors
    /// Rejects stale/foreign observations, another actor/account/binding, missing origin events
    /// or a same-ID fork. Pure verification never imports, publishes or changes either owner.
    pub fn verify_recovery_origin_guarded(
        &self,
        observed: &ReviewObservation,
        origin: &Self,
        origin_observed: &ReviewObservation,
    ) -> Result<(), ReviewError> {
        self.check(observed)?;
        origin.check(origin_observed)?;
        if self.binding != origin.binding
            || self.policy.actor != origin.policy.actor
            || self.policy.principal != origin.policy.principal
        {
            return Err(ReviewError::Contract("review recovery origin identity differs"));
        }
        let current =
            self.events.iter().map(|event| (&event.id, event)).collect::<BTreeMap<_, _>>();
        for event in &origin.events {
            if current.get(&event.id).copied() != Some(event) {
                return Err(ReviewError::Contract("review recovery origin event differs"));
            }
        }
        Ok(())
    }
}
