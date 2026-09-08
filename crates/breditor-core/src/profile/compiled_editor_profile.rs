use std::{fmt, sync::Arc};

use crate::{
    action::{ActionRegistry, ActionStateCache, ActionStateCatalog, routing::IntentRouter},
    extension::ExtensionSet,
    schema::{CompiledSchema, DocumentLimits, SchemaId},
    state::EditorContext,
};

use super::{
    CompiledProfileDescriptor, CompiledProfileGeneration, ProfileCompilationError, compiler,
};

/// One immutable, all-or-nothing compiled editor semantic profile.
///
/// The profile owns the exact resolved manifest set, sealed schema, generated
/// action and intent graph, observable state catalog, and process-local
/// generation created by one compilation. Its components cannot be replaced or
/// assembled independently through this API. Clones share every catalog and
/// descriptor allocation, keeping guarded prepublication candidates constant-
/// time with respect to profile size.
#[derive(Clone)]
pub struct CompiledEditorProfile {
    extensions: ExtensionSet,
    schema: CompiledSchema,
    router: IntentRouter,
    action_states: ActionStateCatalog,
    descriptor: Arc<CompiledProfileDescriptor>,
}

impl CompiledEditorProfile {
    /// Compiles one sealed base-text editor profile from a resolved extension set.
    ///
    /// Every inline-format toggle declaration becomes one Rust-owned generic
    /// action, one tracked no-input semantic intent, one priority-zero blocking
    /// route, and one routed no-input observable state. The complete base action
    /// set, built-in strong-format intent route, and Bold, Undo, and Redo state
    /// entries are retained; Bold observes that built-in route.
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

    /// Compiles the exact trusted Breditor base profile.
    ///
    /// Unlike the extension-facing compiler, this factory is allowed to use
    /// the reserved `breditor/base` schema and core-owned identities. Every
    /// call creates a fresh process-local profile generation. The result also
    /// contains the tracked no-input `breditor/format-strong` intent and its
    /// priority-zero blocking route to `breditor/toggle-strong`.
    ///
    /// # Errors
    ///
    /// Returns [`ProfileCompilationError`] if the compiled-in action, routing,
    /// or observable-state declarations ever violate their frozen contracts.
    pub fn try_compile_breditor_base() -> Result<Self, ProfileCompilationError> {
        compiler::compile_breditor_base_profile()
    }

    pub(crate) fn from_compilation(
        extensions: ExtensionSet,
        schema: CompiledSchema,
        router: IntentRouter,
        action_states: ActionStateCatalog,
    ) -> Self {
        let generation = CompiledProfileGeneration::fresh();
        let descriptor = Arc::new(CompiledProfileDescriptor::from_compilation(
            &schema,
            &router,
            &action_states,
            generation,
        ));
        Self { extensions, schema, router, action_states, descriptor }
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

    /// Creates an execution context carrying this exact schema proof and
    /// process-local profile generation.
    #[must_use]
    pub fn editor_context(&self, limits: DocumentLimits) -> EditorContext {
        EditorContext::with_profile_generation(
            self.schema.clone(),
            limits,
            self.generation().clone(),
        )
    }

    /// Creates an empty action-state cache bound to this exact generation.
    #[must_use]
    pub fn action_state_cache(&self) -> ActionStateCache {
        ActionStateCache::with_profile_generation(
            self.action_states.clone(),
            self.generation().clone(),
        )
    }

    /// Returns the complete immutable owned profile descriptor.
    #[must_use]
    pub fn descriptor(&self) -> &CompiledProfileDescriptor {
        self.descriptor.as_ref()
    }

    /// Returns this profile container's opaque process-local generation.
    #[must_use]
    pub fn generation(&self) -> &CompiledProfileGeneration {
        self.descriptor.generation()
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
            .field("generation", self.generation())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::CompiledEditorProfile;

    #[test]
    fn clones_share_the_immutable_descriptor_allocation()
    -> Result<(), crate::profile::ProfileCompilationError> {
        let profile = CompiledEditorProfile::try_compile_breditor_base()?;
        let clone = profile.clone();

        assert!(Arc::ptr_eq(&profile.descriptor, &clone.descriptor));
        Ok(())
    }
}
