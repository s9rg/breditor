//! Reserve a permanently non-authoring metadata identity under ordinary document-read authority.
use super::{ReviewLease, ReviewRegistration, ReviewWriter, Room};
use crate::{Result, credentials, log::Event};
use breditor_collab_feasibility::review::ReviewActorId;
impl Room {
    /// Reserve a read-only metadata actor without ever granting Comment or Moderator access.
    /// The same registry excludes collisions with future authors. Account promotion cannot
    /// convert this actor into an author; start a separately registered writer for new edits.
    /// # Errors
    /// Rejects missing read access, reserved/duplicate actors, budgets, entropy or storage failure.
    pub fn register_review_observer(
        &mut self,
        principal: &str,
        actor: ReviewActorId,
    ) -> Result<ReviewRegistration> {
        self.check_review_actor_available(principal, &actor)?;
        let credential = credentials::issue()?;
        let resume_hash = credentials::hash(&credential)?;
        let token = credentials::issue()?;
        self.log.append(Event::RegisterReviewObserverV1 {
            principal: principal.into(),
            actor: actor.clone(),
            resume_hash,
        })?;
        let state = self.review_state_mut()?;
        state.writers.insert(
            actor.clone(),
            ReviewWriter { principal: principal.into(), resume_hash, observer: true },
        );
        state.leases.insert(actor.clone(), token.clone());
        Ok(ReviewRegistration { lease: ReviewLease { actor, token }, credential })
    }
}
