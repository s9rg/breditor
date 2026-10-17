//! A reply retains its own author and survives Undo of another author's initial comment.
use super::super::ReviewThreadId;
use serde::{Deserialize, Serialize};
/// Append one plain attributed reply to an observed thread birth.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplyToReviewThread {
    /// Previously observed immutable discussion identity.
    pub thread: ReviewThreadId,
    /// Plain reply text.
    pub body: String,
}
