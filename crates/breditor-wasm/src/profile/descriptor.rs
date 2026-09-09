use breditor_core::{
    action::ActionActivationContract,
    document::PropertyInteger,
    extension::{InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, PropertyPresenceV1},
    profile::{
        CompiledProfileActionStateDescriptor, CompiledProfileActionStateSource,
        CompiledProfileDescriptor, CompiledProfileInlineFormatDescriptor,
        CompiledProfileIntentDescriptor,
    },
    transaction::ReplayDirection,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::BreditorProfileGeneration;

/// Owned bounded declaration of one compiled semantic profile generation.
///
/// Collections remain in canonical Rust order and are exposed through indexed
/// scalar reads so JavaScript never retains a borrowed Rust slice or pointer.
#[wasm_bindgen]
pub struct BreditorCompiledProfileDescriptor {
    inner: CompiledProfileDescriptor,
}

impl BreditorCompiledProfileDescriptor {
    pub(crate) const fn new(inner: CompiledProfileDescriptor) -> Self {
        Self { inner }
    }

    fn intent(&self, index: u32) -> Option<&CompiledProfileIntentDescriptor> {
        self.inner.intents().get(index as usize)
    }

    fn action_state(&self, index: u32) -> Option<&CompiledProfileActionStateDescriptor> {
        self.inner.action_states().get(index as usize)
    }

    fn inline_format(&self, index: u32) -> Option<&CompiledProfileInlineFormatDescriptor> {
        self.inner.inline_formats().get(index as usize)
    }

    fn inline_format_property(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<&InlineFormatPropertySpecV1> {
        self.inline_format(format_index)?
            .property_contract()?
            .properties()
            .get(property_index as usize)
    }
}

#[wasm_bindgen]
impl BreditorCompiledProfileDescriptor {
    /// Checks the descriptor's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.inner.generation() == &generation.inner
    }

    /// Returns the durable schema selector name.
    #[must_use]
    #[wasm_bindgen(getter, js_name = schemaName)]
    pub fn schema_name(&self) -> String {
        self.inner.schema_binding().schema().name().as_str().to_owned()
    }

    /// Returns the nonzero durable schema selector version.
    #[must_use]
    #[wasm_bindgen(getter, js_name = schemaVersion)]
    pub fn schema_version(&self) -> u32 {
        self.inner.schema_binding().schema().version().get()
    }

    /// Returns the complete compiled-schema fingerprint.
    #[must_use]
    #[wasm_bindgen(getter, js_name = schemaFingerprint)]
    pub fn schema_fingerprint(&self) -> String {
        self.inner.schema_binding().fingerprint().to_string()
    }

    /// Returns the number of admitted inline formats.
    #[must_use]
    #[wasm_bindgen(getter, js_name = formatCount)]
    pub fn format_count(&self) -> u32 {
        fixed_count(self.inner.inline_formats().len())
    }

    /// Returns one admitted inline-format identity.
    #[must_use]
    #[wasm_bindgen(js_name = formatKind)]
    pub fn format_kind(&self, index: u32) -> Option<String> {
        self.inner
            .inline_formats()
            .get(index as usize)
            .map(|descriptor| descriptor.kind().as_str().to_owned())
    }

    /// Returns one admitted inline-format persisted revision.
    #[must_use]
    #[wasm_bindgen(js_name = formatRevision)]
    pub fn format_revision(&self, index: u32) -> Option<u32> {
        self.inline_format(index).map(|descriptor| descriptor.revision().get())
    }

    /// Returns the number of declared properties for one admitted format.
    ///
    /// Property-free formats return zero; an out-of-range format index returns
    /// `undefined` at the JavaScript boundary.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyCount)]
    pub fn format_property_count(&self, format_index: u32) -> Option<u32> {
        self.inline_format(format_index).map(|descriptor| {
            descriptor
                .property_contract()
                .map_or(0, |contract| fixed_count(contract.properties().len()))
        })
    }

    /// Returns one property's qualified identity.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyName)]
    pub fn format_property_name(&self, format_index: u32, property_index: u32) -> Option<String> {
        self.inline_format_property(format_index, property_index)
            .map(|property| property.name().as_str().to_owned())
    }

    /// Returns `required` or `optional` for one property declaration.
    #[must_use]
    #[wasm_bindgen(
        js_name = formatPropertyPresence,
        unchecked_return_type = "BreditorProfilePropertyPresence | undefined"
    )]
    pub fn format_property_presence(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<String> {
        self.inline_format_property(format_index, property_index)
            .map(|property| property_presence(property.presence()).to_owned())
    }

    /// Returns `boolean`, `integer`, or `string` for one property declaration.
    #[must_use]
    #[wasm_bindgen(
        js_name = formatPropertyValueType,
        unchecked_return_type = "BreditorProfilePropertyValueType | undefined"
    )]
    pub fn format_property_value_type(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<String> {
        self.inline_format_property(format_index, property_index)
            .map(|property| property_value_type(property.value_type()).to_owned())
    }

    /// Returns one integer property's inclusive lower bound.
    ///
    /// `undefined` means the bound is open, the property has another type, or
    /// either index is out of range.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyIntegerMinimum)]
    pub fn format_property_integer_minimum(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<f64> {
        let InlineFormatPropertyTypeV1::Integer(domain) =
            self.inline_format_property(format_index, property_index)?.value_type()
        else {
            return None;
        };
        domain.minimum().map(property_integer_number)
    }

    /// Returns one integer property's inclusive upper bound.
    ///
    /// `undefined` means the bound is open, the property has another type, or
    /// either index is out of range.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyIntegerMaximum)]
    pub fn format_property_integer_maximum(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<f64> {
        let InlineFormatPropertyTypeV1::Integer(domain) =
            self.inline_format_property(format_index, property_index)?.value_type()
        else {
            return None;
        };
        domain.maximum().map(property_integer_number)
    }

    /// Returns one string property's inclusive minimum UTF-8 byte length.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyStringMinimumUtf8Bytes)]
    pub fn format_property_string_minimum_utf8_bytes(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<u32> {
        let InlineFormatPropertyTypeV1::String(domain) =
            self.inline_format_property(format_index, property_index)?.value_type()
        else {
            return None;
        };
        Some(domain.minimum_utf8_bytes())
    }

    /// Returns one string property's inclusive maximum UTF-8 byte length.
    #[must_use]
    #[wasm_bindgen(js_name = formatPropertyStringMaximumUtf8Bytes)]
    pub fn format_property_string_maximum_utf8_bytes(
        &self,
        format_index: u32,
        property_index: u32,
    ) -> Option<u32> {
        let InlineFormatPropertyTypeV1::String(domain) =
            self.inline_format_property(format_index, property_index)?.value_type()
        else {
            return None;
        };
        Some(domain.maximum_utf8_bytes())
    }

    /// Returns the number of semantic intents.
    #[must_use]
    #[wasm_bindgen(getter, js_name = intentCount)]
    pub fn intent_count(&self) -> u32 {
        fixed_count(self.inner.intents().len())
    }

    /// Returns one semantic intent identity.
    #[must_use]
    #[wasm_bindgen(js_name = intentId)]
    pub fn intent_id(&self, index: u32) -> Option<String> {
        self.intent(index).map(|descriptor| descriptor.id().as_str().to_owned())
    }

    /// Returns `none` or `typed` for one intent input shape.
    #[must_use]
    #[wasm_bindgen(
        js_name = intentInputKind,
        unchecked_return_type = "BreditorProfileIntentInputKind | undefined"
    )]
    pub fn intent_input_kind(&self, index: u32) -> Option<String> {
        self.intent(index).map(|descriptor| {
            if descriptor.input_contract().is_some() { "typed" } else { "none" }.to_owned()
        })
    }

    /// Returns the qualified input-contract name for a typed intent.
    #[must_use]
    #[wasm_bindgen(js_name = intentInputContractName)]
    pub fn intent_input_contract_name(&self, index: u32) -> Option<String> {
        self.intent(index)
            .and_then(CompiledProfileIntentDescriptor::input_contract)
            .map(|contract| contract.name().as_str().to_owned())
    }

    /// Returns the nonzero input-contract version for a typed intent.
    #[must_use]
    #[wasm_bindgen(js_name = intentInputContractVersion)]
    pub fn intent_input_contract_version(&self, index: u32) -> Option<u32> {
        self.intent(index)
            .and_then(CompiledProfileIntentDescriptor::input_contract)
            .map(|contract| contract.version().get())
    }

    /// Returns one intent's activation shape contract.
    #[must_use]
    #[wasm_bindgen(
        js_name = intentActivationContract,
        unchecked_return_type = "BreditorProfileActivationContract | undefined"
    )]
    pub fn intent_activation_contract(&self, index: u32) -> Option<String> {
        self.intent(index).map(|descriptor| {
            activation_contract(descriptor.state_contract().activation_contract()).to_owned()
        })
    }

    /// Returns one intent's optional state-value contract name.
    #[must_use]
    #[wasm_bindgen(js_name = intentValueContractName)]
    pub fn intent_value_contract_name(&self, index: u32) -> Option<String> {
        self.intent(index)
            .and_then(|descriptor| descriptor.state_contract().value_contract())
            .map(|contract| contract.name().as_str().to_owned())
    }

    /// Returns one intent's optional state-value contract version.
    #[must_use]
    #[wasm_bindgen(js_name = intentValueContractVersion)]
    pub fn intent_value_contract_version(&self, index: u32) -> Option<u32> {
        self.intent(index)
            .and_then(|descriptor| descriptor.state_contract().value_contract())
            .map(|contract| contract.version().get())
    }

    /// Returns the number of observable action-state entries.
    #[must_use]
    #[wasm_bindgen(getter, js_name = actionStateCount)]
    pub fn action_state_count(&self) -> u32 {
        fixed_count(self.inner.action_states().len())
    }

    /// Returns one observable action-state identity.
    #[must_use]
    #[wasm_bindgen(js_name = actionStateId)]
    pub fn action_state_id(&self, index: u32) -> Option<String> {
        self.action_state(index).map(|descriptor| descriptor.id().as_str().to_owned())
    }

    /// Returns `direct`, `routed`, or `history` for one state entry.
    #[must_use]
    #[wasm_bindgen(
        js_name = actionStateSourceKind,
        unchecked_return_type = "BreditorProfileActionStateSourceKind | undefined"
    )]
    pub fn action_state_source_kind(&self, index: u32) -> Option<String> {
        self.action_state(index).map(|descriptor| {
            match descriptor.source() {
                CompiledProfileActionStateSource::Direct(_) => "direct",
                CompiledProfileActionStateSource::Routed(_) => "routed",
                CompiledProfileActionStateSource::History(_) => "history",
            }
            .to_owned()
        })
    }

    /// Returns the direct action source, when applicable.
    #[must_use]
    #[wasm_bindgen(js_name = actionStateSourceActionId)]
    pub fn action_state_source_action_id(&self, index: u32) -> Option<String> {
        match self.action_state(index)?.source() {
            CompiledProfileActionStateSource::Direct(id) => Some(id.as_str().to_owned()),
            CompiledProfileActionStateSource::Routed(_)
            | CompiledProfileActionStateSource::History(_) => None,
        }
    }

    /// Returns the routed semantic-intent source, when applicable.
    #[must_use]
    #[wasm_bindgen(js_name = actionStateSourceIntentId)]
    pub fn action_state_source_intent_id(&self, index: u32) -> Option<String> {
        match self.action_state(index)?.source() {
            CompiledProfileActionStateSource::Routed(id) => Some(id.as_str().to_owned()),
            CompiledProfileActionStateSource::Direct(_)
            | CompiledProfileActionStateSource::History(_) => None,
        }
    }

    /// Returns `undo` or `redo` for a history source.
    #[must_use]
    #[wasm_bindgen(
        js_name = actionStateHistoryDirection,
        unchecked_return_type = "BreditorProfileHistoryDirection | undefined"
    )]
    pub fn action_state_history_direction(&self, index: u32) -> Option<String> {
        match self.action_state(index)?.source() {
            CompiledProfileActionStateSource::History(ReplayDirection::Undo) => {
                Some("undo".to_owned())
            }
            CompiledProfileActionStateSource::History(ReplayDirection::Redo) => {
                Some("redo".to_owned())
            }
            CompiledProfileActionStateSource::Direct(_)
            | CompiledProfileActionStateSource::Routed(_) => None,
        }
    }

    /// Returns one action-state activation shape contract.
    #[must_use]
    #[wasm_bindgen(
        js_name = actionStateActivationContract,
        unchecked_return_type = "BreditorProfileActivationContract | undefined"
    )]
    pub fn action_state_activation_contract(&self, index: u32) -> Option<String> {
        self.action_state(index).map(|descriptor| {
            activation_contract(descriptor.contract().activation_contract()).to_owned()
        })
    }

    /// Returns one action-state optional value-contract name.
    #[must_use]
    #[wasm_bindgen(js_name = actionStateValueContractName)]
    pub fn action_state_value_contract_name(&self, index: u32) -> Option<String> {
        self.action_state(index)
            .and_then(|descriptor| descriptor.contract().value_contract())
            .map(|contract| contract.name().as_str().to_owned())
    }

    /// Returns one action-state optional value-contract version.
    #[must_use]
    #[wasm_bindgen(js_name = actionStateValueContractVersion)]
    pub fn action_state_value_contract_version(&self, index: u32) -> Option<u32> {
        self.action_state(index)
            .and_then(|descriptor| descriptor.contract().value_contract())
            .map(|contract| contract.version().get())
    }
}

const fn activation_contract(contract: ActionActivationContract) -> &'static str {
    match contract {
        ActionActivationContract::Stateless => "stateless",
        ActionActivationContract::Tracked => "tracked",
    }
}

fn fixed_count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

const fn property_presence(presence: PropertyPresenceV1) -> &'static str {
    match presence {
        PropertyPresenceV1::Required => "required",
        PropertyPresenceV1::Optional => "optional",
    }
}

const fn property_value_type(value_type: &InlineFormatPropertyTypeV1) -> &'static str {
    match value_type {
        InlineFormatPropertyTypeV1::Boolean => "boolean",
        InlineFormatPropertyTypeV1::Integer(_) => "integer",
        InlineFormatPropertyTypeV1::String(_) => "string",
    }
}

#[allow(clippy::cast_precision_loss)]
fn property_integer_number(value: PropertyInteger) -> f64 {
    // PropertyInteger is deliberately constrained to JavaScript's exact-safe
    // range, so this conversion cannot lose an integer bit.
    value.get() as f64
}
