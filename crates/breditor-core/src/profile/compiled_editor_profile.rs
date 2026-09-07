use std::fmt;

use crate::{
    action::{ActionRegistry, ActionStateCatalog, routing::IntentRouter},
    extension::ExtensionSet,
    schema::{CompiledSchema, SchemaId},
};

use super::{CompiledProfileGeneration, ProfileCompilationError, compiler};

/// One immutable, all-or-nothing compiled editor semantic profile.
///
/// The profile owns the exact resolved manifest set, sealed schema, generated
/// action and intent graph, observable state catalog, and process-local
/// generation created by one compilation. Its components cannot be replaced or
/// assembled independently through this API.
#[derive(Clone)]
pub struct CompiledEditorProfile {
    extensions: ExtensionSet,
    schema: CompiledSchema,
    router: IntentRouter,
    action_states: ActionStateCatalog,
    generation: CompiledProfileGeneration,
}

impl CompiledEditorProfile {
    /// Compiles one sealed base-text editor profile from a resolved extension set.
    ///
    /// Every inline-format toggle declaration becomes one Rust-owned generic
    /// action, one tracked no-input semantic intent, one priority-zero blocking
    /// route, and one routed no-input observable state. The complete base action
    /// set and the existing Bold, Undo, and Redo state entries are retained.
    ///
    /// # Errors
    ///
    /// Returns [`ProfileCompilationError`] for aggregate overflow, an invalid
    /// schema projection, ownership or reserved-namespace violations, or a
    /// failure while freezing the generated registries. No partial profile is
    /// returned.
    pub fn try_compile_base_text_profile(
        schema_id: SchemaId,
        extensions: ExtensionSet,
    ) -> Result<Self, ProfileCompilationError> {
        compiler::compile_base_text_profile(schema_id, extensions)
    }

    pub(super) fn from_compilation(
        extensions: ExtensionSet,
        schema: CompiledSchema,
        router: IntentRouter,
        action_states: ActionStateCatalog,
    ) -> Self {
        Self {
            extensions,
            schema,
            router,
            action_states,
            generation: CompiledProfileGeneration::fresh(),
        }
    }

    /// Returns the complete resolved extension set used for compilation.
    #[must_use]
    pub const fn extensions(&self) -> &ExtensionSet {
        &self.extensions
    }

    /// Returns the sealed compiled document schema.
    #[must_use]
    pub const fn schema(&self) -> &CompiledSchema {
        &self.schema
    }

    /// Returns the complete frozen action registry used by this profile.
    #[must_use]
    pub fn action_registry(&self) -> &ActionRegistry {
        self.router.action_registry()
    }

    /// Returns the complete frozen semantic intent router.
    #[must_use]
    pub const fn intent_router(&self) -> &IntentRouter {
        &self.router
    }

    /// Returns the complete frozen observable action-state catalog.
    #[must_use]
    pub const fn action_state_catalog(&self) -> &ActionStateCatalog {
        &self.action_states
    }

    /// Returns this profile container's opaque process-local generation.
    #[must_use]
    pub const fn generation(&self) -> &CompiledProfileGeneration {
        &self.generation
    }
}

impl fmt::Debug for CompiledEditorProfile {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CompiledEditorProfile")
            .field("schema", &self.schema)
            .field("extensions", &self.extensions)
            .field("action_count", &self.action_registry().len())
            .field("intent_count", &self.router.intent_count())
            .field("action_state_count", &self.action_states.len())
            .field("generation", &self.generation)
            .finish_non_exhaustive()
    }
}
