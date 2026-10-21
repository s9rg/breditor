//! Closed durable lifecycle intent. IDs are opaque native inputs, not sortable server sequences.
use serde::{Deserialize, Serialize};

/// Explicit native retention intent. Identical retries acknowledge the original durable boundary.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ServerNativeHistoryBoundary {
    /// Select native generations once, retaining the exact original root.
    Enable {
        /// Opaque original-root generation, validated by the selected native lane.
        root: String,
        /// Distinct initial active generation, not a sortable server clock.
        active: String,
    },
    /// Close a nonempty native suffix and retain its exact immutable file.
    Seal {
        /// Lifetime-new active generation. An identical historical intent is an idempotent retry.
        next: String,
    },
}
