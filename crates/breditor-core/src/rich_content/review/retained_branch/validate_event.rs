//! The existing causal-action permission rules under an explicitly supplied historical grant.
use super::super::{
    ReviewActorPolicy, ReviewError, ReviewSession,
    actions::ReviewAction,
    event::{self, Event, Payload},
};
pub(super) fn validate(
    candidate: &ReviewSession,
    event: &Event,
    verified: &ReviewActorPolicy,
    validate_anchor: &mut impl FnMut(&str) -> Result<(), ReviewError>,
) -> Result<(), ReviewError> {
    if event.id.actor != verified.actor || event.principal != verified.principal {
        return Err(ReviewError::Permission);
    }
    let base = candidate
        .events
        .iter()
        .filter(|known| event::observes(&event.dependencies, &known.id))
        .cloned()
        .collect::<Vec<_>>();
    let action = match &event.payload {
        Payload::Action(action) => action,
        Payload::Visibility { target, .. } => {
            let original = base
                .iter()
                .find(|known| known.id == *target)
                .ok_or(ReviewError::Contract("unobserved history target"))?;
            let Payload::Action(action) = &original.payload else {
                return Err(ReviewError::Contract("history toggle target"));
            };
            action
        }
    };
    match action {
        ReviewAction::CreateThread(value) => validate_anchor(&value.anchor_json)?,
        ReviewAction::ReanchorThread(value) => validate_anchor(&value.anchor_json)?,
        _ => {}
    }
    candidate.projection(&base)?.validate_action(
        &candidate.binding,
        action,
        Some(verified),
        &event.dependencies,
    )
}
