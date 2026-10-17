//! Creating a thread and its initial message is one independently undoable review contribution.
use serde::{Deserialize, Serialize};
/// A host/native-validated anchor and plain initial message; birth IDs come from the native event.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CreateReviewThread {
    /// Opaque durable native anchor, never numeric coordinates or an HTML selector.
    pub anchor_json: String,
    /// Plain user-authored message; no markup is executed.
    pub body: String,
}
