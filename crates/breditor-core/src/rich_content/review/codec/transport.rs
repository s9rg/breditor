//! Native preparation allows a host to fsync acceptance before publishing metadata or acknowledging.
use super::{
    Frame, ReviewActorPolicy, ReviewError, ReviewImportOutcome, ReviewObservation, ReviewSession,
    event,
};
use crate::rich_content::review::{ReviewActorId, ReviewEventId, ReviewPrincipalId};
use serde::{Deserialize, Serialize};

/// Exact canonical metadata prefix. A hash is a lineage witness, not account authentication.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ReviewWriterClock {
    /// Exclusively owned review actor, not a document writer or principal.
    pub actor: ReviewActorId,
    /// Inclusive last event counter; zero means this bound actor's empty stream.
    pub through: String,
    /// Native prefix digest, including actor/principal/document binding at genesis.
    pub prefix_digest: String,
}
/// Canonical admitted input batch, independent of JSON formatting and server connection fences.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ReviewBatchReceipt {
    /// One host-authenticated source actor.
    pub actor: ReviewActorId,
    /// Inclusive first supplied event counter. Unlike document operation windows, review events start at one.
    pub from: String,
    /// Inclusive last supplied event counter, not the server's newer unrelated progress.
    pub through: String,
    /// Native actor prefix through that last supplied event.
    pub prefix_digest: String,
    /// Domain-separated canonical input events; outer JSON whitespace/key order is immaterial.
    pub batch_digest: String,
}
/// Exact native staged metadata candidate. It cannot be constructed, serialized or used by another owner.
pub struct PreparedReviewBatch {
    source: ReviewObservation,
    candidate: ReviewSession,
    receipt: ReviewBatchReceipt,
}
impl PreparedReviewBatch {
    /// Frozen native receipt. A host may acknowledge it only after its own durable append succeeds.
    #[must_use]
    pub const fn receipt(&self) -> &ReviewBatchReceipt {
        &self.receipt
    }
    /// Exact candidate recovery before publication, for host persistence/qualification.
    /// # Errors
    /// The native unchanged checkpoint budget or serialization can reject without publication.
    pub fn checkpoint_json(&self) -> Result<String, ReviewError> {
        self.candidate.checkpoint_json()
    }
    /// Retain the exact candidate under the explicitly selected segmented family.
    /// # Errors
    /// Original-family candidates or the native generation/file budgets reject.
    pub fn segmented_checkpoint_json(&self) -> Result<String, ReviewError> {
        self.candidate.segmented_checkpoint_json()
    }
}
/// No accepted mutation occurs during preparation, including an incomplete batch.
pub enum ReviewBatchPreparation {
    /// Empty input authors nothing and cannot justify a durable acceptance record.
    Empty,
    /// The host/client retains and retries the unacknowledged input after dependencies arrive.
    Pending(Vec<ReviewEventId>),
    /// All canonical input events were already retained; no second publication is needed.
    Duplicate(ReviewBatchReceipt),
    /// Fully admitted candidate, bound to the exact source owner/publication.
    Prepared(Box<PreparedReviewBatch>),
}
impl ReviewSession {
    /// Read the local writer's exact prefix without parsing recovery data in an adapter.
    /// # Errors
    /// An impossible retained stream rejects without changing metadata or policy.
    pub fn local_writer_clock(&self) -> Result<ReviewWriterClock, ReviewError> {
        self.writer_clock(&self.policy.actor, &self.policy.principal)
    }
    /// Prove the canonical batch was already retained. This is a lineage read, not source
    /// authentication or new document-anchor admission. Unknown events must arrive through
    /// the separately authenticated native receive path first; this never imports them.
    /// # Errors
    /// Stale/foreign guards, malformed input, forks, empty or unretained events reject purely.
    pub fn retained_batch_receipt(
        &self,
        observed: &ReviewObservation,
        verified: &ReviewActorPolicy,
        input: &str,
    ) -> Result<ReviewBatchReceipt, ReviewError> {
        match self.prepare_authorized_batch(observed, verified, input, |_| Ok(()))? {
            ReviewBatchPreparation::Duplicate(receipt) => Ok(receipt),
            _ => Err(ReviewError::Contract("review receipt requires retained events")),
        }
    }
    /// Read the exact admitted source prefix, with separately authenticated principal binding.
    /// # Errors
    /// A mismatched principal or impossible retained stream rejects; no role grant is inferred.
    pub fn writer_clock(
        &self,
        actor: &ReviewActorId,
        principal: &ReviewPrincipalId,
    ) -> Result<ReviewWriterClock, ReviewError> {
        let through = event::clock(&self.events).get(actor).map_or(0, |counter| counter.0);
        self.writer_clock_at(actor, principal, through)
    }
    /// Read a retained historical prefix, including zero/genesis, without rewinding live metadata.
    /// # Errors
    /// Wrong principal or a future/missing counter rejects without creating a substitute stream.
    pub fn writer_clock_at(
        &self,
        actor: &ReviewActorId,
        principal: &ReviewPrincipalId,
        through: u64,
    ) -> Result<ReviewWriterClock, ReviewError> {
        if (actor == &self.policy.actor && principal != &self.policy.principal)
            || self.events.iter().any(|e| &e.id.actor == actor && &e.principal != principal)
        {
            return Err(ReviewError::Permission);
        }
        let prefix_digest = if through == 0 {
            event::genesis(&self.binding, actor, principal)?
        } else {
            let event = self
                .events
                .iter()
                .find(|e| &e.id.actor == actor && e.id.counter.0 == through)
                .ok_or(ReviewError::Contract("unknown review prefix"))?;
            event::digest(event)?
        };
        Ok(ReviewWriterClock { actor: actor.clone(), through: through.to_string(), prefix_digest })
    }
    /// Prepare a strict contiguous single-actor batch under live, externally verified source rights.
    /// Native document adapters supply the read-only backend anchor validator. The source is unchanged
    /// until commit; permissions claimed by serialized event data are never admission authority.
    /// # Errors
    /// Exact guard, source binding, malformed/forked batches, roles, anchors and native limits reject.
    pub fn prepare_authorized_batch(
        &self,
        observed: &ReviewObservation,
        verified: &ReviewActorPolicy,
        input: &str,
        validate_anchor: impl FnMut(&str) -> Result<(), ReviewError>,
    ) -> Result<ReviewBatchPreparation, ReviewError> {
        self.check(observed)?;
        if input.len() > event::MAX_FRAME_BYTES {
            return Err(ReviewError::Limit("frame bytes"));
        }
        let frame: Frame = serde_json::from_str(input)?;
        if frame.format != "breditor/review-events"
            || frame.format_version != 1
            || frame.binding != self.binding
        {
            return Err(ReviewError::Contract("review frame binding"));
        }
        if frame.events.len() > 128 {
            return Err(ReviewError::Limit("frame events"));
        }
        let Some(first) = frame.events.first() else {
            return Ok(ReviewBatchPreparation::Empty);
        };
        let mut previous = None;
        for event in &frame.events {
            if event.id.actor != verified.actor || event.principal != verified.principal {
                return Err(ReviewError::Permission);
            }
            if previous
                .is_some_and(|counter: u64| counter.checked_add(1) != Some(event.id.counter.0))
            {
                return Err(ReviewError::Contract("contiguous review batch"));
            }
            previous = Some(event.id.counter.0);
        }
        let through = previous.ok_or(ReviewError::Contract("nonempty review batch"))?;
        let mut candidate = self.staged();
        let outcome = candidate.receive_authorized_with_anchor_validation(
            &candidate.observe(),
            verified,
            input,
            validate_anchor,
        )?;
        if let ReviewImportOutcome::Pending(missing) = outcome {
            return Ok(ReviewBatchPreparation::Pending(missing));
        }
        let receipt = ReviewBatchReceipt {
            actor: verified.actor.clone(),
            from: first.id.counter.0.to_string(),
            through: through.to_string(),
            prefix_digest: candidate
                .writer_clock_at(&verified.actor, &verified.principal, through)?
                .prefix_digest,
            batch_digest: event::hash(
                b"breditor/review-batch/1\0",
                &serde_json::to_vec(&frame.events)?,
            )?,
        };
        if outcome == ReviewImportOutcome::Unchanged {
            return Ok(ReviewBatchPreparation::Duplicate(receipt));
        }
        Ok(ReviewBatchPreparation::Prepared(Box::new(PreparedReviewBatch {
            source: observed.clone(),
            candidate,
            receipt,
        })))
    }
    /// Publish a prepared candidate only after the host's durable acceptance succeeds.
    /// The host must serialize current permission/lease checks with append and this commit.
    /// # Errors
    /// A foreign owner, policy change or any intervening publication rejects before replacement.
    pub fn commit_prepared_batch(
        &mut self,
        prepared: PreparedReviewBatch,
    ) -> Result<ReviewBatchReceipt, ReviewError> {
        self.check(&prepared.source)?;
        let PreparedReviewBatch { candidate, receipt, .. } = prepared;
        self.adopt(candidate);
        Ok(receipt)
    }
}
