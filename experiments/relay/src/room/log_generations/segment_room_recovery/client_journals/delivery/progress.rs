//! Check saved delivery progress against both native files and the original accepted relay cut.
use super::super::{
    paired::{Progress, RelayBinding, WriterTransport, check_endpoint, present, required_nullable},
    verify::position,
};
use crate::{
    Error, Receipt, RecoveryDocumentRegistration, RecoveryReviewRegistration, Result, Room,
    RoomParticipantInventoryMetadata,
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorPolicy, ReviewBatchReceipt, ReviewPrincipalId, ReviewSession,
    },
    rich_replica::RichReplica,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RelayProgress {
    pub binding: Binding,
    document: DocumentProgress,
    review: Progress,
    #[serde(deserialize_with = "required_nullable")]
    review_receipt: Option<ReviewReceipt>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Binding {
    pub document: DocumentBinding,
    review: RelayBinding,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in super::super) struct DocumentBinding {
    pub endpoint: String,
    pub room: String,
    pub principal: String,
    pub writer: String,
    #[serde(default, deserialize_with = "present")]
    writer_transport: Option<WriterTransport>,
}

impl DocumentBinding {
    pub fn atomic(&self) -> bool {
        self.writer_transport.is_some()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DocumentProgress {
    #[serde(deserialize_with = "required_nullable")]
    accepted: Option<crate::RecoveryDocumentClock>,
    #[serde(deserialize_with = "required_nullable")]
    receipt: Option<DocumentReceipt>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DocumentReceipt {
    sequence: String,
    receipt: Receipt,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReviewReceipt {
    sequence: String,
    receipt: ReviewBatchReceipt,
}

impl RelayProgress {
    pub fn check_binding(
        &self,
        inventory: &RoomParticipantInventoryMetadata,
        document: &RecoveryDocumentRegistration,
        review: &RecoveryReviewRegistration,
    ) -> Result<()> {
        let d = &self.binding.document;
        let r = &self.binding.review;
        let original =
            inventory.review.as_ref().ok_or(Error::Contract("delivery review log absent"))?;
        if d.room != inventory.room.document
            || d.writer != document.clock.writer
            || d.principal != document.principal
            || d.atomic() != (inventory.room.writer_transport_version == 2)
            || r.endpoint != d.endpoint
            || r.room != d.room
            || r.principal != d.principal
            || r.document_writer != d.writer
            || r.writer_transport.is_some() != d.atomic()
            || r.actor != review.clock.actor.as_str()
            || r.binding != original.binding
            || r.review_editing.is_some() != review.observer
        {
            return Err(Error::Contract("client delivery storage binding differs"));
        }
        check_endpoint(&d.endpoint)
    }

    pub fn check_progress(
        &self,
        room: &Room,
        document: &RichReplica,
        review: &ReviewSession,
        own: &RecoveryReviewRegistration,
    ) -> Result<()> {
        self.check_document_progress(room, document)?;
        self.review.check(room, review, own)?;
        if let Some(saved) = &self.review_receipt {
            self.check_review_receipt(room, review, own, saved)?;
        } else if self.review.sequence.is_some() {
            return Err(Error::Contract(
                "client delivery review acknowledgement lacks its receipt",
            ));
        }
        Ok(())
    }

    fn check_document_progress(&self, room: &Room, document: &RichReplica) -> Result<()> {
        let Some(accepted) = &self.document.accepted else {
            if self.document.receipt.is_some() {
                return Err(Error::Contract(
                    "client delivery document receipt lacks accepted clock",
                ));
            }
            return Ok(());
        };
        let read = if self.binding.document.atomic() {
            RichReplica::writer_clock_at_v2
        } else {
            RichReplica::writer_clock_at
        };
        if accepted.writer != document.writer()
            || read(document, &accepted.writer, &accepted.through)?.prefix_digest
                != accepted.prefix_digest
            || read(&room.replica, &accepted.writer, &accepted.through)?.prefix_digest
                != accepted.prefix_digest
        {
            return Err(Error::Contract("client delivery document acknowledgement differs"));
        }
        if let Some(saved) = &self.document.receipt {
            let receipt = &saved.receipt;
            let key = (receipt.writer.clone(), receipt.from.clone(), receipt.through.clone());
            if receipt.writer != accepted.writer
                || position(&receipt.through)? > position(&accepted.through)?
                || room
                    .receipts
                    .get(&key)
                    .is_none_or(|real| real.receipt != *receipt || real.sequence != saved.sequence)
            {
                return Err(Error::Contract("client delivery document receipt differs"));
            }
        }
        Ok(())
    }

    fn check_review_receipt(
        &self,
        room: &Room,
        local: &ReviewSession,
        own: &RecoveryReviewRegistration,
        saved: &ReviewReceipt,
    ) -> Result<()> {
        let accepted = self
            .review
            .accepted
            .as_ref()
            .ok_or(Error::Contract("client delivery review receipt lacks accepted clock"))?;
        let receipt = &saved.receipt;
        let first = position(&receipt.from)?
            .checked_sub(1)
            .ok_or(Error::Contract("client delivery review receipt start"))?;
        let end = position(&receipt.through)?;
        if receipt.actor != own.clock.actor
            || end > position(&accepted.through)?
            || self.review.sequence.as_ref().is_some_and(|sequence| {
                sequence != &saved.sequence || receipt.through != accepted.through
            })
            || room.recovery_review_acceptance_sequence(&receipt.actor, end)?
                != position(&saved.sequence)?
        {
            return Err(Error::Contract("client delivery review receipt differs"));
        }
        let frame = local.export_frame_through(first, end)?;
        let policy = ReviewActorPolicy {
            actor: own.clock.actor.clone(),
            principal: ReviewPrincipalId::try_new(&own.principal)?,
            access: ReviewAccess::ReadOnly,
        };
        if local.retained_batch_receipt(&local.observe(), &policy, &frame)? != *receipt {
            return Err(Error::Contract("client delivery review receipt differs"));
        }
        Ok(())
    }
}
