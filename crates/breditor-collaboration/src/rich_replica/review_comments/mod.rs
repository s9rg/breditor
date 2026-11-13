//! Document-bound comment admission; metadata never acquires a second document or selection owner.
mod commit_review_batch;
mod continue_read_only_review_history;
mod continue_review_history;
mod create_review_session;
mod dispatch_review;
mod enable_observer_review_segmented_history;
mod enable_read_only_review_segmented_history;
mod enable_review_segmented_history;
mod prepare_review_batch;
mod receive_review;
mod reconcile_retained_native_branch;
mod redo_review;
mod restore_continued_review;
mod restore_review;
mod restore_segmented_review;
mod review_view;
mod seal_observer_review_history_generation;
mod seal_read_only_review_history_generation;
mod seal_review_history_generation;
mod undo_review;

use super::{ReviewAnchorResolution, RichReplica};
use crate::Error;
use breditor_core::rich_content::review::{ReviewBinding, ReviewError, ReviewSession};
pub use prepare_review_batch::{DocumentReviewBatchPreparation, PreparedDocumentReviewBatch};
pub use reconcile_retained_native_branch::{
    RetainedNativeBranchBytes, RetainedNativeBranchOutcome, RetainedNativeBranchSource,
};
pub use review_view::{ResolvedReviewAnchor, ResolvedReviewThread, ResolvedReviewView};

impl RichReplica {
    fn review_binding(&self) -> ReviewBinding {
        ReviewBinding::new(self.document.id(), self.codec.schema().fingerprint())
    }
    fn check_review_session(&self, review: &ReviewSession) -> Result<(), Error> {
        if review.binding() != &self.review_binding() {
            return Err(Error::Contract("review document binding"));
        }
        for packet in review.anchor_packets() {
            self.resolve_review_anchor(packet)?;
        }
        Ok(())
    }
    fn validate_new_review_anchor(&self, input: &str) -> Result<(), Error> {
        if !matches!(self.resolve_review_anchor(input)?, ReviewAnchorResolution::Resolved { .. }) {
            return Err(Error::Contract("new review target is pending or orphaned"));
        }
        Ok(())
    }
    fn validate_remote_review_anchor(&self, input: &str) -> Result<(), ReviewError> {
        self.resolve_review_anchor(input)
            .map(|_| ())
            .map_err(|_| ReviewError::Contract("native document rejected review anchor"))
    }
}
