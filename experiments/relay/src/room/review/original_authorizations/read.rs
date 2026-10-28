//! Reconstruct first acceptance roles, never a later overlapping batch's grant.
use super::super::Room;
use super::{
    ReviewOriginalAuthorizationPending, ReviewOriginalAuthorizationPendingReason as Reason,
    ReviewOriginalAuthorizationRange, ReviewOriginalAuthorizationRead,
    ReviewOriginalAuthorizationStatus as Status, ReviewOriginalAuthorizationWindow,
    request::counter,
};
use crate::{Error, Result};
use std::collections::BTreeMap;

impl Room {
    /// Read exact original accepted comment rights, including a boundary inside a network batch.
    /// Ranges must be actor-ordered, positive, canonical and nonoverlapping. A pending range
    /// yields no windows at all. Native generation boundaries and physical log rotation do not
    /// reset event counters, first acceptance or account attribution. No credential, current
    /// authoring permission, receipt, native edit, cursor or serving authority is created.
    /// # Errors
    /// Missing current read access, foreign namespace, conflicting actor account, malformed or
    /// oversized ranges, too many role windows, unavailable storage or inconsistent native state.
    pub fn review_original_authorizations(
        &self,
        principal: &str,
        binding: &str,
        ranges: &[ReviewOriginalAuthorizationRange],
    ) -> Result<ReviewOriginalAuthorizationRead> {
        self.reader(principal)?;
        ReviewOriginalAuthorizationRange::validate_list(binding, ranges)?;
        let descriptor = self.review_descriptor(principal)?;
        if descriptor.binding != binding {
            return Err(Error::Contract("original role review namespace"));
        }
        let state = self.review_state()?;
        let mut batches = BTreeMap::new();
        for batch in &state.batches {
            let sequence = counter(&batch.sequence)?;
            if batches.insert(sequence, batch).is_some() {
                return Err(Error::NeedsRecovery);
            }
        }
        let mut windows: Vec<ReviewOriginalAuthorizationWindow> = Vec::new();
        let mut pending = Vec::new();
        for range in ranges {
            let Some(writer) = state.writers.get(&range.actor) else {
                pending.push(ReviewOriginalAuthorizationPending {
                    range: range.clone(),
                    accepted_through: "0".into(),
                    reason: Reason::UnknownActor,
                });
                continue;
            };
            if writer.principal != range.principal.as_str() {
                return Err(Error::Permission);
            }
            let accepted = state.session.writer_clock(&range.actor, &range.principal)?;
            if writer.observer
                || counter(&range.through)?
                    > accepted.through.parse::<u64>().map_err(|_| Error::NeedsRecovery)?
            {
                pending.push(ReviewOriginalAuthorizationPending {
                    range: range.clone(),
                    accepted_through: accepted.through,
                    reason: if writer.observer { Reason::Observer } else { Reason::Unaccepted },
                });
                continue;
            }
            super::windows::append_windows(state, &batches, range, &mut windows)?;
        }
        if !pending.is_empty() {
            windows.clear();
        }
        let result = ReviewOriginalAuthorizationRead {
            format: "breditor/relay-review-original-authorizations",
            format_version: 1,
            descriptor,
            ranges: ranges.to_vec(),
            kind: if pending.is_empty() { Status::Covered } else { Status::Pending },
            windows,
            pending,
        };
        if serde_json::to_vec(&result)?.len() > 4 * 1024 * 1024 {
            return Err(Error::Contract("original role complete response budget"));
        }
        self.log.ready()?;
        Ok(result)
    }
}
