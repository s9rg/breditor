//! Materialize the native comment receiver and the exact ordered server acknowledgements.
use super::{ReviewActorId, ReviewRole, ReviewState, ReviewWriter, StoredReviewBatch};
use crate::{Error, Result, Room, room::materialized_checkpoint::sequence};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct ReviewCheckpoint {
    binding: String,
    enabled_at: u64,
    history: String,
    family: ReviewFamily,
    roles: BTreeMap<String, ReviewRole>,
    writers: BTreeMap<ReviewActorId, ReviewWriter>,
    batches: Vec<StoredReviewBatch>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ReviewFamily {
    Original,
    Segmented,
    Continued,
}

impl ReviewCheckpoint {
    pub(in crate::room) fn capture(state: &ReviewState) -> Result<Self> {
        let (family, history) = if state.session.has_continued_history() {
            (ReviewFamily::Continued, state.session.continued_checkpoint_json()?)
        } else if state.session.has_segmented_history() {
            (ReviewFamily::Segmented, state.session.segmented_checkpoint_json()?)
        } else {
            (ReviewFamily::Original, state.session.checkpoint_json()?)
        };
        Ok(Self {
            binding: state.binding.clone(),
            enabled_at: state.enabled_at,
            family,
            history,
            roles: state.roles.clone(),
            writers: state.writers.clone(),
            batches: state.batches.clone(),
        })
    }

    pub(in crate::room) fn restore(self, room: &mut Room, end: u64) -> Result<()> {
        crate::credentials::hash(&self.binding)?;
        if self.enabled_at == 0 || self.enabled_at >= end || self.writers.len() > super::MAX_ACTORS
        {
            return Err(Error::Contract("relay checkpoint review bounds"));
        }
        let policy = room.review_receiver_policy()?;
        let session = match self.family {
            ReviewFamily::Original => room.replica.restore_review_session(policy, &self.history)?,
            ReviewFamily::Segmented => {
                room.replica.restore_segmented_review_session(policy, &self.history)?
            }
            ReviewFamily::Continued => {
                room.replica.restore_continued_review_session(policy, &self.history)?
            }
        };
        room.review = Some(ReviewState {
            binding: self.binding,
            enabled_at: self.enabled_at,
            session,
            roles: self.roles,
            writers: self.writers,
            leases: BTreeMap::new(),
            batches: Vec::with_capacity(self.batches.len()),
            accepted: BTreeMap::new(),
        });
        let mut last = self.enabled_at;
        for batch in self.batches {
            let index = sequence(&batch.sequence, end)?;
            let parse_counter = |value: &str| {
                value
                    .parse::<u64>()
                    .map_err(|_| Error::Contract("relay checkpoint comment counter"))
            };
            let from = parse_counter(&batch.receipt.from)?;
            let through = parse_counter(&batch.receipt.through)?;
            if index <= last
                || batch.receipt.actor != batch.source.actor
                // The native comment frame admits at most 128 events.
                || through.checked_sub(from).is_none_or(|span| span >= 128)
            {
                return Err(Error::Contract("relay checkpoint review sequence order"));
            }
            last = index;
            room.remember_review(index, batch.source, batch.frame, batch.receipt)?;
        }
        Ok(())
    }
}
