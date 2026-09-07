use thiserror::Error;

use crate::{
    action::{
        ActionId, ActionRegistryError, ActionStateCatalogError, ActionStateId,
        routing::{BindingId, IntentId, IntentRouterError},
    },
    extension::ExtensionId,
    identity::QualifiedName,
    schema::SchemaCompilationError,
};

/// Why a complete immutable editor profile could not be compiled.
///
/// Declaration validation uses canonical identity order within each fixed
/// phase, so manifest or declaration input order cannot select the diagnostic.
/// Underlying schema, registry, router, and catalog construction errors contain
/// only bounded declarative identities and contracts and are retained exactly.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum ProfileCompilationError {
    /// The aggregate generated inline-format toggle count exceeds its ceiling.
    #[error("profile has {actual} inline-format toggles; the maximum is {maximum}")]
    TooManyInlineFormatToggles {
        /// Rejected fixed-width aggregate count.
        actual: u32,
        /// Fixed aggregate toggle ceiling.
        maximum: u32,
    },
    /// A toggle did not target an inline format declared by its own manifest.
    #[error("extension {owner} does not own inline-format toggle target {format_kind}")]
    InlineFormatToggleTargetNotOwned {
        /// Manifest that owns the invalid toggle declaration.
        owner: ExtensionId,
        /// Target format kind absent from that manifest's declarations.
        format_kind: QualifiedName,
    },
    /// Two extension manifests claimed one generated action identity.
    #[error(
        "inline-format toggle action {action_id} is owned by both {first_owner} and {second_owner}"
    )]
    DuplicateActionId {
        /// Duplicated action identity.
        action_id: ActionId,
        /// Lexically first exact owning extension identity.
        first_owner: ExtensionId,
        /// Lexically second exact owning extension identity.
        second_owner: ExtensionId,
    },
    /// Two extension manifests claimed one semantic intent identity.
    #[error(
        "inline-format toggle intent {intent_id} is owned by both {first_owner} and {second_owner}"
    )]
    DuplicateIntentId {
        /// Duplicated semantic intent identity.
        intent_id: IntentId,
        /// Lexically first exact owning extension identity.
        first_owner: ExtensionId,
        /// Lexically second exact owning extension identity.
        second_owner: ExtensionId,
    },
    /// Two extension manifests claimed one intent-binding identity.
    #[error(
        "inline-format toggle binding {binding_id} is owned by both {first_owner} and {second_owner}"
    )]
    DuplicateBindingId {
        /// Duplicated intent-binding identity.
        binding_id: BindingId,
        /// Lexically first exact owning extension identity.
        first_owner: ExtensionId,
        /// Lexically second exact owning extension identity.
        second_owner: ExtensionId,
    },
    /// Two extension manifests claimed one observable action-state identity.
    #[error(
        "inline-format toggle action state {action_state_id} is owned by both {first_owner} and {second_owner}"
    )]
    DuplicateActionStateId {
        /// Duplicated observable action-state identity.
        action_state_id: ActionStateId,
        /// Lexically first exact owning extension identity.
        first_owner: ExtensionId,
        /// Lexically second exact owning extension identity.
        second_owner: ExtensionId,
    },
    /// An extension action attempted to use the core-owned namespace.
    #[error(
        "inline-format toggle action {action_id} uses the reserved Breditor namespace, not {owner}"
    )]
    ReservedActionId {
        /// Rejected action identity.
        action_id: ActionId,
        /// Manifest that attempted to claim it.
        owner: ExtensionId,
    },
    /// An extension intent attempted to use the core-owned namespace.
    #[error(
        "inline-format toggle intent {intent_id} uses the reserved Breditor namespace, not {owner}"
    )]
    ReservedIntentId {
        /// Rejected semantic intent identity.
        intent_id: IntentId,
        /// Manifest that attempted to claim it.
        owner: ExtensionId,
    },
    /// An extension binding attempted to use the core-owned namespace.
    #[error(
        "inline-format toggle binding {binding_id} uses the reserved Breditor namespace, not {owner}"
    )]
    ReservedBindingId {
        /// Rejected binding identity.
        binding_id: BindingId,
        /// Manifest that attempted to claim it.
        owner: ExtensionId,
    },
    /// An extension action-state entry attempted to use the core-owned namespace.
    #[error(
        "inline-format toggle action state {action_state_id} uses the reserved Breditor namespace, not {owner}"
    )]
    ReservedActionStateId {
        /// Rejected observable action-state identity.
        action_state_id: ActionStateId,
        /// Manifest that attempted to claim it.
        owner: ExtensionId,
    },
    /// The sealed document schema could not be compiled.
    #[error("profile schema compilation failed: {source}")]
    Schema {
        /// Exact safe schema-compilation diagnostic.
        #[source]
        source: SchemaCompilationError,
    },
    /// The complete generated action registry could not be frozen.
    #[error("profile action registry compilation failed: {source}")]
    ActionRegistry {
        /// Exact safe registry-construction diagnostic.
        #[source]
        source: ActionRegistryError,
    },
    /// The complete semantic intent router could not be frozen.
    #[error("profile intent router compilation failed: {source}")]
    IntentRouter {
        /// Exact safe router-construction diagnostic.
        #[source]
        source: IntentRouterError,
    },
    /// The complete observable action-state catalog could not be frozen.
    #[error("profile action-state catalog compilation failed: {source}")]
    ActionStateCatalog {
        /// Exact safe catalog-construction diagnostic.
        #[source]
        source: ActionStateCatalogError,
    },
}

impl From<SchemaCompilationError> for ProfileCompilationError {
    fn from(source: SchemaCompilationError) -> Self {
        Self::Schema { source }
    }
}

impl From<ActionRegistryError> for ProfileCompilationError {
    fn from(source: ActionRegistryError) -> Self {
        Self::ActionRegistry { source }
    }
}

impl From<IntentRouterError> for ProfileCompilationError {
    fn from(source: IntentRouterError) -> Self {
        Self::IntentRouter { source }
    }
}

impl From<ActionStateCatalogError> for ProfileCompilationError {
    fn from(source: ActionStateCatalogError) -> Self {
        Self::ActionStateCatalog { source }
    }
}
