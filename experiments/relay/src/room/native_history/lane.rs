//! The document receiver and comment receiver retain separate native history families.
use serde::{Deserialize, Serialize};

/// Explicit native retention lane. This is not a document grammar or writer transport selector.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerNativeHistoryLane {
    /// Accepted document receiver and, when enabled, the private suggestion-effect author.
    Document,
    /// Read-only server comment receiver, never an authenticated client actor.
    Review,
}
