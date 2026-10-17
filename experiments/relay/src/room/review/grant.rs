//! Independent owner-controlled review capabilities; role changes fence active metadata writers.
use super::{ReviewRole, Room};
use crate::{Error, Result, access, log::Event};

impl Room {
    pub(super) fn check_review_grant(
        &self,
        actor: &str,
        principal: &str,
        role: Option<ReviewRole>,
    ) -> Result<()> {
        self.reader(actor)?;
        let state = self.review_state()?;
        if actor != self.owner {
            return Err(Error::Permission);
        }
        access::principal(principal)?;
        if principal == self.owner {
            return Err(Error::Contract("review owner is immutable"));
        }
        if role.is_some() {
            self.reader(principal)?;
            if !state.roles.contains_key(principal)
                && state.roles.len() >= super::super::MAX_PRINCIPALS
            {
                return Err(Error::Contract("review account budget"));
            }
        }
        Ok(())
    }
    pub(super) fn apply_review_grant(
        &mut self,
        principal: String,
        role: Option<ReviewRole>,
    ) -> Result<()> {
        let state = self.review_state_mut()?;
        state.fence(&principal);
        if let Some(role) = role {
            state.roles.insert(principal, role);
        } else {
            state.roles.remove(&principal);
        }
        Ok(())
    }
    /// Persist independent comment/moderation permission. Every change fences prior leases.
    /// A document Editor is not automatically a comment author or moderator.
    /// # Errors
    /// Rejects non-owner grants, invalid/unreadable accounts, budgets and storage errors.
    pub fn grant_review(
        &mut self,
        actor: &str,
        principal: &str,
        role: Option<ReviewRole>,
    ) -> Result<()> {
        self.check_review_grant(actor, principal, role)?;
        self.log.append(Event::GrantReviewV1 {
            actor: actor.into(),
            principal: principal.into(),
            role,
        })?;
        self.apply_review_grant(principal.into(), role)
    }
}
