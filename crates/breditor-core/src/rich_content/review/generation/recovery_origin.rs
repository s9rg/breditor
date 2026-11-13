//! Additional file and active-prefix continuity for genuine native recovery owners.
use super::super::{ReviewError, ReviewSession};

pub(in crate::rich_content::review) fn check_generation_origin(
    current: &ReviewSession,
    origin: &ReviewSession,
) -> Result<(), ReviewError> {
    let failure = || ReviewError::Contract("review generation origin differs");
    match (&current.generations, &origin.generations) {
        (None, None) => Ok(()),
        (None, Some(_)) => Err(failure()),
        (Some(state), None) => {
            // An original-family origin must be inside the exact retained root,
            // not a same-ID event set manufactured after a different enable cut.
            let root = current.events.get(..state.root_events).ok_or_else(failure)?;
            if origin.events.iter().any(|event| !root.contains(event)) {
                return Err(failure());
            }
            Ok(())
        }
        (Some(state), Some(old)) => {
            if state.root_generation != old.root_generation
                || state.root_json != old.root_json
                || old.continued_after.is_some() && state.continued_after != old.continued_after
                || state.sealed.len() < old.sealed.len()
                || state.sealed.iter().zip(&old.sealed).any(|(a, b)| a.json != b.json)
            {
                return Err(failure());
            }
            let end = if state.active_generation == old.active_generation
                && state.active_start == old.active_start
            {
                current.events.len()
            } else {
                state
                    .sealed
                    .iter()
                    .find(|file| {
                        file.generation == old.active_generation && file.start == old.active_start
                    })
                    .ok_or_else(failure)?
                    .end
            };
            let count = origin.events.len().checked_sub(old.active_start).ok_or_else(failure)?;
            let expected_end = old.active_start.checked_add(count).ok_or_else(failure)?;
            if expected_end > end
                || current.events.get(old.active_start..expected_end)
                    != origin.events.get(old.active_start..)
            {
                return Err(failure());
            }
            Ok(())
        }
    }
}
