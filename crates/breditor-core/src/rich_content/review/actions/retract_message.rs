//! Retraction is a reversible attributed value, not destructive discussion deletion.
use super::super::ReviewMessageId;
use serde::{Deserialize, Serialize};
/// Retract an observed message under author/moderator policy while preserving replies.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RetractReviewMessage {
    /// Immutable message birth identity.
    pub message: ReviewMessageId,
}
