//! Reanchoring is explicit and attributed; orphaned discussions never silently jump to a neighbor.
use super::super::ReviewThreadId;
use serde::{Deserialize, Serialize};
/// Replace observed native anchors, retaining concurrent replacements as distinct heads.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ReanchorReviewThread {
    /// Observed thread whose creator or moderator authorizes the move.
    pub thread: ReviewThreadId,
    /// Newly captured native anchor; the native owner must validate its target before admission.
    pub anchor_json: String,
}
