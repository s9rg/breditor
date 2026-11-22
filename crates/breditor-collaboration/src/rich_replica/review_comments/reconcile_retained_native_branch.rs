//! One native publication boundary across document and independently authorized comments.
use super::{Error, ReviewSession, RichReplica};
use crate::rich_replica::SharedObservation;
use breditor_core::rich_content::review::{
    ReviewActorPolicy, ReviewError, ReviewEventId, ReviewObservation, ReviewPrincipalId,
};

/// Actual native source borrows and exact live guards, never saved permission data.
#[derive(Clone, Copy)]
pub struct RetainedNativeBranchSource<'a> {
    /// Genuine same-writer document owner.
    pub document: &'a RichReplica,
    /// Exact source document publication.
    pub document_observed: &'a SharedObservation,
    /// Genuine independent same-actor metadata owner.
    pub review: &'a ReviewSession,
    /// Exact independent source review publication.
    pub review_observed: &'a ReviewObservation,
}
/// Canonical incoming obligations for one combined admission ceiling.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RetainedNativeBranchBytes {
    /// Unique original document input bytes not retained verbatim.
    pub document: usize,
    /// Canonical missing comment event bytes.
    pub review: usize,
    /// Checked sum of both independent obligations.
    pub total: usize,
}
/// Committed native lane changes, not a durable save, ACK or serving grant.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RetainedNativeBranchOutcome {
    /// Document input/history publication changed.
    pub document_changed: bool,
    /// Independent peer comment events were published.
    pub review_changed: bool,
}
impl RichReplica {
    /// Count both lanes before staging or invoking an authorization callback.
    /// # Errors
    /// Stale/foreign guards, identities, native forks, own-history suffixes or overflow refuse.
    pub fn retained_native_branch_input_bytes_guarded(
        &self,
        observed: &SharedObservation,
        review: &ReviewSession,
        review_observed: &ReviewObservation,
        source: RetainedNativeBranchSource<'_>,
    ) -> Result<RetainedNativeBranchBytes, Error> {
        self.check(observed)?;
        source.document.check(source.document_observed)?;
        self.check_review_session(review)?;
        source.document.check_review_session(source.review)?;
        let document = self.retained_branch_input_bytes_guarded(
            observed,
            source.document,
            source.document_observed,
        )?;
        let review = review.retained_branch_input_bytes_guarded(
            review_observed,
            source.review,
            source.review_observed,
        )?;
        let total = document
            .checked_add(review)
            .ok_or(Error::Limit("retained native branch incoming bytes"))?;
        Ok(RetainedNativeBranchBytes { document, review, total })
    }
    /// Separate document-contribution AND compatible review-event coverage. The
    /// old exact recovery-origin and paired-origin methods retain their meanings.
    /// # Errors
    /// Either native coverage failure or an invalid document-bound anchor refuses purely.
    pub fn verify_retained_native_union_guarded(
        &self,
        observed: &SharedObservation,
        review: &ReviewSession,
        review_observed: &ReviewObservation,
        source: RetainedNativeBranchSource<'_>,
    ) -> Result<(), Error> {
        self.check_review_session(review)?;
        source.document.check_review_session(source.review)?;
        self.verify_retained_branch_guarded(observed, source.document, source.document_observed)?;
        review.verify_retained_branch_guarded(
            review_observed,
            source.review,
            source.review_observed,
        )?;
        Ok(())
    }
    /// Stage both complete native lanes before either real owner changes. Each
    /// newly admitted peer event requires an externally authenticated ORIGINAL role
    /// grant; no source checkpoint or actor label can manufacture it. Unknown own
    /// contributions refuse. Local document/comment Undo/Redo, access and immutable
    /// files remain under the actual current owners. This changes no packet store,
    /// provider, account binding, save acknowledgement or serving authority.
    /// # Errors
    /// Any guard, history, binding, fork, byte ceiling, role, anchor or native
    /// adoption failure leaves BOTH original target owners and source owners intact.
    pub fn reconcile_retained_native_branch_guarded(
        &mut self,
        observed: &SharedObservation,
        review: &mut ReviewSession,
        review_observed: &ReviewObservation,
        source: RetainedNativeBranchSource<'_>,
        maximum_incoming_bytes: usize,
        authorize: impl FnMut(
            &ReviewEventId,
            &ReviewPrincipalId,
        ) -> Result<ReviewActorPolicy, ReviewError>,
    ) -> Result<RetainedNativeBranchOutcome, Error> {
        let bytes = self.retained_native_branch_input_bytes_guarded(
            observed,
            review,
            review_observed,
            source,
        )?;
        if bytes.total > maximum_incoming_bytes {
            return Err(Error::Limit("retained native branch incoming bytes"));
        }
        let mut candidate = self.staged()?;
        let document_changed = candidate.reconcile_retained_branch_guarded(
            &candidate.observe()?,
            source.document,
            source.document_observed,
            maximum_incoming_bytes,
        )?;
        let prepared = review.prepare_retained_branch_guarded(
            review_observed,
            source.review,
            source.review_observed,
            maximum_incoming_bytes - bytes.document,
            authorize,
            |anchor| candidate.validate_remote_review_anchor(anchor),
        )?;
        // The metadata owner checks its exact guards BEFORE the fallible document
        // adoption. Its exclusive Rust borrow cannot be changed by this closure.
        // After document success, metadata adoption is callback-free and infallible.
        let ((), review_changed) =
            review.commit_retained_branch_with(review_observed, prepared, || {
                if document_changed {
                    self.adopt_incoming(candidate)?;
                }
                Ok::<(), Error>(())
            })?;
        Ok(RetainedNativeBranchOutcome { document_changed, review_changed })
    }
}
