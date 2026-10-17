//! Durable review targets have strict orphan laws, independent of ephemeral caret relocation.
mod capture_review_anchor;
mod check_source_cut;
mod historical_document;
mod missing_review_dependencies;
mod packet;
mod read_review_quote;
mod resolve_review_anchor;
pub(super) use check_source_cut::check_source_cut;

pub use read_review_quote::{ReviewAnchorQuote, ReviewQuoteLoss};

use super::selection::Selection;
use serde::{Deserialize, Serialize};

/// An explicit discussion target; capturing it does not select it in the editor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "selection", rename_all = "snake_case", deny_unknown_fields)]
pub enum ReviewAnchorTarget {
    /// A discussion about the document, independent of its current root children.
    Document,
    /// Native directional text, node or source-cell grid target.
    Selection(Selection),
}

/// Why the original review target cannot safely remain attached.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewAnchorLoss {
    /// The original owner or boundary axis is no longer present.
    TargetDeleted,
    /// The retained table currently has no visible axes.
    HiddenTable,
    /// A formerly nonempty text range no longer encloses content.
    RangeCollapsed,
    /// A retained target no longer supports its captured selection kind.
    TargetKindChanged,
}

/// Pure current-document resolution of a durable opaque review anchor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewAnchorResolution {
    /// Captured dependencies are applied and the original target remains usable.
    Resolved {
        /// Current admitted coordinates, never a guessed neighboring target.
        target: ReviewAnchorTarget,
    },
    /// Required document operations have not arrived yet; retain the anchor unchanged.
    Pending,
    /// Retain the discussion and its original anchor without attaching it elsewhere.
    Orphaned {
        /// Machine-readable reason for the review UI.
        reason: ReviewAnchorLoss,
    },
}
