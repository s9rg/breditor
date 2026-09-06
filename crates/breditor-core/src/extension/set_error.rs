use thiserror::Error;

use crate::identity::QualifiedName;

use super::{ExtensionId, ExtensionVersion};

/// Why an immutable [`ExtensionSet`](super::ExtensionSet) could not be resolved.
///
/// Resolution uses fixed validation phases and canonical extension-ID order—
/// qualified-name ASCII bytes followed by numeric extension version—so caller
/// manifest order never selects the reported failure. These variants describe
/// manifest graph validity only; none reports behavior or persistence
/// compatibility.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum ExtensionSetError {
    /// The manifest collection exceeds the selected count bound.
    #[error("extension set has {actual} manifests; the maximum is {maximum}")]
    TooManyExtensions {
        /// Rejected fixed-width manifest count.
        actual: u32,
        /// Selected maximum manifest count.
        maximum: u32,
    },
    /// Two manifests claimed the same exact name and version.
    #[error("extension {id} is present more than once")]
    DuplicateExtensionId {
        /// Duplicated exact identity.
        id: ExtensionId,
    },
    /// Two different versions claimed one qualified extension name.
    #[error("extension name {name} is present at versions {first} and {second}")]
    MultipleVersionsForName {
        /// Qualified name claimed by both manifests.
        name: QualifiedName,
        /// Lower conflicting version.
        first: ExtensionVersion,
        /// Higher conflicting version.
        second: ExtensionVersion,
    },
    /// One manifest exceeds the selected per-manifest dependency bound.
    #[error("extension {extension} has {actual} dependencies; the maximum is {maximum}")]
    TooManyDependenciesForExtension {
        /// First over-limit extension by qualified-name ASCII bytes and then
        /// numeric extension version.
        extension: ExtensionId,
        /// Rejected fixed-width dependency count.
        actual: u32,
        /// Selected per-manifest maximum.
        maximum: u32,
    },
    /// One manifest exceeds the selected per-manifest conflict bound.
    #[error("extension {extension} has {actual} conflicts; the maximum is {maximum}")]
    TooManyConflictsForExtension {
        /// First over-limit extension by qualified-name ASCII bytes and then
        /// numeric extension version.
        extension: ExtensionId,
        /// Rejected fixed-width conflict count.
        actual: u32,
        /// Selected per-manifest maximum.
        maximum: u32,
    },
    /// The complete graph exceeds the selected aggregate dependency bound.
    #[error("extension set has {actual} dependency edges; the maximum is {maximum}")]
    TooManyDependencies {
        /// Rejected fixed-width aggregate dependency count.
        actual: u32,
        /// Selected aggregate maximum.
        maximum: u32,
    },
    /// The complete graph exceeds the selected aggregate conflict bound.
    #[error("extension set has {actual} conflict edges; the maximum is {maximum}")]
    TooManyConflicts {
        /// Rejected fixed-width aggregate conflict count.
        actual: u32,
        /// Selected aggregate maximum.
        maximum: u32,
    },
    /// No installed manifest has the required dependency name.
    #[error("extension {extension} requires missing exact dependency {dependency}")]
    MissingDependency {
        /// Extension declaring the requirement.
        extension: ExtensionId,
        /// Missing exact dependency.
        dependency: ExtensionId,
    },
    /// The dependency name exists, but only at another exact version.
    #[error(
        "extension {extension} requires exact dependency {dependency}, but {installed} is installed"
    )]
    DependencyVersionMismatch {
        /// Extension declaring the requirement.
        extension: ExtensionId,
        /// Required exact dependency.
        dependency: ExtensionId,
        /// Installed identity with the same qualified name.
        installed: ExtensionId,
    },
    /// An explicitly forbidden exact identity is installed.
    #[error("extension {extension} explicitly conflicts with installed extension {conflict}")]
    InstalledConflict {
        /// Extension declaring the conflict.
        extension: ExtensionId,
        /// Installed forbidden exact identity.
        conflict: ExtensionId,
    },
    /// Dependency edges cannot be placed in a complete topological order.
    #[error("extension dependency cycle blocks resolution of {blocked:?}")]
    DependencyCycle {
        /// Identities left blocked by one or more cycles, ordered by qualified-
        /// name ASCII bytes and then numeric extension version.
        ///
        /// This includes cycle members and may include extensions that depend
        /// transitively on a cycle.
        blocked: Box<[ExtensionId]>,
    },
}
