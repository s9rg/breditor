use thiserror::Error;

use super::ExtensionId;

/// Why one behavior-free extension manifest could not be constructed.
///
/// Construction validates fixed resource ceilings and canonical relation sets
/// in deterministic phases. Caller relation order never selects which identity
/// appears in a duplicate, self-reference, or overlap diagnostic.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum ExtensionManifestError {
    /// The dependency list exceeds its fixed implementation ceiling.
    #[error("extension {extension} has {actual} dependencies; the maximum is {maximum}")]
    TooManyDependencies {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// Rejected fixed-width dependency count.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
    /// The conflict list exceeds its fixed implementation ceiling.
    #[error("extension {extension} has {actual} conflicts; the maximum is {maximum}")]
    TooManyConflicts {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// Rejected fixed-width conflict count.
        actual: u32,
        /// Fixed implementation ceiling.
        maximum: u32,
    },
    /// One exact dependency occurs more than once.
    #[error("extension {extension} declares dependency {dependency} more than once")]
    DuplicateDependency {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated dependency by qualified-name ASCII bytes and then
        /// numeric extension version.
        dependency: ExtensionId,
    },
    /// One exact conflict occurs more than once.
    #[error("extension {extension} declares conflict {conflict} more than once")]
    DuplicateConflict {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated conflict by qualified-name ASCII bytes and then
        /// numeric extension version.
        conflict: ExtensionId,
    },
    /// A manifest depends on its own exact identity.
    #[error("extension {extension} cannot depend on itself")]
    SelfDependency {
        /// Self-referencing extension identity.
        extension: ExtensionId,
    },
    /// A manifest conflicts with its own exact identity.
    #[error("extension {extension} cannot conflict with itself")]
    SelfConflict {
        /// Self-conflicting extension identity.
        extension: ExtensionId,
    },
    /// The same exact identity is both required and forbidden.
    #[error("extension {extension} both depends on and conflicts with {related}")]
    DependencyConflict {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First shared identity by qualified-name ASCII bytes and then numeric
        /// extension version.
        related: ExtensionId,
    },
}
