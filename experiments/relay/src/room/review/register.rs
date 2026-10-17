//! Register an exclusive metadata actor under authenticated account ownership.
use super::{ReviewLease, ReviewRegistration, ReviewWriter, Room};
use crate::{Result, credentials, log::Event};
use breditor_collab_feasibility::review::ReviewActorId;

impl Room {
    /// Register an unused client-reserved opaque actor. Collision rejects; it never rewrites
    /// locally authored event IDs. Persist the separate returned secret before authoring.
    /// # Errors
    /// Rejects missing read/review rights, actor collisions/budgets, entropy or uncertain storage.
    pub fn register_review(
        &mut self,
        principal: &str,
        actor: ReviewActorId,
    ) -> Result<ReviewRegistration> {
        self.check_review_registration(principal, &actor)?;
        let credential = credentials::issue()?;
        let resume_hash = credentials::hash(&credential)?;
        let token = credentials::issue()?;
        self.log.append(Event::RegisterReviewV1 {
            principal: principal.into(),
            actor: actor.clone(),
            resume_hash,
        })?;
        let state = self.review_state_mut()?;
        state.writers.insert(
            actor.clone(),
            ReviewWriter { principal: principal.into(), resume_hash, observer: false },
        );
        state.leases.insert(actor.clone(), token.clone());
        Ok(ReviewRegistration { lease: ReviewLease { actor, token }, credential })
    }
}
