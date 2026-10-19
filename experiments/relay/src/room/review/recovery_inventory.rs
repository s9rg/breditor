//! Private complete review registrations, independent of current readable account permissions.
use super::{ReviewPrincipalId, Room};
use crate::{
    Error, Result, credentials,
    room::{RecoveryReviewInventory, RecoveryReviewRegistration},
};
use breditor_collab_feasibility::review::ReviewActorId;
use std::collections::BTreeSet;

pub(in crate::room) struct ReviewRecoveryRows {
    pub inventory: Option<RecoveryReviewInventory>,
    pub principals: BTreeSet<String>,
}
impl Room {
    pub(in crate::room) fn review_recovery_inventory(&self) -> Result<ReviewRecoveryRows> {
        let Some(state) = &self.review else {
            return Ok(ReviewRecoveryRows { inventory: None, principals: BTreeSet::new() });
        };
        let mut principals: BTreeSet<String> = state.roles.keys().cloned().collect();
        let mut writers = Vec::with_capacity(state.writers.len());
        for (actor, registered) in &state.writers {
            principals.insert(registered.principal.clone());
            writers.push(RecoveryReviewRegistration {
                principal: registered.principal.clone(),
                observer: registered.observer,
                clock: state
                    .session
                    .writer_clock(actor, &ReviewPrincipalId::try_new(&registered.principal)?)?,
            });
        }
        Ok(ReviewRecoveryRows {
            inventory: Some(RecoveryReviewInventory { binding: state.binding.clone(), writers }),
            principals,
        })
    }

    pub(in crate::room) fn check_recovery_review_credential(
        &self,
        principal: &str,
        actor: &str,
        credential: &str,
    ) -> Result<()> {
        let actor = ReviewActorId::try_new(actor).map_err(|_| Error::Lease)?;
        let registered =
            self.review.as_ref().and_then(|r| r.writers.get(&actor)).ok_or(Error::Lease)?;
        if registered.principal != principal
            || registered.resume_hash != credentials::hash(credential)?
        {
            return Err(Error::Lease);
        }
        Ok(())
    }
}
