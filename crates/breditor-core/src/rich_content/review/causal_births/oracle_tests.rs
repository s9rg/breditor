//! Preserve the full causal-prefix replay as an independent admission oracle.
use super::super::{
    ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId,
    ReviewMessageId, ReviewPrincipalId, ReviewSession, ReviewThreadId,
    actions::{
        CreateReviewThread, EditReviewMessage, ReanchorReviewThread, ReplyToReviewThread,
        RetractReviewMessage, ReviewAction, SetReviewThreadState,
    },
    codec,
    event::{self, Clock, Event, Payload},
    identity::Counter,
};
use crate::{rich_content::DocumentId, schema::SchemaFingerprint};
use proptest::prelude::*;
use std::collections::{BTreeMap, BTreeSet};

// Intentionally retain the pre-optimization complete validation, including error order.
fn reference(session: &ReviewSession) -> Result<(), ReviewError> {
    let ordered = event::ordered(&session.events, session.event_limit())?;
    let mut principals = BTreeMap::new();
    let mut local_targets = BTreeSet::new();
    let mut streams = BTreeMap::<ReviewActorId, &Event>::new();
    let mut histories = BTreeMap::<_, (Vec<ReviewEventId>, usize)>::new();
    for event in ordered {
        let expected = streams.get(&event.id.actor).map_or_else(
            || event::genesis(&session.binding, &event.id.actor, &event.principal),
            |previous| event::digest(previous),
        )?;
        if event.previous_digest != expected {
            return Err(ReviewError::Fork);
        }
        streams.insert(event.id.actor.clone(), event);
        if let Some(old) = principals.insert(&event.id.actor, &event.principal)
            && old != &event.principal
        {
            return Err(ReviewError::Fork);
        }
        if event.id.actor == session.policy.actor && event.principal != session.policy.principal {
            return Err(ReviewError::Permission);
        }
        if let Payload::Action(action) = &event.payload {
            let base = session
                .events
                .iter()
                .filter(|e| event::observes(&event.dependencies, &e.id))
                .cloned()
                .collect::<Vec<_>>();
            session.projection(&base)?.validate_action(
                &session.binding,
                action,
                None,
                &event.dependencies,
            )?;
            if event.id.actor == session.policy.actor {
                local_targets.insert(&event.id);
            }
        }
        let (stack, cursor) = histories.entry(event.id.actor.clone()).or_default();
        match &event.payload {
            Payload::Action(_) => {
                stack.truncate(*cursor);
                stack.push(event.id.clone());
                *cursor = stack.len();
            }
            Payload::Visibility { target, visible: false } => {
                if *cursor == 0 || stack.get(*cursor - 1) != Some(target) {
                    return Err(ReviewError::Contract("review Undo stack"));
                }
                *cursor -= 1;
            }
            Payload::Visibility { target, visible: true } => {
                if stack.get(*cursor) != Some(target) {
                    return Err(ReviewError::Contract("review Redo stack"));
                }
                *cursor += 1;
            }
        }
    }
    if streams.len() > 1024 {
        return Err(ReviewError::Limit("causal actors"));
    }
    let expected = histories.get(&session.policy.actor).cloned().unwrap_or_default();
    if expected != (session.history.clone(), session.cursor) {
        return Err(ReviewError::Contract("review history replay"));
    }
    let mut unique = BTreeSet::new();
    if session.cursor > session.history.len()
        || session.history.iter().any(|id| !local_targets.contains(id) || !unique.insert(id))
    {
        return Err(ReviewError::Contract("review history partition"));
    }
    Ok(())
}

type TestResult<T> = Result<T, Box<dyn std::error::Error>>;
fn anchor() -> String {
    serde_json::json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}","0".repeat(64)),"anchors":{"kind":"document"}}).to_string()
}
fn candidate_action(
    byte: u8,
    thread: Option<&ReviewThreadId>,
    message: Option<&ReviewMessageId>,
) -> ReviewAction {
    match (byte % 8, thread, message) {
        (1, Some(thread), _) => ReviewAction::Reply(ReplyToReviewThread {
            thread: thread.clone(),
            body: "Reply🙂".into(),
        }),
        (2, _, Some(message)) => ReviewAction::EditMessage(EditReviewMessage {
            message: message.clone(),
            body: "Edit🙂".into(),
        }),
        (3, _, Some(message)) => {
            ReviewAction::RetractMessage(RetractReviewMessage { message: message.clone() })
        }
        (4, Some(thread), _) => ReviewAction::SetThreadState(SetReviewThreadState {
            thread: thread.clone(),
            resolved: byte & 16 != 0,
        }),
        (5, Some(thread), _) => ReviewAction::ReanchorThread(ReanchorReviewThread {
            thread: thread.clone(),
            anchor_json: anchor(),
        }),
        _ => ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor(),
            body: "Birth🙂".into(),
        }),
    }
}
fn fixture(spec: &[u8]) -> TestResult<ReviewSession> {
    let binding = ReviewBinding::new(
        &DocumentId::try_new("room")?,
        format!("sha256:{}", "0".repeat(64)).parse::<SchemaFingerprint>()?,
    );
    let actor = ReviewActorId::try_new("actor-0")?;
    let mut owner = ReviewSession::new(
        binding,
        ReviewActorPolicy {
            actor: actor.clone(),
            principal: ReviewPrincipalId::try_new("principal-0")?,
            access: ReviewAccess::ReadOnly,
        },
    )?;
    let mut histories = BTreeMap::<ReviewActorId, (Vec<ReviewEventId>, usize)>::new();
    for byte in spec {
        let index = byte % 3;
        let current = ReviewActorId::try_new(format!("actor-{index}"))?;
        let principal = ReviewPrincipalId::try_new(format!("principal-{index}"))?;
        let full = event::clock(&owner.events);
        let previous = full.get(&current).map_or(0, |n| n.0);
        let mut dependencies: Clock =
            full.into_iter().filter(|(a, _)| a == &current || byte & 128 == 0).collect();
        loop {
            let before = dependencies.clone();
            for event in &owner.events {
                if event::observes(&dependencies, &event.id) {
                    for (a, c) in &event.dependencies {
                        dependencies
                            .entry(a.clone())
                            .and_modify(|v| *v = (*v).max(*c))
                            .or_insert(*c);
                    }
                }
            }
            if dependencies == before {
                break;
            }
        }
        let id = ReviewEventId::try_new(current.clone(), previous + 1)?;
        let births = owner.events.iter().filter(|e| event::observes(&dependencies, &e.id));
        let threads = births
            .clone()
            .filter(|e| matches!(e.payload, Payload::Action(ReviewAction::CreateThread(_))))
            .map(|e| ReviewThreadId::from_event(e.id.clone()))
            .collect::<Vec<_>>();
        let messages = births
            .filter(|e| {
                matches!(
                    e.payload,
                    Payload::Action(ReviewAction::CreateThread(_) | ReviewAction::Reply(_))
                )
            })
            .map(|e| ReviewMessageId::from_event(e.id.clone()))
            .collect::<Vec<_>>();
        let thread = threads.get(usize::from(*byte) % threads.len().max(1));
        let message = messages.get(usize::from(*byte) % messages.len().max(1));
        let action = candidate_action(*byte, thread, message);
        let (stack, cursor) = histories.entry(current.clone()).or_default();
        let payload = if byte % 8 == 6 && *cursor > 0 {
            *cursor -= 1;
            Payload::Visibility { target: stack[*cursor].clone(), visible: false }
        } else if byte % 8 == 7 && *cursor < stack.len() {
            let target = stack[*cursor].clone();
            *cursor += 1;
            Payload::Visibility { target, visible: true }
        } else {
            stack.truncate(*cursor);
            stack.push(id.clone());
            *cursor = stack.len();
            Payload::Action(action)
        };
        let previous_digest =
            owner.events.iter().rev().find(|e| e.id.actor == current).map_or_else(
                || event::genesis(&owner.binding, &current, &principal),
                event::digest,
            )?;
        owner.events.push(Event { id, principal, dependencies, previous_digest, payload });
    }
    (owner.history, owner.cursor) = histories.remove(&actor).unwrap_or_default();
    Ok(owner)
}

fn spelling(result: Result<(), ReviewError>) -> Result<(), String> {
    result.map_err(|e| e.to_string())
}

fn validate(session: &ReviewSession) -> Result<(), ReviewError> {
    let ordered = event::ordered(&session.events, session.event_limit())?;
    codec::validate_ordered(session, &ordered)
}

fn rehash(owner: &mut ReviewSession) -> TestResult<()> {
    let mut streams = BTreeMap::<ReviewActorId, String>::new();
    for event in &mut owner.events {
        event.previous_digest = streams.get(&event.id.actor).cloned().map_or_else(
            || event::genesis(&owner.binding, &event.id.actor, &event.principal),
            Ok,
        )?;
        streams.insert(event.id.actor.clone(), event::digest(event)?);
    }
    Ok(())
}

proptest! {
    #[test]
    fn valid_causal_birth_admission_matches_full_prefix_replay(spec in prop::collection::vec(any::<u8>(),0..40)) {
        let mut owner=fixture(&spec).map_err(|e|TestCaseError::fail(e.to_string()))?;
        owner.events.reverse();
        prop_assert_eq!(spelling(reference(&owner)),Ok(()));
        prop_assert_eq!(spelling(validate(&owner)),Ok(()));
    }
    #[test]
    fn corrupt_histories_keep_the_full_prefix_oracle_refusals(spec in prop::collection::vec(any::<u8>(),1..40),corruption in 0_u8..12) {
        let mut owner=fixture(&spec).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let last=owner.events.len()-1;
        let unknown=owner.events[last].id.clone();
        match corruption {
            1=>owner.events[last].payload=Payload::Action(ReviewAction::Reply(ReplyToReviewThread {thread:ReviewThreadId::from_event(unknown),body:"Changed".into()})),
            2=>owner.events[last].payload=Payload::Action(ReviewAction::EditMessage(EditReviewMessage {message:ReviewMessageId::from_event(unknown),body:"Changed".into()})),
            3=>owner.events[last].payload=Payload::Action(ReviewAction::CreateThread(CreateReviewThread {anchor_json:"{}".into(),body:"Changed".into()})),
            4=>owner.events[last].payload=Payload::Action(ReviewAction::CreateThread(CreateReviewThread {anchor_json:anchor(),body:"\0".into()})),
            5=>owner.cursor=owner.history.len()+1,
            6=>owner.events[last].payload=Payload::Visibility {target:unknown,visible:false},
            7=>{owner.events[last].dependencies.clear();},
            8=>{owner.events[last].principal=ReviewPrincipalId::try_new("changed").map_err(|e|TestCaseError::fail(e.to_string()))?;},
            9=>{owner.events.push(owner.events[last].clone());},
            10=>{owner.events.remove(0);},
            11=>{owner.events[last].dependencies.insert(ReviewActorId::try_new("missing").map_err(|e|TestCaseError::fail(e.to_string()))?,Counter(1));},
            _=>{},
        }
        rehash(&mut owner).map_err(|e|TestCaseError::fail(e.to_string()))?;
        owner.events.reverse();
        prop_assert_eq!(spelling(validate(&owner)),spelling(reference(&owner)));
    }
}
