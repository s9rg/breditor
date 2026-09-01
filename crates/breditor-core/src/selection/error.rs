use thiserror::Error;

use crate::position::{NodePath, PointComparisonError, PointError};

/// One directional endpoint of a range selection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum RangeEndpoint {
    /// The endpoint from which the user extended the selection.
    Anchor,
    /// The actively extended endpoint.
    Focus,
}

/// Stable reason a structurally valid point is not a base-schema range endpoint.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum SelectionEndpointRule {
    /// A document-root child boundary is not an editable text position.
    RootBoundary,
    /// The point is not inside or on a schema text container.
    OutsideTextContainer,
}

/// Why a range selection is invalid in one editor snapshot.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum SelectionError {
    /// One endpoint is not a structurally valid point.
    #[error("{endpoint:?} is not a structurally valid point: {source}")]
    InvalidPoint {
        /// Failing endpoint.
        endpoint: RangeEndpoint,
        /// Structural point failure.
        source: PointError,
    },
    /// One endpoint violates the compiled schema's selection rule.
    #[error("{endpoint:?} at {path:?} is not allowed by range-selection rule {rule:?}")]
    EndpointNotAllowed {
        /// Failing endpoint.
        endpoint: RangeEndpoint,
        /// Point target path.
        path: NodePath,
        /// Stable rejection reason.
        rule: SelectionEndpointRule,
    },
    /// The two valid points could not be ordered in their document snapshot.
    #[error("range endpoints could not be ordered: {0}")]
    Comparison(#[from] PointComparisonError),
}
