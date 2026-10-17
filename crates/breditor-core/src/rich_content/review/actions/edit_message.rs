//! Message edits are causal register values, not overwrites of other offline versions.
use super::super::ReviewMessageId;
use serde::{Deserialize, Serialize};
/// Replace an observed message body under author/moderator authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditReviewMessage {
    /// Immutable initial-message or reply birth identity.
    pub message: ReviewMessageId,
    /// New plain body, retaining concurrent edits as distinct causal heads.
    pub body: String,
}
