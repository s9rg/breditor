//! Stage document-bound comments for the host's append-before-publish transaction.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::{SharedObservation, WriterDependency};
use breditor_core::rich_content::review::{
    PreparedReviewBatch, ReviewActorPolicy, ReviewBatchPreparation, ReviewBatchReceipt,
    ReviewEventId, ReviewObservation,
};
use std::collections::BTreeMap;
/// Native metadata candidate bound to both exact document and review publications.
pub struct PreparedDocumentReviewBatch {
    pub(super) document: SharedObservation,
    pub(super) metadata: PreparedReviewBatch,
}
impl PreparedDocumentReviewBatch {
    /// Immutable canonical receipt; only the host's synced log can turn it into a durable acknowledgement.
    #[must_use]
    pub fn receipt(&self) -> &ReviewBatchReceipt {
        self.metadata.receipt()
    }
    /// Exact candidate metadata recovery; accepted document content is unchanged.
    /// # Errors
    /// Native serialization/budgets reject without publishing either owner.
    pub fn checkpoint_json(&self) -> Result<String, Error> {
        Ok(self.metadata.checkpoint_json()?)
    }
    /// Retain the exact candidate in the explicitly selected segmented comment family.
    /// # Errors
    /// An original candidate or native file/archive budgets reject without publication.
    pub fn segmented_checkpoint_json(&self) -> Result<String, Error> {
        Ok(self.metadata.segmented_checkpoint_json()?)
    }
}
/// Pure preparation result; no incomplete prefix is published or acknowledged.
pub enum DocumentReviewBatchPreparation {
    /// No input events; no durable acknowledgement is justified.
    Empty,
    /// Metadata dependencies must arrive before the original batch is retried.
    Pending(Vec<ReviewEventId>),
    /// Captured document dependencies must be accepted before the host acknowledges metadata.
    PendingDocument(Vec<WriterDependency>),
    /// Canonical input already exists; consult the host's original durable receipts.
    Duplicate(ReviewBatchReceipt),
    /// Admitted candidate for a serialized host durable transaction.
    Prepared(Box<PreparedDocumentReviewBatch>),
}
impl RichReplica {
    /// Prepare a single-actor review batch, admitting opaque cursors using this actual document engine.
    /// Pending/orphaned targets remain explicit; source roles and leases come from host authority.
    /// # Errors
    /// Exact guards, document/profile/engine, source, permission, fork and budget failures are pure.
    pub fn prepare_review_batch_guarded(
        &self,
        document: &SharedObservation,
        review: &ReviewSession,
        observed: &ReviewObservation,
        verified: &ReviewActorPolicy,
        frame: &str,
    ) -> Result<DocumentReviewBatchPreparation, Error> {
        self.check(document)?;
        self.check_review_session(review)?;
        let mut document_dependencies = BTreeMap::<u64, i32>::new();
        let mut validate = |packet: &str| {
            let dependencies = self.review_anchor_missing_dependencies(packet).map_err(|_| {
                super::ReviewError::Contract("native document rejected review anchor")
            })?;
            for dependency in dependencies {
                let writer = dependency
                    .writer
                    .parse::<u64>()
                    .map_err(|_| super::ReviewError::Contract("review document writer"))?;
                let counter = dependency
                    .counter
                    .parse::<i32>()
                    .map_err(|_| super::ReviewError::Contract("review document counter"))?;
                document_dependencies
                    .entry(writer)
                    .and_modify(|known| *known = (*known).max(counter))
                    .or_insert(counter);
            }
            self.validate_remote_review_anchor(packet)
        };
        for packet in review.anchor_packets() {
            validate(packet)?;
        }
        let preparation = review.prepare_authorized_batch(observed, verified, frame, validate)?;
        if !document_dependencies.is_empty() {
            return Ok(DocumentReviewBatchPreparation::PendingDocument(
                document_dependencies
                    .into_iter()
                    .map(|(writer, counter)| WriterDependency {
                        writer: writer.to_string(),
                        counter: counter.to_string(),
                    })
                    .collect(),
            ));
        }
        Ok(match preparation {
            ReviewBatchPreparation::Empty => DocumentReviewBatchPreparation::Empty,
            ReviewBatchPreparation::Pending(missing) => {
                DocumentReviewBatchPreparation::Pending(missing)
            }
            ReviewBatchPreparation::Duplicate(receipt) => {
                DocumentReviewBatchPreparation::Duplicate(receipt)
            }
            ReviewBatchPreparation::Prepared(metadata) => {
                DocumentReviewBatchPreparation::Prepared(Box::new(PreparedDocumentReviewBatch {
                    document: document.clone(),
                    metadata: *metadata,
                }))
            }
        })
    }
}
