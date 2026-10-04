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
    /// Compiles an opt-in flat-list editor with bare paragraphs/headings and
    /// bullet/ordered lists whose items contain exactly one paragraph or heading.
    ///
    /// Typing, plain-text insertion, Enter, deletion and inline formatting use
    /// flat-list-aware actions. Existing Bold, Clear, paragraph/heading and
    /// extension intent identities are retained. Three additional tracked routes
    /// set bullets (`breditor/format-bullet-list`), set numbering starting at one
    /// (`breditor/format-ordered-list`) and lift selected items
    /// (`breditor/remove-list`). Matching marker families are active but blocked;
    /// removal is an explicit command, not a second-click toggle. Existing
    /// ordered starts are preserved, not restarted. Each route has a matching
    /// `breditor/control-...` state and priority-zero blocking binding.
    ///
    /// Fourteen built-in controls plus at most 255 combined extension controls
    /// fit the unchanged catalog ceiling. Nested lists, multi-block items and
    /// indent/outdent are not admitted. The profile does not change existing
    /// factories; hosts must explicitly select Session V6 for durable list edits.
    ///
    /// # Errors
    ///
    /// Returns [`ProfileCompilationError`] for invalid declarations, reserved or
    /// conflicting identities, resource limits, or invalid generated registries.
    /// Compilation publishes no partial schema, command graph or state catalog.
    #[cfg(feature = "experimental-structural-properties")]
    pub fn try_compile_flat_list_profile(
        schema_id: SchemaId,
        extensions: ExtensionSet,
    ) -> Result<Self, ProfileCompilationError> {
        super::flat_list_compiler::compile(schema_id, extensions)
    }

    /// Compiles an opt-in direct-root paragraph/heading editor profile.
    ///
    /// Registers heading-aware typing, normalized plain-text insertion, Enter,
    /// deletion and inline formatting under explicit text-block action IDs.
    /// Bold/Clear and extension formatting keep their semantic intent IDs, but
    /// route only to heading-capable handlers. Seven no-input block-kind routes
    /// (`breditor/format-paragraph`, `breditor/format-heading-1` through `-6`)
    /// expose tracked controls (`breditor/control-paragraph`,
    /// `breditor/control-heading-1` through `-6`). Each corresponds to a fixed
    /// `breditor/set-paragraph` or `breditor/set-heading-N` action and a
    /// `breditor/format-...-binding` binding. All routes block at priority zero.
    ///
    /// Eleven built-in controls fit under the unchanged 514-entry state ceiling.
    /// The existing schema limit of 255 extension format types is stricter:
    /// unique toggle/setter targets currently permit at most 255 combined
    /// extension controls (266 total). Schema-only formats also consume slots.
    /// The profile is feature-gated and is not selected by existing factories.
    /// Hosts must explicitly use V5 session admission for durable heading edits.
    ///
    /// # Errors
    ///
    /// Returns [`ProfileCompilationError`] for invalid schema/declarations,
    /// ownership or reserved identities, exceeded resource limits, or invalid
    /// generated registries. No partial schema/command/state graph is returned.
    #[cfg(feature = "experimental-structural-properties")]
    pub fn try_compile_text_block_profile(
        schema_id: SchemaId,
        extensions: ExtensionSet,
    ) -> Result<Self, ProfileCompilationError> {
        super::text_block_compiler::compile(schema_id, extensions)
    }

    /// Compiles one sealed base-text editor profile from a resolved extension set.
    ///
    /// Every inline-format toggle declaration becomes one Rust-owned generic
    /// no-input action route. Every property-aware set declaration becomes one
    /// Rust-owned typed action and intent route using the shared versioned set
    /// input contract. Its observable state uses a fixed remove query, so it
    /// answers whether the configured format is present; commands supply their
    /// own dynamic set/remove input. All generated routes are priority-zero and
    /// blocking. The complete eight-action base set, built-in strong-format and
    /// clear-inline-formatting intent routes, and Bold, Clear Formatting, Undo,
    /// and Redo state entries are retained. Clear Formatting is stateless and
    /// removes complete format sets; it is not generated or configured by an
    /// extension manifest. The catalog ceiling of 514 reserves room for these
    /// four built-in controls plus 255 generated toggles and 255 generated
    /// setters.
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
    /// priority-zero blocking route to `breditor/toggle-strong`, plus the
    /// stateless no-input `breditor/clear-inline-formatting` intent and its
    /// priority-zero blocking route to `breditor/clear-inline-formats`. The
    /// latter clears a complete selected `FormatSet`, or establishes an
    /// explicit empty pending set at a formatted caret, through existing
    /// transaction, history, and replay contracts.
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
            &extensions,
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
