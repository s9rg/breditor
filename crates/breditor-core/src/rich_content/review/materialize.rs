//! Deterministic causal registers retain concurrent values and independently visible contributions.
use super::{
    ReviewAccess, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId, ReviewMessageId,
    ReviewMessageView, ReviewPrincipalId, ReviewTextVersion, ReviewThreadId, ReviewThreadState,
    ReviewThreadView,
    actions::ReviewAction,
    event::{self, Clock, Event, Payload},
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
struct Register<T>(BTreeMap<ReviewEventId, (ReviewPrincipalId, T)>);
impl<T> Register<T> {
    fn write(&mut self, event: &Event, value: T) {
        self.0.retain(|id, _| !event::observes(&event.dependencies, id));
        self.0.insert(event.id.clone(), (event.principal.clone(), value));
    }
}
struct Thread {
    author: ReviewPrincipalId,
    anchors: Register<String>,
    state: Register<bool>,
}
struct Message {
    thread: ReviewThreadId,
    author: ReviewPrincipalId,
    body: Register<Option<String>>,
}
pub(super) struct Projection {
    threads: BTreeMap<ReviewThreadId, Thread>,
    messages: BTreeMap<ReviewMessageId, Message>,
}
impl Projection {
    pub(super) fn build(events: &[Event], limit: usize) -> Result<Self, ReviewError> {
        Self::from_ordered(&event::ordered(events, limit)?)
    }

    // The caller supplies the native causal order, which has already been
    // validated. An isolated thread includes every action that can affect it.
    pub(super) fn from_ordered(events: &[&Event]) -> Result<Self, ReviewError> {
        let mut visibility = BTreeMap::new();
        let mut actions = BTreeSet::new();
        for event in events {
            match &event.payload {
                Payload::Action(_) => {
                    actions.insert(&event.id);
                }
                Payload::Visibility { target, visible } => {
                    if target.actor != event.id.actor
                        || !event::observes(&event.dependencies, target)
                        || !actions.contains(target)
                    {
                        return Err(ReviewError::Contract("review visibility target"));
                    }
                    visibility.insert(target, *visible);
                }
            }
        }
        let mut result = Self { threads: BTreeMap::new(), messages: BTreeMap::new() };
        for event in events {
            let active = visibility.get(&event.id).copied().unwrap_or(true);
            let Payload::Action(action) = &event.payload else {
                continue;
            };
            match action {
                ReviewAction::CreateThread(action) => {
                    let thread = ReviewThreadId::from_event(event.id.clone());
                    let mut anchors = Register::default();
                    anchors.write(event, action.anchor_json.clone());
                    let mut state = Register::default();
                    state.write(event, false);
                    result.threads.insert(
                        thread.clone(),
                        Thread { author: event.principal.clone(), anchors, state },
                    );
                    result.birth_message(event, thread, &action.body, active);
                }
                ReviewAction::Reply(action) => {
                    result.birth_message(event, action.thread.clone(), &action.body, active);
                }
                ReviewAction::EditMessage(action) if active => result
                    .messages
                    .get_mut(&action.message)
                    .ok_or(ReviewError::Contract("review message birth"))?
                    .body
                    .write(event, Some(action.body.clone())),
                ReviewAction::RetractMessage(action) if active => result
                    .messages
                    .get_mut(&action.message)
                    .ok_or(ReviewError::Contract("review message birth"))?
                    .body
                    .write(event, None),
                ReviewAction::SetThreadState(action) if active => result
                    .threads
                    .get_mut(&action.thread)
                    .ok_or(ReviewError::Contract("review thread birth"))?
                    .state
                    .write(event, action.resolved),
                ReviewAction::ReanchorThread(action) if active => result
                    .threads
                    .get_mut(&action.thread)
                    .ok_or(ReviewError::Contract("review thread birth"))?
                    .anchors
                    .write(event, action.anchor_json.clone()),
                _ => {}
            }
        }
        Ok(result)
    }
    fn birth_message(&mut self, event: &Event, thread: ReviewThreadId, text: &str, active: bool) {
        let mut body = Register::default();
        if active {
            body.write(event, Some(text.into()));
        }
        self.messages.insert(
            ReviewMessageId::from_event(event.id.clone()),
            Message { thread, author: event.principal.clone(), body },
        );
    }
    pub(super) fn validate_action(
        &self,
        binding: &ReviewBinding,
        action: &ReviewAction,
        policy: Option<&ReviewActorPolicy>,
        dependencies: &Clock,
    ) -> Result<(), ReviewError> {
        if policy.is_some_and(|p| p.access == ReviewAccess::ReadOnly) {
            return Err(ReviewError::Permission);
        }
        let thread = |id: &ReviewThreadId| {
            if !event::observes(dependencies, id.event()) {
                return Err(ReviewError::Contract("unobserved thread birth"));
            }
            self.threads.get(id).ok_or(ReviewError::Contract("unknown review thread"))
        };
        let message = |id: &ReviewMessageId| {
            if !event::observes(dependencies, id.event()) {
                return Err(ReviewError::Contract("unobserved message birth"));
            }
            let message =
                self.messages.get(id).ok_or(ReviewError::Contract("unknown review message"))?;
            if policy.is_some_and(|p| {
                p.principal != message.author && p.access != ReviewAccess::Moderate
            }) {
                return Err(ReviewError::Permission);
            }
            Ok(message)
        };
        match action {
            ReviewAction::CreateThread(a) => {
                event::anchor(binding, &a.anchor_json)?;
                event::text(&a.body)?;
            }
            ReviewAction::Reply(a) => {
                thread(&a.thread)?;
                event::text(&a.body)?;
            }
            ReviewAction::EditMessage(a) => {
                message(&a.message)?;
                event::text(&a.body)?;
            }
            ReviewAction::RetractMessage(a) => {
                message(&a.message)?;
            }
            ReviewAction::SetThreadState(a) => {
                thread(&a.thread)?;
            }
            ReviewAction::ReanchorThread(a) => {
                let thread = thread(&a.thread)?;
                if policy.is_some_and(|p| {
                    p.principal != thread.author && p.access != ReviewAccess::Moderate
                }) {
                    return Err(ReviewError::Permission);
                }
                event::anchor(binding, &a.anchor_json)?;
            }
        }
        Ok(())
    }
    pub(super) fn is_noop(&self, action: &ReviewAction) -> bool {
        let body = |id: &ReviewMessageId, expected: Option<&str>| {
            self.messages.get(id).is_some_and(|m| {
                !m.body.0.is_empty() && m.body.0.values().all(|(_, v)| v.as_deref() == expected)
            })
        };
        match action {
            ReviewAction::EditMessage(a) => body(&a.message, Some(&a.body)),
            ReviewAction::RetractMessage(a) => body(&a.message, None),
            ReviewAction::SetThreadState(a) => self.threads.get(&a.thread).is_some_and(|t| {
                !t.state.0.is_empty() && t.state.0.values().all(|(_, v)| *v == a.resolved)
            }),
            ReviewAction::ReanchorThread(a) => self.threads.get(&a.thread).is_some_and(|t| {
                !t.anchors.0.is_empty() && t.anchors.0.values().all(|(_, v)| *v == a.anchor_json)
            }),
            _ => false,
        }
    }
    pub(super) fn view(&self) -> Vec<ReviewThreadView> {
        self.threads
            .iter()
            .map(|(id, thread)| {
                let messages = self
                    .messages
                    .iter()
                    .filter(|(_, message)| message.thread == *id)
                    .map(|(id, message)| ReviewMessageView {
                        id: id.clone(),
                        author: message.author.clone(),
                        versions: message
                            .body
                            .0
                            .iter()
                            .map(|(event, (principal, text))| ReviewTextVersion {
                                event: event.clone(),
                                principal: principal.clone(),
                                text: text.clone(),
                            })
                            .collect(),
                    })
                    .collect::<Vec<_>>();
                let open = thread.state.0.values().any(|(_, v)| !v);
                let closed = thread.state.0.values().any(|(_, v)| *v);
                ReviewThreadView {
                    id: id.clone(),
                    author: thread.author.clone(),
                    anchors: thread.anchors.0.values().map(|(_, a)| a.clone()).collect(),
                    state: match (open, closed) {
                        (true, true) => ReviewThreadState::Conflicted,
                        (false, true) => ReviewThreadState::Resolved,
                        _ => ReviewThreadState::Open,
                    },
                    hidden: !messages.iter().flat_map(|m| &m.versions).any(|v| v.text.is_some()),
                    messages,
                }
            })
            .collect()
    }
}
