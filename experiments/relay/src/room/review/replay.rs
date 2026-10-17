//! Semantic recovery rederives the original source grant at each durable record's order.
use super::{ReviewWriter, Room};
use crate::{Error, Result, log::Event};
use breditor_collab_feasibility::rich_replica::DocumentReviewBatchPreparation;

impl Room {
    pub(in crate::room) fn replay_review(&mut self, sequence: u64, event: Event) -> Result<()> {
        match event {
            Event::EnableReviewV1 { actor, binding } => {
                if actor != self.owner || self.review.is_some() {
                    return Err(Error::Contract("review activation lineage"));
                }
                self.review = Some(self.new_review_state(&binding, sequence)?);
            }
            Event::GrantReviewV1 { actor, principal, role } => {
                self.check_review_grant(&actor, &principal, role)?;
                self.apply_review_grant(principal, role)?;
            }
            Event::RegisterReviewV1 { principal, actor, resume_hash } => {
                self.check_review_registration(&principal, &actor)?;
                self.review_state_mut()?
                    .writers
                    .insert(actor, ReviewWriter { principal, resume_hash, observer: false });
            }
            Event::RegisterReviewObserverV1 { principal, actor, resume_hash } => {
                self.check_review_actor_available(&principal, &actor)?;
                self.review_state_mut()?
                    .writers
                    .insert(actor, ReviewWriter { principal, resume_hash, observer: true });
            }
            Event::CommitReviewV1 { source, frame, receipt } => {
                let verified = self.review_source(source.principal.as_str(), &source.actor)?;
                if verified != source {
                    return Err(Error::Contract("historical review grant differs"));
                }
                let DocumentReviewBatchPreparation::Prepared(prepared) =
                    self.prepare_review(&verified, &frame)?
                else {
                    return Err(Error::Contract("durable review batch did not prepare"));
                };
                if prepared.receipt() != &receipt {
                    return Err(Error::Contract("durable review receipt differs"));
                }
                self.replica.commit_review_batch(
                    &mut self.review.as_mut().ok_or(Error::NeedsRecovery)?.session,
                    *prepared,
                )?;
                self.remember_review(sequence, source, frame, receipt)?;
            }
            _ => return Err(Error::Contract("unexpected review replay record")),
        }
        Ok(())
    }
}
