//! Resolve/reopen observes known decisions; concurrent opposing decisions remain a conflict.
use super::super::ReviewThreadId;
use serde::{Deserialize, Serialize};
/// One explicit resolution decision, separate from accepted document edits.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetReviewThreadState {
    /// Observed immutable thread identity.
    pub thread: ReviewThreadId,
    /// True resolves; false reopens all decisions this action observed.
    pub resolved: bool,
}
