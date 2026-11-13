//! Immutable generation compatibility for the separate event-union contract.
use super::super::{ReviewError, ReviewSession};
pub(in crate::rich_content::review) fn check_retained_branch_generations(
    current: &ReviewSession,
    source: &ReviewSession,
) -> Result<(), ReviewError> {
    let fail = || ReviewError::Contract("review retained branch generations differ");
    match (&current.generations, &source.generations) {
        (_, None) => Ok(()),
        (None, Some(_)) => Err(fail()),
        (Some(now), Some(old)) => {
            if now.root_generation != old.root_generation
                || now.root_json != old.root_json
                || old.continued_after.is_some() && now.continued_after != old.continued_after
                || now.sealed.len() < old.sealed.len()
                || now.sealed.iter().zip(&old.sealed).any(|(a, b)| a.json != b.json)
            {
                return Err(fail());
            }
            if now.active_generation == old.active_generation
                && now.active_start == old.active_start
                || now.sealed.iter().any(|file| {
                    file.generation == old.active_generation && file.start == old.active_start
                })
            {
                Ok(())
            } else {
                Err(fail())
            }
        }
    }
}
