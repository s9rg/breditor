//! Explicit opt-in authenticated metadata lane, ordered in the document room's durable log.
mod admit;
mod catchup;
mod enable;
mod grant;
mod register;
mod replay;
mod resume;
#[cfg(test)]
mod tests;
mod types;
use super::Room;
use crate::{Error, Result, access};
use breditor_collab_feasibility::review::{
    ReviewActorId, ReviewActorPolicy, ReviewPrincipalId, ReviewSession,
};
use std::collections::BTreeMap;
pub use types::*;

const SERVER_ACTOR: &str = "breditor.relay.review.v1";
const MAX_ACTORS: usize = 1023; // Native budget also includes the reserved receiver.
const MAX_PAGE_BYTES: usize = 4 * 1024 * 1024;

struct ReviewWriter {
    principal: String,
    resume_hash: [u8; 32],
}
pub(super) struct ReviewState {
    binding: String,
    enabled_at: u64,
    session: ReviewSession,
    roles: BTreeMap<String, ReviewRole>,
    writers: BTreeMap<ReviewActorId, ReviewWriter>,
    leases: BTreeMap<ReviewActorId, String>,
    batches: Vec<StoredReviewBatch>,
    /// Original acceptance sequence for EACH event, not a particular network batch packing.
    accepted: BTreeMap<(ReviewActorId, u64), u64>,
}
impl ReviewState {
    pub(super) fn fence(&mut self, principal: &str) {
        self.leases
            .retain(|actor, _| self.writers.get(actor).is_none_or(|w| w.principal != principal));
    }
}
impl Room {
    fn review_state(&self) -> Result<&ReviewState> {
        self.log.ready()?;
        self.review.as_ref().ok_or(Error::Contract("review V1 not enabled"))
    }
    fn review_state_mut(&mut self) -> Result<&mut ReviewState> {
        self.log.ready()?;
        self.review.as_mut().ok_or(Error::Contract("review V1 not enabled"))
    }
    fn review_role(&self, principal: &str) -> Result<ReviewRole> {
        self.reader(principal)?;
        let state = self.review_state()?;
        if principal == self.owner {
            Ok(ReviewRole::Moderator)
        } else {
            state.roles.get(principal).copied().ok_or(Error::Permission)
        }
    }
    fn review_source(&self, principal: &str, actor: &ReviewActorId) -> Result<ReviewSource> {
        let role = self.review_role(principal)?;
        let writer = self.review_state()?.writers.get(actor).ok_or(Error::Lease)?;
        if writer.principal != principal {
            return Err(Error::Lease);
        }
        Ok(ReviewSource {
            actor: actor.clone(),
            principal: ReviewPrincipalId::try_new(principal)?,
            role,
        })
    }
    fn check_review_registration(&self, principal: &str, actor: &ReviewActorId) -> Result<()> {
        self.review_role(principal)?;
        let state = self.review_state()?;
        if actor.as_str() == SERVER_ACTOR || state.writers.contains_key(actor) {
            return Err(Error::Contract("review actor already reserved"));
        }
        if state.writers.len() >= MAX_ACTORS {
            return Err(Error::Contract("review actor budget"));
        }
        access::principal(principal)?;
        Ok(())
    }
}
impl ReviewSource {
    /// Convert ONLY a server-authenticated source or authenticated catchup record to live policy.
    /// Deserializing this DTO alone never establishes the contained account or role.
    #[must_use]
    pub fn policy(&self) -> ReviewActorPolicy {
        ReviewActorPolicy {
            actor: self.actor.clone(),
            principal: self.principal.clone(),
            access: self.role.access(),
        }
    }
}
