//! Exact-owner composition: fallible document commit precedes infallible metadata adoption.
use super::{
    super::{ReviewError, ReviewObservation, ReviewSession},
    PreparedReviewBranch,
};
impl ReviewSession {
    /// Check both exact review guards, run one fallible independently staged commit,
    /// then adopt this prepared review candidate without callbacks or another await.
    /// Rust's exclusive borrow prevents the callback from changing this review owner.
    /// The other commit must itself be atomic on failure; arbitrary host side effects
    /// are not rolled back. An error changes neither review state nor its token.
    /// # Errors
    /// A stale/foreign prepared owner or an error from the other atomic commit refuses.
    pub fn commit_retained_branch_with<T, E: From<ReviewError>>(
        &mut self,
        observed: &ReviewObservation,
        prepared: PreparedReviewBranch,
        commit_other: impl FnOnce() -> Result<T, E>,
    ) -> Result<(T, bool), E> {
        self.check(observed)?;
        self.check(&prepared.source)?;
        let value = commit_other()?;
        let changed = prepared.candidate.is_some();
        if let Some(candidate) = prepared.candidate {
            self.adopt(candidate);
        }
        Ok((value, changed))
    }
    /// Commit an already admitted exact-owner review-only candidate.
    /// # Errors
    /// A stale observation or candidate from another owner refuses before mutation.
    pub fn commit_retained_branch_guarded(
        &mut self,
        observed: &ReviewObservation,
        prepared: PreparedReviewBranch,
    ) -> Result<bool, ReviewError> {
        self.commit_retained_branch_with(observed, prepared, || Ok::<(), ReviewError>(()))
            .map(|((), changed)| changed)
    }
}
