//! Independently administered proposal/review rights; a document Editor is not a reviewer.
use super::{Room, SuggestionDecision, SuggestionPermissions, SuggestionRole};
use crate::{Error, Result, Role, access, log::Event};
impl Room {
    /// Compute current proposal, Accept and Reject rights without trusting recovered role claims.
    /// # Errors
    /// Denied readers, disabled lanes or uncertain storage reject.
    pub fn suggestion_permissions(&self, principal: &str) -> Result<SuggestionPermissions> {
        self.reader(principal)?;
        let state = self.suggestions_state()?;
        let role = if principal == self.owner {
            Some(SuggestionRole::Review)
        } else {
            state.roles.get(principal).copied()
        };
        let review = role == Some(SuggestionRole::Review);
        Ok(SuggestionPermissions {
            role,
            can_propose: role.is_some(),
            can_accept: review
                && (principal == self.owner || self.roles.get(principal) == Some(&Role::Editor)),
            can_reject: review,
        })
    }
    pub(super) fn check_suggestion_decision_right(
        &self,
        principal: &str,
        decision: SuggestionDecision,
    ) -> Result<()> {
        let permission = self.suggestion_permissions(principal)?;
        if match decision {
            SuggestionDecision::Accept => permission.can_accept,
            SuggestionDecision::Reject => permission.can_reject,
        } {
            Ok(())
        } else {
            Err(Error::Permission)
        }
    }
    pub(super) fn check_suggestion_grant(
        &self,
        actor: &str,
        principal: &str,
        role: Option<SuggestionRole>,
    ) -> Result<()> {
        self.reader(actor)?;
        let state = self.suggestions_state()?;
        if actor != self.owner {
            return Err(Error::Permission);
        }
        access::principal(principal)?;
        if principal == self.owner {
            return Err(Error::Contract("suggestion owner is immutable"));
        }
        if role.is_some() {
            self.reader(principal)?;
            if !state.roles.contains_key(principal)
                && state.roles.len() >= super::super::MAX_PRINCIPALS
            {
                return Err(Error::Contract("suggestion account budget"));
            }
        }
        Ok(())
    }
    pub(super) fn apply_suggestion_grant(
        &mut self,
        principal: String,
        role: Option<SuggestionRole>,
    ) -> Result<()> {
        let state = self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?;
        if let Some(role) = role {
            state.roles.insert(principal, role);
        } else {
            state.roles.remove(&principal);
        }
        Ok(())
    }
    /// Persist separate proposal/review rights. A Reader may propose; Accept requires a Reviewer
    /// who is also a current document Editor. Reject never changes accepted document content.
    /// # Errors
    /// Non-owner administration, unreadable/invalid accounts, bounds or I/O failure rejects.
    pub fn grant_document_suggestions(
        &mut self,
        actor: &str,
        principal: &str,
        role: Option<SuggestionRole>,
    ) -> Result<()> {
        self.check_suggestion_grant(actor, principal, role)?;
        self.log.append(Event::GrantDocumentSuggestionsV1 {
            actor: actor.into(),
            principal: principal.into(),
            role,
        })?;
        let result = self.apply_suggestion_grant(principal.into(), role);
        if result.is_err() {
            self.log.invalidate();
        }
        result
    }
}
