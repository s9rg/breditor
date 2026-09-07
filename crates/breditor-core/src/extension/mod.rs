//! Deterministic data-only extension identity, dependency resolution, and
//! sealed inline-format and toggle declarations.
//!
//! An [`ExtensionSet`] contains bounded manifests, exact-version dependency
//! edges, explicit exact-version conflicts, and property-free
//! [`InlineFormatSpecV1`] values, and behavior-free
//! [`InlineFormatToggleSpecV1`] values. Resolution itself never compiles a
//! schema, installs an action, registers a renderer, executes extension code,
//! or mutates editor state. A resolved set can be supplied explicitly to the
//! sealed base-text schema compiler.
//!
//! Extension identity is also not persistence compatibility. An
//! [`ExtensionId`] is a developer-assigned name and version, not a fingerprint
//! of code, schema definitions, actions, or wire formats. A successfully
//! resolved set therefore cannot prove that a document, operation, checkpoint,
//! or replay log is compatible with any extension implementation.

mod id;
mod inline_format_spec_v1;
mod inline_format_toggle_spec_v1;
mod limits;
mod limits_error;
mod manifest;
mod manifest_error;
mod set;
mod set_error;
mod version;
mod version_error;

pub use id::ExtensionId;
pub use inline_format_spec_v1::InlineFormatSpecV1;
pub use inline_format_toggle_spec_v1::InlineFormatToggleSpecV1;
pub use limits::{
    ExtensionLimits, MAX_EXTENSION_CONFLICTS_PER_MANIFEST, MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
    MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST, MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST,
    MAX_EXTENSION_SET_CONFLICTS, MAX_EXTENSION_SET_DEPENDENCIES, MAX_EXTENSION_SET_ENTRIES,
};
pub use limits_error::ExtensionLimitsError;
pub use manifest::ExtensionManifest;
pub use manifest_error::ExtensionManifestError;
pub use set::ExtensionSet;
pub use set_error::ExtensionSetError;
pub use version::ExtensionVersion;
pub use version_error::ExtensionVersionError;
