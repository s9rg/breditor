use thiserror::Error;

use crate::{
    action::{ActionId, ActionStateId, routing::BindingId, routing::IntentId},
    identity::QualifiedName,
};

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
    /// The inline-format declaration list exceeds its fixed ceiling.
    #[error("extension {extension} has {actual} inline formats; the maximum is {maximum}")]
    TooManyInlineFormats {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// Rejected fixed-width inline-format count.
        actual: u32,
        /// Fixed per-manifest declaration ceiling.
        maximum: u32,
    },
    /// The inline-format toggle declaration list exceeds its fixed ceiling.
    #[error("extension {extension} has {actual} inline-format toggles; the maximum is {maximum}")]
    TooManyInlineFormatToggles {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// Rejected fixed-width inline-format toggle count.
        actual: u32,
        /// Fixed per-manifest declaration ceiling.
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
    /// One inline-format kind occurs more than once in this manifest.
    #[error("extension {extension} declares inline-format kind {kind} more than once")]
    DuplicateInlineFormat {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated format kind in canonical lexical order.
        kind: QualifiedName,
    },
    /// More than one toggle targets the same inline-format kind.
    #[error("extension {extension} declares an inline-format toggle for {kind} more than once")]
    DuplicateInlineFormatToggleTarget {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated target kind in canonical lexical order.
        kind: QualifiedName,
    },
    /// More than one inline-format toggle uses the same action identity.
    #[error(
        "extension {extension} declares inline-format toggle action {action_id} more than once"
    )]
    DuplicateInlineFormatToggleActionId {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated action identity in canonical lexical order.
        action_id: ActionId,
    },
    /// More than one inline-format toggle uses the same intent identity.
    #[error(
        "extension {extension} declares inline-format toggle intent {intent_id} more than once"
    )]
    DuplicateInlineFormatToggleIntentId {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated intent identity in canonical lexical order.
        intent_id: IntentId,
    },
    /// More than one inline-format toggle uses the same binding identity.
    #[error(
        "extension {extension} declares inline-format toggle binding {binding_id} more than once"
    )]
    DuplicateInlineFormatToggleBindingId {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated binding identity in canonical lexical order.
        binding_id: BindingId,
    },
    /// More than one inline-format toggle uses the same action-state identity.
    #[error(
        "extension {extension} declares inline-format toggle action state {action_state_id} more than once"
    )]
    DuplicateInlineFormatToggleActionStateId {
        /// Extension whose manifest was rejected.
        extension: ExtensionId,
        /// First duplicated action-state identity in canonical lexical order.
        action_state_id: ActionStateId,
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
