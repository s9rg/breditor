//! Check incoming permissions using verified causal inputs before native publication.
use super::{
    ReviewActorId, ReviewActorPolicy, ReviewError, ReviewEventId, ReviewSession,
    actions::{self, ReviewAction},
    event::{self, Event, EventPositions, Payload},
    identity::Counter,
};

#[derive(Clone, Copy)]
pub(super) enum AnchorCheck {
    IncomingAction,
    IncludeHistoryTarget,
}

pub(super) struct BatchAdmission {
    positions: Option<EventPositions>,
}

impl BatchAdmission {
    // A live or restored owner already passed full native admission. A staging
    // caller must extend this index only through this batch's append method.
    pub(super) fn new(owner: &ReviewSession) -> Self {
        Self { positions: EventPositions::from_events(&owner.events) }
    }

    pub(super) fn lookup<'a>(&self, events: &'a [Event], id: &ReviewEventId) -> Option<&'a Event> {
        if let Some(positions) = &self.positions {
            positions.lookup(events, &id.actor, id.counter)
        } else {
            events.iter().find(|event| event.id == *id)
        }
    }

    pub(super) fn missing_dependencies(
        &self,
        events: &[Event],
        event: &Event,
    ) -> Vec<ReviewEventId> {
        if let Some(positions) = &self.positions {
            missing_from(event, |actor| positions.through(actor))
        } else {
            let clock = event::clock(events);
            missing_from(event, |actor| clock.get(actor).copied())
        }
    }

    pub(super) fn append(
        &mut self,
        candidate: &mut ReviewSession,
        event: Event,
        policy: &ReviewActorPolicy,
        anchors: AnchorCheck,
        validate_anchor: &mut impl FnMut(&str) -> Result<(), ReviewError>,
    ) -> Result<(), ReviewError> {
        let action = match &event.payload {
            Payload::Action(action) => action,
            Payload::Visibility { target, .. } => {
                let original = self
                    .lookup(&candidate.events, target)
                    .filter(|_| event::observes(&event.dependencies, target))
                    .ok_or(ReviewError::Contract("unobserved history target"))?;
                let Payload::Action(action) = &original.payload else {
                    return Err(ReviewError::Contract("history toggle target"));
                };
                action
            }
        };
        if matches!(event.payload, Payload::Action(_))
            || matches!(anchors, AnchorCheck::IncludeHistoryTarget)
        {
            match action {
                ReviewAction::CreateThread(value) => validate_anchor(&value.anchor_json)?,
                ReviewAction::ReanchorThread(value) => validate_anchor(&value.anchor_json)?,
                _ => {}
            }
        }

        let keep_index = if let Some(positions) = self.proven_frontier(candidate, &event) {
            let birth =
                |id: &ReviewEventId| positions.lookup(&candidate.events, &id.actor, id.counter);
            actions::validate_action(
                &candidate.binding,
                action,
                Some(policy),
                &event.dependencies,
                |id| {
                    birth(id.event())
                        .filter(|event| {
                            matches!(event.payload, Payload::Action(ReviewAction::CreateThread(_)))
                        })
                        .map(|event| &event.principal)
                },
                |id| {
                    birth(id.event())
                        .filter(|event| {
                            matches!(
                                event.payload,
                                Payload::Action(
                                    ReviewAction::CreateThread(_) | ReviewAction::Reply(_)
                                )
                            )
                        })
                        .map(|event| &event.principal)
                },
            )?;
            event.dependencies.len() <= 1024
                && positions.continues(&event)
                && match &event.payload {
                    Payload::Action(_) => true,
                    Payload::Visibility { target, .. } => target.actor == event.id.actor,
                }
        } else {
            // Preserve the exact projection failure and callback order for
            // malformed inputs. The entire batch still needs final admission.
            let base = candidate
                .events
                .iter()
                .filter(|known| event::observes(&event.dependencies, &known.id))
                .cloned()
                .collect::<Vec<_>>();
            candidate.projection(&base)?.validate_action(
                &candidate.binding,
                action,
                Some(policy),
                &event.dependencies,
            )?;
            false
        };

        if keep_index {
            if let Some(positions) = &mut self.positions {
                positions.record(&event.id, candidate.events.len());
            }
        } else {
            self.positions = None;
        }
        candidate.events.push(event);
        Ok(())
    }

    fn proven_frontier(&self, owner: &ReviewSession, event: &Event) -> Option<&EventPositions> {
        let positions = self.positions.as_ref()?;
        let view_len = event.dependencies.values().try_fold(0_usize, |total, counter| {
            let count = usize::try_from(counter.0).ok().filter(|count| *count > 0)?;
            total.checked_add(count)
        })?;
        if view_len > owner.event_limit() {
            return None;
        }
        event::validate_causal_frontier(event, |actor, counter| {
            positions.lookup(&owner.events, actor, counter)
        })
        .ok()?;
        Some(positions)
    }
}

fn missing_from(
    event: &Event,
    known_through: impl Fn(&ReviewActorId) -> Option<Counter>,
) -> Vec<ReviewEventId> {
    event
        .dependencies
        .iter()
        .filter(|(actor, counter)| known_through(actor).is_none_or(|known| known < **counter))
        .map(|(actor, counter)| ReviewEventId { actor: actor.clone(), counter: *counter })
        .collect()
}
