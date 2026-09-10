use crate::{
    action::{ActionStateCatalog, ActionStateSource, routing::IntentRouter},
    extension::{ExtensionManifest, ExtensionSet},
    schema::{CompiledSchema, DurableSchemaBinding},
};

use super::{
    CompiledProfileActionStateDescriptor, CompiledProfileActionStateSource,
    CompiledProfileGeneration, CompiledProfileInlineFormatDescriptor,
    CompiledProfileInlineFormatSetDescriptor, CompiledProfileIntentDescriptor,
};

/// Immutable owned description of one complete compiled profile generation.
///
/// The descriptor is suitable for building host UI and validating typed
/// intent inputs. Its generation is deliberately opaque and process-local;
/// durable admission uses [`Self::schema_binding`] instead.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledProfileDescriptor {
    generation: CompiledProfileGeneration,
    schema_binding: DurableSchemaBinding,
    inline_formats: Box<[CompiledProfileInlineFormatDescriptor]>,
    inline_format_sets: Box<[CompiledProfileInlineFormatSetDescriptor]>,
    intents: Box<[CompiledProfileIntentDescriptor]>,
    action_states: Box<[CompiledProfileActionStateDescriptor]>,
}

impl CompiledProfileDescriptor {
    pub(super) fn from_compilation(
        extensions: &ExtensionSet,
        schema: &CompiledSchema,
        router: &IntentRouter,
        action_states: &ActionStateCatalog,
        generation: CompiledProfileGeneration,
    ) -> Self {
        let inline_formats = schema
            .inline_formats()
            .map(|(kind, revision, property_contract)| {
                CompiledProfileInlineFormatDescriptor::new(
                    kind.clone(),
                    revision,
                    property_contract.cloned(),
                )
            })
            .collect::<Vec<_>>()
            .into_boxed_slice();
        let mut inline_format_sets = extensions
            .manifests()
            .flat_map(ExtensionManifest::inline_format_sets)
            .map(|declaration| {
                CompiledProfileInlineFormatSetDescriptor::new(
                    declaration.format_kind().clone(),
                    declaration.intent_id().clone(),
                    declaration.action_state_id().clone(),
                )
            })
            .collect::<Vec<_>>();
        inline_format_sets.sort_by(|left, right| {
            left.format_kind()
                .cmp(right.format_kind())
                .then_with(|| left.intent_id().cmp(right.intent_id()))
                .then_with(|| left.action_state_id().cmp(right.action_state_id()))
        });
        let inline_format_sets = inline_format_sets.into_boxed_slice();
        let intents = router
            .declarations()
            .map(|declaration| {
                CompiledProfileIntentDescriptor::new(
                    declaration.id().clone(),
                    declaration.input_contract().cloned(),
                    declaration.state_spec().contract().clone(),
                )
            })
            .collect::<Vec<_>>()
            .into_boxed_slice();
        let action_states = action_states
            .descriptors()
            .iter()
            .map(|descriptor| {
                let source = match descriptor.source() {
                    ActionStateSource::Direct(invocation) => {
                        CompiledProfileActionStateSource::Direct(invocation.id().clone())
                    }
                    ActionStateSource::Routed(invocation) => {
                        CompiledProfileActionStateSource::Routed(invocation.id().clone())
                    }
                    ActionStateSource::History(direction) => {
                        CompiledProfileActionStateSource::History(*direction)
                    }
                };
                CompiledProfileActionStateDescriptor::new(
                    descriptor.id().clone(),
                    source,
                    descriptor.contract().clone(),
                )
            })
            .collect::<Vec<_>>()
            .into_boxed_slice();
        Self {
            generation,
            schema_binding: schema.durable_binding(),
            inline_formats,
            inline_format_sets,
            intents,
            action_states,
        }
    }

    /// Returns this descriptor's opaque process-local generation.
    #[must_use]
    pub const fn generation(&self) -> &CompiledProfileGeneration {
        &self.generation
    }

    /// Returns the durable schema selector and complete-definition fingerprint.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        &self.schema_binding
    }

    /// Returns all admitted inline formats in canonical lexical order.
    #[must_use]
    pub const fn inline_formats(&self) -> &[CompiledProfileInlineFormatDescriptor] {
        &self.inline_formats
    }

    /// Looks up one admitted inline-format definition.
    #[must_use]
    pub fn inline_format(
        &self,
        kind: &crate::identity::QualifiedName,
    ) -> Option<&CompiledProfileInlineFormatDescriptor> {
        self.inline_formats
            .binary_search_by(|descriptor| descriptor.kind().cmp(kind))
            .ok()
            .map(|index| &self.inline_formats[index])
    }

    /// Returns generated property-aware set surfaces in canonical format order.
    #[must_use]
    pub const fn inline_format_sets(&self) -> &[CompiledProfileInlineFormatSetDescriptor] {
        &self.inline_format_sets
    }

    /// Looks up the set surface generated for one admitted inline format.
    #[must_use]
    pub fn inline_format_set(
        &self,
        kind: &crate::identity::QualifiedName,
    ) -> Option<&CompiledProfileInlineFormatSetDescriptor> {
        self.inline_format_sets
            .binary_search_by(|descriptor| descriptor.format_kind().cmp(kind))
            .ok()
            .map(|index| &self.inline_format_sets[index])
    }

    /// Returns every admitted intent contract in canonical lexical ID order.
    #[must_use]
    pub const fn intents(&self) -> &[CompiledProfileIntentDescriptor] {
        &self.intents
    }

    /// Looks up one admitted intent contract.
    #[must_use]
    pub fn intent(
        &self,
        id: &crate::action::routing::IntentId,
    ) -> Option<&CompiledProfileIntentDescriptor> {
        self.intents
            .binary_search_by(|descriptor| descriptor.id().cmp(id))
            .ok()
            .map(|index| &self.intents[index])
    }

    /// Returns every observable state contract in canonical lexical ID order.
    #[must_use]
    pub const fn action_states(&self) -> &[CompiledProfileActionStateDescriptor] {
        &self.action_states
    }

    /// Looks up one observable state contract.
    #[must_use]
    pub fn action_state(
        &self,
        id: &crate::action::ActionStateId,
    ) -> Option<&CompiledProfileActionStateDescriptor> {
        self.action_states
            .binary_search_by(|descriptor| descriptor.id().cmp(id))
            .ok()
            .map(|index| &self.action_states[index])
    }
}
