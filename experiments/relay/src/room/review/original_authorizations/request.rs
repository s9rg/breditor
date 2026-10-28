//! Bound and order ranges before native reads or provider callbacks.
use super::ReviewOriginalAuthorizationRange;
use crate::{Error, Result};

pub(super) fn counter(value: &str) -> Result<u64> {
    // No canonical u64 decimal can exceed twenty bytes. Bound the primitive
    // before parsing or encoding a direct native caller's owned strings.
    if value.len() > 20 {
        return Err(Error::Contract("original role counter length"));
    }
    let parsed = value.parse::<u64>().map_err(|_| Error::Contract("original role counter"))?;
    if parsed == 0 || parsed.to_string() != value {
        return Err(Error::Contract("original role canonical positive counter"));
    }
    Ok(parsed)
}
impl ReviewOriginalAuthorizationRange {
    pub(crate) fn validate_list(binding: &str, ranges: &[Self]) -> Result<()> {
        if binding.len() != 64
            || !binding.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            || ranges.len() > 1024
        {
            return Err(Error::Contract("original role request bounds"));
        }
        let mut previous: Option<(&str, u64)> = None;
        for range in ranges {
            let from = counter(&range.from)?;
            let through = counter(&range.through)?;
            if from > through
                || previous.is_some_and(|(actor, end)| {
                    range.actor.as_str() < actor || range.actor.as_str() == actor && from <= end
                })
            {
                return Err(Error::Contract("original role range order or overlap"));
            }
            previous = Some((range.actor.as_str(), through));
        }
        // All primitive string lengths and row counts are now bounded, so this
        // exact aggregate JSON budget cannot first copy an unbounded counter.
        if serde_json::to_vec(ranges)?.len() > 64 * 1024 {
            return Err(Error::Contract("original role request bounds"));
        }
        Ok(())
    }
}
