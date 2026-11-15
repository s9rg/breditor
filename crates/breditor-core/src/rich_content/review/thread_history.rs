//! Read bounded, attributed history for one immutable thread from this exact review owner.
use super::{
    ReviewError, ReviewEventId, ReviewMessageId, ReviewObservation, ReviewPrincipalId,
    ReviewSession, ReviewThreadId, ReviewThreadView,
    actions::ReviewAction,
    event::{self, Event, Payload},
    materialize::Projection,
};
use serde::Serialize;
use std::collections::BTreeSet;

const PAGE_EVENTS: usize = 16;
const PAGE_BYTES: usize = 1024 * 1024;

/// One attributed original event, including a stable digest of its complete native record.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewThreadHistoryEntry<'a> {
    /// Zero-based position among this thread's included events.
    pub index: u32,
    /// Immutable event identity within the selected original branch.
    pub id: &'a ReviewEventId,
    /// Original account recorded by the selected native history.
    pub principal: &'a ReviewPrincipalId,
    /// Digest of the entire original event, including its native causal frontier.
    pub digest: String,
    /// Literal action or history visibility change retained by the native owner.
    pub payload: &'a Payload,
}

/// Bounded page of the thread's events in native causal order.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewThreadHistoryPage<'a> {
    /// Exact immutable birth selected within this branch.
    pub thread: &'a ReviewEventId,
    /// Attributed original events, including edits and Undo/Redo visibility changes.
    pub events: Vec<ReviewThreadHistoryEntry<'a>>,
    /// Forward-only offset within this exact thread in this publication.
    pub next_offset: Option<u32>,
}

struct ThreadEvents<'a> {
    thread: ReviewThreadId,
    messages: BTreeSet<&'a ReviewEventId>,
    actions: BTreeSet<&'a ReviewEventId>,
}

impl<'a> ThreadEvents<'a> {
    fn includes(&mut self, event: &'a Event) -> bool {
        let action = match &event.payload {
            Payload::Action(action) => action,
            Payload::Visibility { target, .. } => return self.actions.contains(target),
        };
        let included = match action {
            ReviewAction::CreateThread(_) => {
                let selected = self.thread.event() == &event.id;
                if selected {
                    self.messages.insert(&event.id);
                }
                selected
            }
            ReviewAction::Reply(reply) => {
                let selected = reply.thread == self.thread;
                if selected {
                    self.messages.insert(&event.id);
                }
                selected
            }
            ReviewAction::EditMessage(edit) => self.includes_message(&edit.message),
            ReviewAction::RetractMessage(retract) => self.includes_message(&retract.message),
            ReviewAction::SetThreadState(state) => state.thread == self.thread,
            ReviewAction::ReanchorThread(anchor) => anchor.thread == self.thread,
        };
        if included {
            self.actions.insert(&event.id);
        }
        included
    }

    fn includes_message(&self, message: &ReviewMessageId) -> bool {
        self.messages.contains(message.event())
    }
}

impl ReviewSession {
    /// Read exact historical actions for one thread at a checked publication, including hidden events.
    ///
    /// # Errors
    /// Fails on a foreign observation, absent birth, invalid offset or native history invariant.
    pub fn read_thread_history<'a>(
        &'a self,
        observed: &ReviewObservation,
        thread: &ReviewThreadId,
        offset: u32,
    ) -> Result<ReviewThreadHistoryPage<'a>, ReviewError> {
        self.check(observed)?;
        let birth = self.thread_birth(thread)?;
        let mut events = Vec::new();
        let mut bytes = 0;
        let mut index = 0_u32;
        for event in self.thread_events(thread)? {
            if index >= offset {
                if events.len() == PAGE_EVENTS {
                    return Ok(ReviewThreadHistoryPage {
                        thread: &birth.id,
                        events,
                        next_offset: Some(index),
                    });
                }
                let entry = history_entry(index, event)?;
                bytes += serde_json::to_vec(&entry)?.len() + 1;
                if bytes > PAGE_BYTES {
                    if events.is_empty() {
                        return Err(ReviewError::Limit("review thread history event bytes"));
                    }
                    return Ok(ReviewThreadHistoryPage {
                        thread: &birth.id,
                        events,
                        next_offset: Some(index),
                    });
                }
                events.push(entry);
            }
            index =
                index.checked_add(1).ok_or(ReviewError::Limit("review thread history length"))?;
        }
        if index < offset {
            return Err(ReviewError::Contract("review thread history offset"));
        }
        Ok(ReviewThreadHistoryPage { thread: &birth.id, events, next_offset: None })
    }

    /// Read only the immutable creation event, even when its original message is hidden.
    ///
    /// # Errors
    /// Fails on a foreign observation, absent birth or native serialization error.
    pub fn read_thread_birth(
        &self,
        observed: &ReviewObservation,
        thread: &ReviewThreadId,
    ) -> Result<ReviewThreadHistoryEntry<'_>, ReviewError> {
        self.check(observed)?;
        history_entry(0, self.thread_birth(thread)?)
    }

    /// Visit the complete native timeline of one discussion in canonical order, and
    /// return its current projection. Perform one ordered traversal for all event
    /// attribution, visibility and projection. The visitor is for validation or
    /// bounded staging. Publish its effects only after this method succeeds.
    ///
    /// # Errors
    /// Fails on a foreign observation, absent birth, invalid native history or a
    /// refusal from the visitor.
    pub fn visit_thread_history<'a>(
        &'a self,
        observed: &ReviewObservation,
        thread: &ReviewThreadId,
        mut visit: impl FnMut(ReviewThreadHistoryEntry<'a>) -> Result<(), ReviewError>,
    ) -> Result<ReviewThreadView, ReviewError> {
        self.check(observed)?;
        self.thread_birth(thread)?;
        let events = self.thread_events(thread)?.collect::<Vec<_>>();
        let projection = Projection::from_ordered(&events)?
            .view()
            .pop()
            .ok_or(ReviewError::Contract("review thread projection"))?;
        for (index, event) in events.into_iter().enumerate() {
            let index = u32::try_from(index)
                .map_err(|_| ReviewError::Limit("review thread history length"))?;
            visit(history_entry(index, event)?)?;
        }
        Ok(projection)
    }

    fn thread_birth(&self, thread: &ReviewThreadId) -> Result<&Event, ReviewError> {
        self.events
            .iter()
            .find(|event| {
                &event.id == thread.event()
                    && matches!(event.payload, Payload::Action(ReviewAction::CreateThread(_)))
            })
            .ok_or(ReviewError::Contract("review thread history birth"))
    }

    fn thread_events<'a>(
        &'a self,
        thread: &ReviewThreadId,
    ) -> Result<impl Iterator<Item = &'a Event> + use<'a>, ReviewError> {
        let mut filter = ThreadEvents {
            thread: thread.clone(),
            messages: BTreeSet::new(),
            actions: BTreeSet::new(),
        };
        Ok(event::ordered(&self.events, self.event_limit())?
            .into_iter()
            .filter(move |event| filter.includes(event)))
    }
}

fn history_entry(index: u32, event: &Event) -> Result<ReviewThreadHistoryEntry<'_>, ReviewError> {
    Ok(ReviewThreadHistoryEntry {
        index,
        id: &event.id,
        principal: &event.principal,
        digest: event::digest(event)?,
        payload: &event.payload,
    })
}
