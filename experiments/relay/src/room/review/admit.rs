//! Native prepare -> append and fsync -> publish -> acknowledge, under one exclusive room transaction.
use super::{
    DurableReviewReceipt, ReviewAdmission, ReviewLease, ReviewSource, Room, StoredReviewBatch,
};
use crate::{Error, Result, log::Event};
use breditor_collab_feasibility::{
    review::ReviewBatchReceipt, rich_replica::DocumentReviewBatchPreparation as Preparation,
};

impl Room {
    pub(super) fn prepare_review(&self, source: &ReviewSource, frame: &str) -> Result<Preparation> {
        let state = self.review_state()?;
        Ok(self.replica.prepare_review_batch_guarded(
            &self.replica.observe()?,
            &state.session,
            &state.session.observe(),
            &source.policy(),
            frame,
        )?)
    }
    pub(super) fn remember_review(
        &mut self,
        sequence: u64,
        source: ReviewSource,
        frame: String,
        receipt: ReviewBatchReceipt,
    ) -> Result<DurableReviewReceipt> {
        let from =
            receipt.from.parse::<u64>().map_err(|_| Error::Contract("review receipt start"))?;
        let through =
            receipt.through.parse::<u64>().map_err(|_| Error::Contract("review receipt end"))?;
        let state = self.review_state_mut()?;
        for counter in from..=through {
            // An overlapping batch must retain the original acceptance of its already-known prefix.
            state.accepted.entry((receipt.actor.clone(), counter)).or_insert(sequence);
        }
        state.batches.push(StoredReviewBatch {
            sequence: sequence.to_string(),
            source,
            frame,
            receipt: receipt.clone(),
        });
        Ok(DurableReviewReceipt { sequence: sequence.to_string(), receipt, duplicate: false })
    }
    /// Admit one active authenticated metadata actor. Pending dependencies are NOT appended,
    /// published or acknowledged. Retries/repacked known prefixes return their original terminal
    /// event's durable sequence, without a second append, including after recovery.
    /// # Errors
    /// Rejects malformed/forked/native-invalid input, source or permission mismatch, stale leases,
    /// budgets and storage errors. An uncertain append fences ALL room reads/writes until recovery.
    pub fn admit_review(
        &mut self,
        principal: &str,
        lease: &ReviewLease,
        frame: &str,
    ) -> Result<ReviewAdmission> {
        self.validate_review_lease(principal, lease)?;
        let source = self.review_source(principal, &lease.actor)?;
        match self.prepare_review(&source, frame)? {
            Preparation::Empty => Ok(ReviewAdmission::Empty),
            Preparation::Pending(missing) => Ok(ReviewAdmission::Pending { missing }),
            Preparation::PendingDocument(missing) => {
                Ok(ReviewAdmission::PendingDocument { missing })
            }
            Preparation::Duplicate(receipt) => {
                let through = receipt
                    .through
                    .parse::<u64>()
                    .map_err(|_| Error::Contract("review receipt end"))?;
                let sequence = self
                    .review_state()?
                    .accepted
                    .get(&(receipt.actor.clone(), through))
                    .ok_or(Error::Contract("review duplicate has no durable acceptance"))?;
                Ok(ReviewAdmission::Durable(DurableReviewReceipt {
                    sequence: sequence.to_string(),
                    receipt,
                    duplicate: true,
                }))
            }
            Preparation::Prepared(prepared) => {
                if self.review_state()?.session.has_segmented_history() {
                    prepared.segmented_checkpoint_json()?;
                } else {
                    prepared.checkpoint_json()?;
                }
                let receipt = prepared.receipt().clone();
                let sequence = self.log.append(Event::CommitReviewV1 {
                    source: source.clone(),
                    frame: frame.into(),
                    receipt: receipt.clone(),
                })?;
                let result = self.replica.commit_review_batch(
                    &mut self.review.as_mut().ok_or(Error::NeedsRecovery)?.session,
                    *prepared,
                );
                if let Err(error) = result {
                    self.log.invalidate();
                    return Err(error.into());
                }
                self.remember_review(sequence, source, frame.into(), receipt)
                    .map(ReviewAdmission::Durable)
            }
        }
    }
}
