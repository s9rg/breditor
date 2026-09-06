//! Deterministic, behavior-free extension identity and dependency resolution.
//!
//! An [`ExtensionSet`] contains only bounded manifests, exact-version dependency
//! edges, and explicit exact-version conflicts. Resolution never installs an
//! action, changes a document schema, registers a renderer, executes extension
//! code, or mutates editor state. Hosts may use the canonical order as input to
//! later compilation stages, but those stages are outside this module.
//!
//! Extension identity is also not persistence compatibility. An
//! [`ExtensionId`] is a developer-assigned name and version, not a fingerprint
//! of code, schema definitions, actions, or wire formats. A successfully
//! resolved set therefore cannot prove that a document, operation, checkpoint,
//! or replay log is compatible with any extension implementation.

mod id;
mod limits;
mod limits_error;
mod manifest;
mod manifest_error;
mod set;
mod set_error;
mod version;
mod version_error;

pub use id::ExtensionId;
pub use limits::{
    ExtensionLimits, MAX_EXTENSION_CONFLICTS_PER_MANIFEST, MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
    MAX_EXTENSION_SET_CONFLICTS, MAX_EXTENSION_SET_DEPENDENCIES, MAX_EXTENSION_SET_ENTRIES,
};
pub use limits_error::ExtensionLimitsError;
pub use manifest::ExtensionManifest;
pub use manifest_error::ExtensionManifestError;
pub use set::ExtensionSet;
pub use set_error::ExtensionSetError;
pub use version::ExtensionVersion;
pub use version_error::ExtensionVersionError;
