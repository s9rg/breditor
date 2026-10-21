//! Replay admission needs immutable births, not a reconstructed discussion view per action.
//!
//! Visibility changes register values but never erases a thread/message birth. The
//! caller still validates causal closure, actor hashes, principal binding and complete
//! per-author Undo/Redo. This index is neither a materialized view nor live authority.
use super::{
    ReviewBinding, ReviewError, ReviewEventId, ReviewMessageId, ReviewThreadId,
    actions::ReviewAction,
    event::{self, Clock},
};
use std::collections::BTreeSet;

#[derive(Default)]
pub(super) struct CausalBirths {
    threads: BTreeSet<ReviewThreadId>,
    messages: BTreeSet<ReviewMessageId>,
}

impl CausalBirths {
    pub(super) fn validate_action(
        &self,
        binding: &ReviewBinding,
        action: &ReviewAction,
        dependencies: &Clock,
    ) -> Result<(), ReviewError> {
        let thread = |id: &ReviewThreadId| {
            if !event::observes(dependencies, id.event()) {
                return Err(ReviewError::Contract("unobserved thread birth"));
            }
            self.threads
                .contains(id)
                .then_some(())
                .ok_or(ReviewError::Contract("unknown review thread"))
        };
        let message = |id: &ReviewMessageId| {
            if !event::observes(dependencies, id.event()) {
                return Err(ReviewError::Contract("unobserved message birth"));
            }
            self.messages
                .contains(id)
                .then_some(())
                .ok_or(ReviewError::Contract("unknown review message"))
        };
        match action {
            ReviewAction::CreateThread(action) => {
                event::anchor(binding, &action.anchor_json)?;
                event::text(&action.body)?;
            }
            ReviewAction::Reply(action) => {
                thread(&action.thread)?;
                event::text(&action.body)?;
            }
            ReviewAction::EditMessage(action) => {
                message(&action.message)?;
                event::text(&action.body)?;
            }
            ReviewAction::RetractMessage(action) => message(&action.message)?,
            ReviewAction::SetThreadState(action) => thread(&action.thread)?,
            ReviewAction::ReanchorThread(action) => {
                thread(&action.thread)?;
                event::anchor(binding, &action.anchor_json)?;
            }
        }
        Ok(())
    }

    /// Called only after action admission in the existing deterministic causal order.
    pub(super) fn record_validated_action(&mut self, id: &ReviewEventId, action: &ReviewAction) {
        match action {
            ReviewAction::CreateThread(_) => {
                self.threads.insert(ReviewThreadId::from_event(id.clone()));
                self.messages.insert(ReviewMessageId::from_event(id.clone()));
            }
            ReviewAction::Reply(_) => {
                self.messages.insert(ReviewMessageId::from_event(id.clone()));
            }
            _ => {}
        }
    }
}

#[cfg(test)]
#[path = "causal_births/oracle_tests.rs"]
mod oracle_tests;
