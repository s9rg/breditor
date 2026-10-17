//! Resume/fence metadata connections without discarding offline work.
use super::{ReviewLease, Room};
use crate::{Error, Result, credentials};
use breditor_collab_feasibility::review::ReviewActorId;

impl Room {
    /// Resume the registered review stream with its separate account-bound secret.
    /// This replaces the previous connection fence; offline event IDs/history are unchanged.
    /// # Errors
    /// Rejects revoked read/review access, foreign ownership, bad credentials and storage state.
    pub fn resume_review(
        &mut self,
        principal: &str,
        actor: &ReviewActorId,
        credential: &str,
    ) -> Result<ReviewLease> {
        self.review_source(principal, actor)?;
        if self.review_state()?.writers.get(actor).ok_or(Error::Lease)?.resume_hash
            != credentials::hash(credential)?
        {
            return Err(Error::Lease);
        }
        let token = credentials::issue()?;
        self.review_state_mut()?.leases.insert(actor.clone(), token.clone());
        Ok(ReviewLease { actor: actor.clone(), token })
    }
    /// Recheck the current authenticated grant, ownership and connection fence.
    /// # Errors
    /// Rejects revoked/replaced/foreign authority or unavailable storage.
    pub fn validate_review_lease(&self, principal: &str, lease: &ReviewLease) -> Result<()> {
        self.review_source(principal, &lease.actor)?;
        if self.review_state()?.leases.get(&lease.actor) == Some(&lease.token) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
    /// Release only this fence; a delayed old disconnect cannot clear a newer resumed lease.
    pub fn release_review(&mut self, lease: &ReviewLease) {
        if let Some(state) = &mut self.review
            && state.leases.get(&lease.actor) == Some(&lease.token)
        {
            state.leases.remove(&lease.actor);
        }
    }
}
