//! Final host publication checks both sources; never acknowledge before durable append succeeds.
use super::{Error, PreparedDocumentReviewBatch, ReviewSession, RichReplica};
use breditor_core::rich_content::review::ReviewBatchReceipt;
impl RichReplica {
    /// Publish an admitted review candidate after the host durably accepts it under serialized rights/leases.
    /// # Errors
    /// A changed/foreign document or review observation rejects without replacing either owner.
    pub fn commit_review_batch(
        &self,
        review: &mut ReviewSession,
        prepared: PreparedDocumentReviewBatch,
    ) -> Result<ReviewBatchReceipt, Error> {
        self.check(&prepared.document)?;
        self.check_review_session(review)?;
        Ok(review.commit_prepared_batch(prepared.metadata)?)
    }
}
