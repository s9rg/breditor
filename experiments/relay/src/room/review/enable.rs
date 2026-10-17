//! Owner-controlled explicit metadata lane activation.
use super::{ReviewDescriptor, ReviewState, Room, SERVER_ACTOR};
use crate::{Error, Result, credentials, log::Event};
use breditor_collab_feasibility::review::{
    ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewPrincipalId,
};
use std::collections::BTreeMap;

impl Room {
    /// Enable review V1 once, without changing the document seed, roles, writer grammar or AST.
    /// # Errors
    /// Rejects non-owner calls, entropy, native binding and persistence errors.
    pub fn enable_review(&mut self, principal: &str) -> Result<ReviewDescriptor> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if self.review.is_none() {
            let binding = credentials::issue()?;
            let state = self.new_review_state(&binding, 0)?;
            let sequence =
                self.log.append(Event::EnableReviewV1 { actor: principal.into(), binding })?;
            self.review = Some(ReviewState { enabled_at: sequence, ..state });
        }
        self.review_descriptor(principal)
    }
    pub(super) fn new_review_state(&self, binding: &str, enabled_at: u64) -> Result<ReviewState> {
        // Reuse the closed random-hex spelling validator. This public identity is NOT a credential.
        credentials::hash(binding)?;
        let session = self.replica.create_review_session(ReviewActorPolicy {
            actor: ReviewActorId::try_new(SERVER_ACTOR)?,
            principal: ReviewPrincipalId::try_new(&self.owner)?,
            access: ReviewAccess::ReadOnly,
        })?;
        Ok(ReviewState {
            binding: binding.into(),
            enabled_at,
            session,
            roles: BTreeMap::new(),
            writers: BTreeMap::new(),
            leases: BTreeMap::new(),
            batches: vec![],
            accepted: BTreeMap::new(),
        })
    }
    /// Read the explicit review descriptor after current document-read authorization.
    /// # Errors
    /// Rejects unavailable storage, absent lane or missing current read permission.
    pub fn review_descriptor(&self, principal: &str) -> Result<ReviewDescriptor> {
        self.reader(principal)?;
        let state = self.review_state()?;
        Ok(ReviewDescriptor {
            format: "breditor/relay-review",
            format_version: 1,
            binding: state.binding.clone(),
        })
    }
}
