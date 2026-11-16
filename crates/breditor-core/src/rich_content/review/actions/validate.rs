//! Validate action inputs and live permission using immutable birth attribution.
use super::{
    super::{
        ReviewAccess, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewMessageId,
        ReviewPrincipalId, ReviewThreadId,
        event::{self, Clock},
    },
    ReviewAction,
};

pub(in crate::rich_content::review) fn validate_action<'a>(
    binding: &ReviewBinding,
    action: &ReviewAction,
    policy: Option<&ReviewActorPolicy>,
    dependencies: &Clock,
    thread_author: impl Fn(&ReviewThreadId) -> Option<&'a ReviewPrincipalId>,
    message_author: impl Fn(&ReviewMessageId) -> Option<&'a ReviewPrincipalId>,
) -> Result<(), ReviewError> {
    if policy.is_some_and(|p| p.access == ReviewAccess::ReadOnly) {
        return Err(ReviewError::Permission);
    }
    let thread = |id: &ReviewThreadId| {
        if !event::observes(dependencies, id.event()) {
            return Err(ReviewError::Contract("unobserved thread birth"));
        }
        thread_author(id).ok_or(ReviewError::Contract("unknown review thread"))
    };
    let message = |id: &ReviewMessageId| {
        if !event::observes(dependencies, id.event()) {
            return Err(ReviewError::Contract("unobserved message birth"));
        }
        let author = message_author(id).ok_or(ReviewError::Contract("unknown review message"))?;
        check_author(policy, author)
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
        ReviewAction::SetThreadState(action) => {
            thread(&action.thread)?;
        }
        ReviewAction::ReanchorThread(action) => {
            check_author(policy, thread(&action.thread)?)?;
            event::anchor(binding, &action.anchor_json)?;
        }
    }
    Ok(())
}

fn check_author(
    policy: Option<&ReviewActorPolicy>,
    author: &ReviewPrincipalId,
) -> Result<(), ReviewError> {
    if policy.is_some_and(|p| &p.principal != author && p.access != ReviewAccess::Moderate) {
        return Err(ReviewError::Permission);
    }
    Ok(())
}
