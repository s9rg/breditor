//! Account-bound read-only metadata resume and fencing, independent of comment-write grants.
use super::{ReviewLease, Room};
use crate::{Error, Result, credentials};
use breditor_collab_feasibility::review::ReviewActorId;
impl Room {
    fn owns_review_observer(&self, principal: &str, actor: &ReviewActorId) -> Result<()> {
        self.reader(principal)?;
        if self
            .review_state()?
            .writers
            .get(actor)
            .is_some_and(|writer| writer.principal == principal && writer.observer)
        {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
    /// Resume a reserved observation actor under current document-read permission only.
    /// It never enables metadata submission, including after account promotion.
    /// # Errors
    /// Rejects revoked read rights, author-kind/foreign identities, bad secrets and unavailable storage.
    pub fn resume_review_observer(
        &mut self,
        principal: &str,
        actor: &ReviewActorId,
        credential: &str,
    ) -> Result<ReviewLease> {
        self.owns_review_observer(principal, actor)?;
        if self.review_state()?.writers.get(actor).ok_or(Error::Lease)?.resume_hash
            != credentials::hash(credential)?
        {
            return Err(Error::Lease);
        }
        let token = credentials::issue()?;
        self.review_state_mut()?.leases.insert(actor.clone(), token.clone());
        Ok(ReviewLease { actor: actor.clone(), token })
    }
    /// Validate this account's current read-only metadata connection fence.
    /// # Errors
    /// Rejects replaced leases, revoked reading, foreign actors and author-kind identities.
    pub fn validate_review_observer_lease(
        &self,
        principal: &str,
        lease: &ReviewLease,
    ) -> Result<()> {
        self.owns_review_observer(principal, &lease.actor)?;
        if self.review_state()?.leases.get(&lease.actor) == Some(&lease.token) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
}
