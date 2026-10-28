//! Original event-to-acceptance joins and native prefix reads for one complete requested range.
use super::super::{ReviewState, StoredReviewBatch};
use super::{
    ReviewOriginalAuthorizationRange, ReviewOriginalAuthorizationWindow, request::counter,
};
use crate::{Error, Result};
use std::collections::BTreeMap;
pub(super) fn append_windows(
    state: &ReviewState,
    batches: &BTreeMap<u64, &StoredReviewBatch>,
    range: &ReviewOriginalAuthorizationRange,
    windows: &mut Vec<ReviewOriginalAuthorizationWindow>,
) -> Result<()> {
    let from = counter(&range.from)?;
    let through = counter(&range.through)?;
    let first = windows.len();
    let mut last: Option<u64> = None;
    // Walk actual accepted entries, not an attacker-sized integer range.
    for ((_, event), sequence) in
        state.accepted.range((range.actor.clone(), from)..=(range.actor.clone(), through))
    {
        if last.map_or(*event != from, |prior| prior.checked_add(1) != Some(*event)) {
            return Err(Error::NeedsRecovery);
        }
        let batch = batches.get(sequence).ok_or(Error::NeedsRecovery)?;
        if batch.source.actor != range.actor
            || batch.source.principal != range.principal
            || *event < counter(&batch.receipt.from)?
            || *event > counter(&batch.receipt.through)?
        {
            return Err(Error::NeedsRecovery);
        }
        if windows.len() > first
            && windows.last().is_some_and(|window| window.source == batch.source)
        {
            windows.last_mut().ok_or(Error::NeedsRecovery)?.through = event.to_string();
        } else {
            if windows.len() >= 4096 {
                return Err(Error::Contract("original role window budget"));
            }
            windows.push(ReviewOriginalAuthorizationWindow {
                source: batch.source.clone(),
                from: event.to_string(),
                through: event.to_string(),
                prefix_digest: String::new(),
            });
        }
        last = Some(*event);
    }
    if last != Some(through) {
        return Err(Error::NeedsRecovery);
    }
    for window in &mut windows[first..] {
        window.prefix_digest = state
            .session
            .writer_clock_at(&range.actor, &range.principal, counter(&window.through)?)?
            .prefix_digest;
    }
    Ok(())
}
