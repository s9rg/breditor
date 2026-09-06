use thiserror::Error;

/// Why caller-selected [`ExtensionLimits`](super::ExtensionLimits) are invalid.
///
/// A host may tighten any limit, including to zero, but cannot raise it above
/// the implementation ceiling represented in each stable error variant.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum ExtensionLimitsError {
    /// The requested manifest-count limit exceeds the implementation ceiling.
    #[error("extension count limit is {actual}; the maximum is {maximum}")]
    TooManyExtensions {
        /// Requested limit.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
    /// The requested per-manifest dependency limit exceeds the ceiling.
    #[error("per-manifest dependency limit is {actual}; the maximum is {maximum}")]
    TooManyDependenciesPerManifest {
        /// Requested limit.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
    /// The requested per-manifest conflict limit exceeds the ceiling.
    #[error("per-manifest conflict limit is {actual}; the maximum is {maximum}")]
    TooManyConflictsPerManifest {
        /// Requested limit.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
    /// The requested aggregate dependency limit exceeds the ceiling.
    #[error("aggregate extension dependency limit is {actual}; the maximum is {maximum}")]
    TooManyDependencies {
        /// Requested limit.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
    /// The requested aggregate conflict limit exceeds the ceiling.
    #[error("aggregate extension conflict limit is {actual}; the maximum is {maximum}")]
    TooManyConflicts {
        /// Requested limit.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
}
