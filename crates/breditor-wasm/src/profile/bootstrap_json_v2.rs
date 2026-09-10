use breditor_core::{
    action::{
        ActionId, ActionStateId,
        routing::{BindingId, IntentId},
    },
    document::PropertyInteger,
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSetSpecV1, InlineFormatSpecV1, InlineFormatToggleSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    profile::CompiledEditorProfile,
    schema::{PersistedTypeRevision, SchemaId, SchemaVersion},
};
use serde::{
    Deserialize, Deserializer,
    de::{IgnoredAny, SeqAccess, Visitor},
};
use std::fmt;

use crate::{
    BreditorError,
    error::{
        INVALID_PROFILE_BOOTSTRAP_CODE, PROFILE_BOOTSTRAP_LIMIT_CODE, PROFILE_COMPILATION_CODE,
    },
};

const PROFILE_BOOTSTRAP_FORMAT: &str = "breditor/profile-bootstrap";
const PROFILE_BOOTSTRAP_FORMAT_VERSION: u32 = 2;

/// Exact maximum UTF-8 size of one typed ABI-local bootstrap request.
///
/// Eight MiB admits the compact widest graph allowed by the fixed extension,
/// relationship, typed-property, toggle, and set ceilings. Whitespace and JSON
/// escapes remain transport bytes and consume the same bound.
pub(crate) const MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProfileBootstrapRecord {
    format: String,
    format_version: u32,
    schema: SchemaRecord,
    extensions: Vec<ExtensionManifestRecord>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SchemaRecord {
    name: String,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ExtensionManifestRecord {
    id: ExtensionIdRecord,
    dependencies: Vec<ExtensionIdRecord>,
    conflicts: Vec<ExtensionIdRecord>,
    inline_formats: Vec<InlineFormatRecord>,
    inline_format_property_contracts: Vec<InlineFormatPropertyContractRecord>,
    inline_format_toggles: Vec<InlineFormatBehaviorRecord>,
    inline_format_sets: Vec<InlineFormatBehaviorRecord>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExtensionIdRecord {
    name: String,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InlineFormatRecord {
    kind: String,
    revision: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct InlineFormatPropertyContractRecord {
    format_kind: String,
    properties: Vec<InlineFormatPropertyRecord>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct InlineFormatPropertyRecord {
    name: String,
    presence: PropertyPresenceRecord,
    value_type: InlineFormatPropertyTypeRecord,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum PropertyPresenceRecord {
    Required,
    Optional,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum InlineFormatPropertyTypeRecord {
    Boolean,
    Integer {
        #[serde(deserialize_with = "deserialize_nullable_integer")]
        minimum: Option<i64>,
        #[serde(deserialize_with = "deserialize_nullable_integer")]
        maximum: Option<i64>,
    },
    String {
        #[serde(rename = "minimumUtf8Bytes")]
        minimum_utf8_bytes: u32,
        #[serde(rename = "maximumUtf8Bytes")]
        maximum_utf8_bytes: u32,
    },
}

fn deserialize_nullable_integer<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<i64>::deserialize(deserializer)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct InlineFormatBehaviorRecord {
    format_kind: String,
    action_id: String,
    intent_id: String,
    binding_id: String,
    action_state_id: String,
}

/// Strictly decodes and compiles one complete typed ABI-local profile request.
pub(crate) fn decode_compiled_profile(json: &str) -> Result<CompiledEditorProfile, BreditorError> {
    if json.len() > MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES {
        return Err(BreditorError::new(
            PROFILE_BOOTSTRAP_LIMIT_CODE,
            "the profile bootstrap request exceeds its byte limit",
        ));
    }
    preflight_profile(json)?;
    let record: ProfileBootstrapRecord =
        serde_json::from_str(json).map_err(|_| invalid_bootstrap())?;
    if record.format != PROFILE_BOOTSTRAP_FORMAT
        || record.format_version != PROFILE_BOOTSTRAP_FORMAT_VERSION
    {
        return Err(invalid_bootstrap());
    }

    let schema = SchemaId::new(
        qualified_name(record.schema.name)?,
        SchemaVersion::try_new(record.schema.version).map_err(|_| invalid_bootstrap())?,
    );
    let manifests =
        record.extensions.into_iter().map(extension_manifest).collect::<Result<Vec<_>, _>>()?;
    let extensions = ExtensionSet::try_new(manifests, ExtensionLimits::default())
        .map_err(|_| profile_compilation())?;
    CompiledEditorProfile::try_compile_base_text_profile(schema, extensions)
        .map_err(|_| profile_compilation())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProfilePreflight {
    format: IgnoredAny,
    format_version: IgnoredAny,
    schema: IgnoredAny,
    extensions: ExtensionSequencePreflight,
}

#[derive(Default)]
struct ExtensionSequencePreflight {
    manifests: usize,
    maximum_dependencies: usize,
    maximum_conflicts: usize,
    maximum_formats: usize,
    maximum_contracts: usize,
    maximum_properties: usize,
    maximum_toggles: usize,
    maximum_sets: usize,
    total_dependencies: usize,
    total_conflicts: usize,
    total_formats: usize,
    total_contracts: usize,
    total_properties: usize,
    total_toggles: usize,
    total_sets: usize,
}

impl<'de> Deserialize<'de> for ExtensionSequencePreflight {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ExtensionSequenceVisitor;

        impl<'de> Visitor<'de> for ExtensionSequenceVisitor {
            type Value = ExtensionSequencePreflight;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a typed profile extension array")
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut result = ExtensionSequencePreflight::default();
                while let Some(manifest) = sequence.next_element::<ManifestPreflight>()? {
                    result.observe(&manifest);
                }
                Ok(result)
            }
        }

        deserializer.deserialize_seq(ExtensionSequenceVisitor)
    }
}

impl ExtensionSequencePreflight {
    fn observe(&mut self, manifest: &ManifestPreflight) {
        self.manifests = self.manifests.saturating_add(1);
        self.maximum_dependencies = self.maximum_dependencies.max(manifest.dependencies.0);
        self.maximum_conflicts = self.maximum_conflicts.max(manifest.conflicts.0);
        self.maximum_formats = self.maximum_formats.max(manifest.inline_formats.0);
        self.maximum_contracts =
            self.maximum_contracts.max(manifest.inline_format_property_contracts.contracts);
        self.maximum_properties = self
            .maximum_properties
            .max(manifest.inline_format_property_contracts.maximum_properties);
        self.maximum_toggles = self.maximum_toggles.max(manifest.inline_format_toggles.0);
        self.maximum_sets = self.maximum_sets.max(manifest.inline_format_sets.0);
        self.total_dependencies = self.total_dependencies.saturating_add(manifest.dependencies.0);
        self.total_conflicts = self.total_conflicts.saturating_add(manifest.conflicts.0);
        self.total_formats = self.total_formats.saturating_add(manifest.inline_formats.0);
        self.total_contracts = self
            .total_contracts
            .saturating_add(manifest.inline_format_property_contracts.contracts);
        self.total_properties = self
            .total_properties
            .saturating_add(manifest.inline_format_property_contracts.total_properties);
        self.total_toggles = self.total_toggles.saturating_add(manifest.inline_format_toggles.0);
        self.total_sets = self.total_sets.saturating_add(manifest.inline_format_sets.0);
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ManifestPreflight {
    #[serde(rename = "id")]
    _id: IgnoredAny,
    dependencies: SequenceCount,
    conflicts: SequenceCount,
    inline_formats: SequenceCount,
    inline_format_property_contracts: PropertyContractSequencePreflight,
    inline_format_toggles: SequenceCount,
    inline_format_sets: SequenceCount,
}

#[derive(Default)]
struct SequenceCount(usize);

impl<'de> Deserialize<'de> for SequenceCount {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct SequenceCountVisitor;

        impl<'de> Visitor<'de> for SequenceCountVisitor {
            type Value = SequenceCount;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("an array")
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut count = 0_usize;
                while sequence.next_element::<IgnoredAny>()?.is_some() {
                    count = count.saturating_add(1);
                }
                Ok(SequenceCount(count))
            }
        }

        deserializer.deserialize_seq(SequenceCountVisitor)
    }
}

#[derive(Default)]
struct PropertyContractSequencePreflight {
    contracts: usize,
    maximum_properties: usize,
    total_properties: usize,
}

impl<'de> Deserialize<'de> for PropertyContractSequencePreflight {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct PropertyContractSequenceVisitor;

        impl<'de> Visitor<'de> for PropertyContractSequenceVisitor {
            type Value = PropertyContractSequencePreflight;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("an inline-format property-contract array")
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut result = PropertyContractSequencePreflight::default();
                while let Some(contract) = sequence.next_element::<PropertyContractPreflight>()? {
                    result.contracts = result.contracts.saturating_add(1);
                    result.maximum_properties =
                        result.maximum_properties.max(contract.properties.0);
                    result.total_properties =
                        result.total_properties.saturating_add(contract.properties.0);
                }
                Ok(result)
            }
        }

        deserializer.deserialize_seq(PropertyContractSequenceVisitor)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PropertyContractPreflight {
    #[serde(rename = "formatKind")]
    _format_kind: IgnoredAny,
    properties: SequenceCount,
}

fn preflight_profile(json: &str) -> Result<(), BreditorError> {
    let preflight: ProfilePreflight =
        serde_json::from_str(json).map_err(|_| invalid_bootstrap())?;
    let _ = (&preflight.format, &preflight.format_version, &preflight.schema);
    let counts = preflight.extensions;
    let limits = ExtensionLimits::default();
    let maximum_contracts =
        breditor_core::extension::MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST
            as usize;
    let maximum_properties =
        breditor_core::extension::MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT as usize;
    let maximum_profile_formats =
        breditor_core::schema::MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS as usize;
    let too_large = counts.manifests > limits.max_extensions() as usize
        || counts.maximum_dependencies > limits.max_dependencies_per_manifest() as usize
        || counts.maximum_conflicts > limits.max_conflicts_per_manifest() as usize
        || counts.maximum_formats
            > breditor_core::extension::MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST as usize
        || counts.maximum_contracts > maximum_contracts
        || counts.maximum_properties > maximum_properties
        || counts.maximum_toggles
            > breditor_core::extension::MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST as usize
        || counts.maximum_sets
            > breditor_core::extension::MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST as usize
        || counts.total_dependencies > limits.max_dependencies() as usize
        || counts.total_conflicts > limits.max_conflicts() as usize
        || counts.total_formats > maximum_profile_formats
        || counts.total_contracts > maximum_profile_formats
        || counts.total_properties > maximum_profile_formats.saturating_mul(maximum_properties)
        || counts.total_toggles
            > breditor_core::profile::MAX_PROFILE_INLINE_FORMAT_TOGGLES as usize
        || counts.total_sets > breditor_core::profile::MAX_PROFILE_INLINE_FORMAT_SETS as usize;
    if too_large {
        return Err(BreditorError::new(
            PROFILE_BOOTSTRAP_LIMIT_CODE,
            "the profile bootstrap request exceeds a collection limit",
        ));
    }
    Ok(())
}

fn extension_manifest(record: ExtensionManifestRecord) -> Result<ExtensionManifest, BreditorError> {
    let id = extension_id(record.id)?;
    let dependencies =
        record.dependencies.into_iter().map(extension_id).collect::<Result<Vec<_>, _>>()?;
    let conflicts =
        record.conflicts.into_iter().map(extension_id).collect::<Result<Vec<_>, _>>()?;
    let inline_formats =
        record.inline_formats.into_iter().map(inline_format).collect::<Result<Vec<_>, _>>()?;
    let property_contracts = record
        .inline_format_property_contracts
        .into_iter()
        .map(property_contract)
        .collect::<Result<Vec<_>, _>>()?;
    let toggles = record
        .inline_format_toggles
        .into_iter()
        .map(inline_format_toggle)
        .collect::<Result<Vec<_>, _>>()?;
    let sets = record
        .inline_format_sets
        .into_iter()
        .map(inline_format_set)
        .collect::<Result<Vec<_>, _>>()?;
    ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        id,
        dependencies,
        conflicts,
        inline_formats,
        property_contracts,
        toggles,
        sets,
    )
    .map_err(|_| profile_compilation())
}

fn inline_format(record: InlineFormatRecord) -> Result<InlineFormatSpecV1, BreditorError> {
    Ok(InlineFormatSpecV1::new(
        qualified_name(record.kind)?,
        PersistedTypeRevision::try_new(record.revision).map_err(|_| invalid_bootstrap())?,
    ))
}

fn property_contract(
    record: InlineFormatPropertyContractRecord,
) -> Result<InlineFormatPropertyContractV1, BreditorError> {
    let format_kind = qualified_name(record.format_kind)?;
    let properties =
        record.properties.into_iter().map(property_spec).collect::<Result<Vec<_>, _>>()?;
    InlineFormatPropertyContractV1::try_new(format_kind, properties)
        .map_err(|_| profile_compilation())
}

fn property_spec(
    record: InlineFormatPropertyRecord,
) -> Result<InlineFormatPropertySpecV1, BreditorError> {
    let name = qualified_name(record.name)?;
    let presence = match record.presence {
        PropertyPresenceRecord::Required => PropertyPresenceV1::Required,
        PropertyPresenceRecord::Optional => PropertyPresenceV1::Optional,
    };
    let value_type = property_type(record.value_type)?;
    Ok(InlineFormatPropertySpecV1::new(name, presence, value_type))
}

fn property_type(
    record: InlineFormatPropertyTypeRecord,
) -> Result<InlineFormatPropertyTypeV1, BreditorError> {
    match record {
        InlineFormatPropertyTypeRecord::Boolean => Ok(InlineFormatPropertyTypeV1::boolean()),
        InlineFormatPropertyTypeRecord::Integer { minimum, maximum } => {
            let minimum = minimum
                .map(PropertyInteger::try_new)
                .transpose()
                .map_err(|_| invalid_bootstrap())?;
            let maximum = maximum
                .map(PropertyInteger::try_new)
                .transpose()
                .map_err(|_| invalid_bootstrap())?;
            InlineFormatPropertyTypeV1::try_integer(minimum, maximum)
                .map_err(|_| invalid_bootstrap())
        }
        InlineFormatPropertyTypeRecord::String { minimum_utf8_bytes, maximum_utf8_bytes } => {
            InlineFormatPropertyTypeV1::try_string(minimum_utf8_bytes, maximum_utf8_bytes)
                .map_err(|_| invalid_bootstrap())
        }
    }
}

fn inline_format_toggle(
    record: InlineFormatBehaviorRecord,
) -> Result<InlineFormatToggleSpecV1, BreditorError> {
    Ok(InlineFormatToggleSpecV1::new(
        qualified_name(record.format_kind)?,
        ActionId::try_new(record.action_id).map_err(|_| invalid_bootstrap())?,
        IntentId::try_new(record.intent_id).map_err(|_| invalid_bootstrap())?,
        BindingId::try_new(record.binding_id).map_err(|_| invalid_bootstrap())?,
        ActionStateId::try_new(record.action_state_id).map_err(|_| invalid_bootstrap())?,
    ))
}

fn inline_format_set(
    record: InlineFormatBehaviorRecord,
) -> Result<InlineFormatSetSpecV1, BreditorError> {
    Ok(InlineFormatSetSpecV1::new(
        qualified_name(record.format_kind)?,
        ActionId::try_new(record.action_id).map_err(|_| invalid_bootstrap())?,
        IntentId::try_new(record.intent_id).map_err(|_| invalid_bootstrap())?,
        BindingId::try_new(record.binding_id).map_err(|_| invalid_bootstrap())?,
        ActionStateId::try_new(record.action_state_id).map_err(|_| invalid_bootstrap())?,
    ))
}

fn extension_id(record: ExtensionIdRecord) -> Result<ExtensionId, BreditorError> {
    Ok(ExtensionId::new(
        qualified_name(record.name)?,
        ExtensionVersion::try_new(record.version).map_err(|_| invalid_bootstrap())?,
    ))
}

fn qualified_name(value: String) -> Result<QualifiedName, BreditorError> {
    QualifiedName::try_new(value).map_err(|_| invalid_bootstrap())
}

const fn invalid_bootstrap() -> BreditorError {
    BreditorError::new(INVALID_PROFILE_BOOTSTRAP_CODE, "the profile bootstrap request is invalid")
}

const fn profile_compilation() -> BreditorError {
    BreditorError::new(PROFILE_COMPILATION_CODE, "the compiled profile was rejected")
}

#[cfg(test)]
mod tests {
    use breditor_core::extension::{
        InlineFormatPropertyTypeV1, MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
        MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST, MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT,
    };

    use super::*;

    const PROFILE: &str = r#"{
      "format":"breditor/profile-bootstrap",
      "formatVersion":2,
      "schema":{"name":"example/editor","version":1},
      "extensions":[{
        "id":{"name":"example/format-extension","version":1},
        "dependencies":[],
        "conflicts":[],
        "inlineFormats":[
          {"kind":"example/link","revision":7},
          {"kind":"example/marker","revision":1}
        ],
        "inlineFormatPropertyContracts":[{
          "formatKind":"example/link",
          "properties":[
            {"name":"example/trusted","presence":"optional","valueType":{"kind":"boolean"}},
            {"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},
            {"name":"example/rank","presence":"optional","valueType":{"kind":"integer","minimum":-5,"maximum":10}}
          ]
        }],
        "inlineFormatToggles":[{
          "formatKind":"example/marker",
          "actionId":"example/toggle-marker",
          "intentId":"example/toggle-marker-intent",
          "bindingId":"example/toggle-marker-binding",
          "actionStateId":"example/marker-control"
        }],
        "inlineFormatSets":[{
          "formatKind":"example/link",
          "actionId":"example/set-link",
          "intentId":"example/set-link-intent",
          "bindingId":"example/set-link-binding",
          "actionStateId":"example/link-control"
        }]
      }]
    }"#;

    #[test]
    fn decodes_typed_contracts_and_generates_declared_setter_surfaces() -> Result<(), BreditorError>
    {
        let profile = decode_compiled_profile(PROFILE)?;
        assert_eq!(profile.schema().id().name().as_str(), "example/editor");
        assert_eq!(profile.extensions().len(), 1);
        assert_eq!(profile.intent_router().intent_count(), 3);
        assert_eq!(profile.action_state_catalog().len(), 5);

        let formats = profile.descriptor().inline_formats();
        let link = formats
            .iter()
            .find(|format| format.kind().as_str() == "example/link")
            .ok_or_else(invalid_bootstrap)?;
        let contract = link.property_contract().ok_or_else(invalid_bootstrap)?;
        assert_eq!(
            contract
                .properties()
                .iter()
                .map(|property| property.name().as_str())
                .collect::<Vec<_>>(),
            ["example/href", "example/rank", "example/trusted"],
        );

        let intents = profile.descriptor().intents();
        let set_intent = intents
            .iter()
            .find(|intent| intent.id().as_str() == "example/set-link-intent")
            .ok_or_else(invalid_bootstrap)?;
        let input = set_intent.input_contract().ok_or_else(invalid_bootstrap)?;
        assert_eq!(input.name().as_str(), "breditor/set-inline-format-input");
        assert_eq!(input.version().get(), 1);
        assert!(
            profile
                .descriptor()
                .action_states()
                .iter()
                .any(|state| state.id().as_str() == "example/link-control")
        );

        let descriptor =
            crate::BreditorCompiledProfileDescriptor::new(profile.descriptor().clone());
        assert_eq!(descriptor.format_property_count(0), Some(0));
        assert_eq!(descriptor.format_property_count(1), Some(3));
        assert_eq!(descriptor.format_property_count(3), None);
        assert_eq!(descriptor.format_property_name(1, 0).as_deref(), Some("example/href"));
        assert_eq!(descriptor.format_property_presence(1, 0).as_deref(), Some("required"));
        assert_eq!(descriptor.format_property_value_type(1, 0).as_deref(), Some("string"));
        assert_eq!(descriptor.format_property_string_minimum_utf8_bytes(1, 0), Some(1));
        assert_eq!(descriptor.format_property_string_maximum_utf8_bytes(1, 0), Some(2_048));
        assert_eq!(descriptor.format_property_integer_minimum(1, 1), Some(-5.0));
        assert_eq!(descriptor.format_property_integer_maximum(1, 1), Some(10.0));
        assert_eq!(descriptor.format_property_value_type(1, 2).as_deref(), Some("boolean"));
        assert_eq!(descriptor.format_property_integer_minimum(1, 2), None);
        assert_eq!(descriptor.format_property_name(1, 3), None);
        assert_eq!(descriptor.inline_format_set_count(), 1);
        assert_eq!(descriptor.inline_format_set_format_kind(0).as_deref(), Some("example/link"));
        assert_eq!(
            descriptor.inline_format_set_intent_id(0).as_deref(),
            Some("example/set-link-intent")
        );
        assert_eq!(
            descriptor.inline_format_set_action_state_id(0).as_deref(),
            Some("example/link-control")
        );
        assert_eq!(descriptor.inline_format_set_format_kind(1), None);
        assert_eq!(descriptor.inline_format_set_intent_id(1), None);
        assert_eq!(descriptor.inline_format_set_action_state_id(1), None);
        Ok(())
    }

    #[test]
    fn strict_shape_header_and_duplicate_fields_fail_closed() {
        let invalid_requests = [
            PROFILE.replace("\"formatVersion\":2", "\"formatVersion\":1"),
            PROFILE.replace("\"extensions\":[", "\"unknown\":0,\"extensions\":["),
            PROFILE.replacen("\"schema\":", "\"schema\":{},\"schema\":", 1),
            PROFILE.replacen(
                "\"name\":\"example/trusted\"",
                "\"name\":\"example/trusted\",\"name\":\"example/other\"",
                1,
            ),
            PROFILE.replacen(
                "\"kind\":\"boolean\"",
                "\"kind\":\"boolean\",\"kind\":\"integer\"",
                1,
            ),
            PROFILE.replace("\"inlineFormatSets\":", "\"extra\":null,\"inlineFormatSets\":"),
        ];
        for invalid in invalid_requests {
            assert_eq!(
                error_code(decode_compiled_profile(&invalid)),
                Some(INVALID_PROFILE_BOOTSTRAP_CODE.to_owned()),
            );
        }
    }

    #[test]
    fn public_v2_entrypoint_is_explicit_and_does_not_widen_v1() {
        let mut typed = crate::BreditorCompiledProfile::from_bootstrap_json_v2(PROFILE);
        assert_eq!(typed.status(), "profile");
        assert!(typed.take_profile().is_some());

        let original = crate::BreditorCompiledProfile::from_bootstrap_json(PROFILE);
        assert_eq!(original.status(), "error");
        assert_eq!(
            original.error().map(|error| error.code()),
            Some(INVALID_PROFILE_BOOTSTRAP_CODE.to_owned()),
        );
    }

    #[test]
    fn boolean_integer_and_string_domains_retain_their_closed_bounds() -> Result<(), BreditorError>
    {
        let profile = decode_compiled_profile(PROFILE)?;
        let link = profile
            .descriptor()
            .inline_formats()
            .iter()
            .find(|format| format.kind().as_str() == "example/link")
            .ok_or_else(invalid_bootstrap)?;
        let properties = link.property_contract().ok_or_else(invalid_bootstrap)?.properties();

        let InlineFormatPropertyTypeV1::String(string) = properties[0].value_type() else {
            return Err(invalid_bootstrap());
        };
        assert_eq!(string.minimum_utf8_bytes(), 1);
        assert_eq!(string.maximum_utf8_bytes(), 2_048);
        let InlineFormatPropertyTypeV1::Integer(integer) = properties[1].value_type() else {
            return Err(invalid_bootstrap());
        };
        assert_eq!(integer.minimum().map(PropertyInteger::get), Some(-5));
        assert_eq!(integer.maximum().map(PropertyInteger::get), Some(10));
        assert!(matches!(properties[2].value_type(), InlineFormatPropertyTypeV1::Boolean));
        Ok(())
    }

    #[test]
    fn invalid_numeric_forms_and_domain_bounds_are_rejected_as_bootstrap_data() {
        let invalid_requests = [
            PROFILE.replace("\"minimum\":-5", "\"minimum\":-9007199254740992"),
            PROFILE.replace("\"maximum\":10", "\"maximum\":9007199254740992"),
            PROFILE.replace("\"minimum\":-5", "\"minimum\":1.5"),
            PROFILE.replace("\"minimum\":-5", "\"minimum\":11"),
            PROFILE.replace("\"maximumUtf8Bytes\":2048", "\"maximumUtf8Bytes\":65537"),
            PROFILE.replace("\"minimumUtf8Bytes\":1", "\"minimumUtf8Bytes\":2049"),
        ];
        for invalid in invalid_requests {
            assert_eq!(
                error_code(decode_compiled_profile(&invalid)),
                Some(INVALID_PROFILE_BOOTSTRAP_CODE.to_owned()),
            );
        }
    }

    #[test]
    fn integer_bounds_are_mandatory_nullable_fields() -> Result<(), BreditorError> {
        let omitted_minimum = PROFILE.replace(
            "\"kind\":\"integer\",\"minimum\":-5,\"maximum\":10",
            "\"kind\":\"integer\",\"maximum\":10",
        );
        let omitted_maximum = PROFILE.replace(
            "\"kind\":\"integer\",\"minimum\":-5,\"maximum\":10",
            "\"kind\":\"integer\",\"minimum\":-5",
        );
        assert_ne!(omitted_minimum, PROFILE);
        assert_ne!(omitted_maximum, PROFILE);
        assert_eq!(
            error_code(decode_compiled_profile(&omitted_minimum)),
            Some(INVALID_PROFILE_BOOTSTRAP_CODE.to_owned()),
        );
        assert_eq!(
            error_code(decode_compiled_profile(&omitted_maximum)),
            Some(INVALID_PROFILE_BOOTSTRAP_CODE.to_owned()),
        );

        let unbounded = PROFILE.replace(
            "\"kind\":\"integer\",\"minimum\":-5,\"maximum\":10",
            "\"kind\":\"integer\",\"minimum\":null,\"maximum\":null",
        );
        let profile = decode_compiled_profile(&unbounded)?;
        let integer = profile
            .descriptor()
            .inline_formats()
            .iter()
            .find(|format| format.kind().as_str() == "example/link")
            .and_then(|format| format.property_contract())
            .and_then(|contract| contract.properties().get(1))
            .map(InlineFormatPropertySpecV1::value_type);
        let Some(InlineFormatPropertyTypeV1::Integer(integer)) = integer else {
            return Err(invalid_bootstrap());
        };
        assert_eq!(integer.minimum(), None);
        assert_eq!(integer.maximum(), None);
        Ok(())
    }

    #[test]
    fn duplicate_property_declarations_survive_json_parsing_and_reach_compilation() {
        let duplicate = PROFILE.replace("example/trusted", "example/href");
        let error = decode_compiled_profile(&duplicate).err();
        assert_eq!(
            error.as_ref().map(BreditorError::code),
            Some(PROFILE_COMPILATION_CODE.to_owned())
        );
        assert_eq!(
            error.as_ref().map(BreditorError::message),
            Some("the compiled profile was rejected".to_owned()),
        );
        assert!(!error.as_ref().is_some_and(|error| error.message().contains("example/href")));
    }

    #[test]
    fn new_nested_collection_limits_are_enforced_before_owned_decoding() {
        let maximum_contracts =
            MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST as usize;
        let maximum_sets = MAX_EXTENSION_INLINE_FORMAT_SETS_PER_MANIFEST as usize;
        let maximum_properties = MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT as usize;

        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest(
                &repeat_entry(&preflight_contract(0), maximum_contracts),
                0,
            )),
            &preflight_request(&preflight_manifest(
                &repeat_entry(&preflight_contract(0), maximum_contracts + 1),
                0,
            )),
        );
        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest(&preflight_contract(maximum_properties), 0)),
            &preflight_request(&preflight_manifest(&preflight_contract(maximum_properties + 1), 0)),
        );
        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest("", maximum_sets)),
            &preflight_request(&preflight_manifest("", maximum_sets + 1)),
        );
    }

    #[test]
    fn aggregate_contract_and_set_limits_are_enforced_across_manifests() {
        let maximum_contracts =
            breditor_core::schema::MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS as usize;
        let maximum_sets = breditor_core::profile::MAX_PROFILE_INLINE_FORMAT_SETS as usize;
        let exact_contracts =
            preflight_manifest(&repeat_entry(&preflight_contract(0), maximum_contracts), 0);
        let contract_over =
            format!("{exact_contracts},{}", preflight_manifest(&preflight_contract(0), 0));
        assert_preflight_limit_pair(
            &preflight_request(&exact_contracts),
            &preflight_request(&contract_over),
        );

        let exact_sets = preflight_manifest("", maximum_sets);
        let set_over = format!("{exact_sets},{}", preflight_manifest("", 1));
        assert_preflight_limit_pair(&preflight_request(&exact_sets), &preflight_request(&set_over));
    }

    #[test]
    fn byte_limit_runs_before_parsing_and_admits_the_exact_boundary() {
        let oversized = " ".repeat(MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES + 1);
        assert_eq!(
            error_code(decode_compiled_profile(&oversized)),
            Some(PROFILE_BOOTSTRAP_LIMIT_CODE.to_owned()),
        );

        let padding = " ".repeat(MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES - PROFILE.len());
        let exact = format!("{padding}{PROFILE}");
        assert!(decode_compiled_profile(&exact).is_ok());
        assert_eq!(
            error_code(decode_compiled_profile(&format!(" {exact}"))),
            Some(PROFILE_BOOTSTRAP_LIMIT_CODE.to_owned()),
        );
    }

    #[test]
    fn eight_mib_admits_the_compact_widest_typed_preflight_fixture() {
        let widest_name = format!("a/{}", "a".repeat(126));
        assert_eq!(widest_name.len(), breditor_core::identity::MAX_QUALIFIED_NAME_BYTES);
        let id = format!(r#"{{"name":"{widest_name}","version":4294967295}}"#);
        let relations = repeat_entry(&id, 256);
        let format = format!(r#"{{"kind":"{widest_name}","revision":4294967295}}"#);
        let formats = repeat_entry(&format, 255);
        let behavior = format!(
            r#"{{"formatKind":"{widest_name}","actionId":"{widest_name}","intentId":"{widest_name}","bindingId":"{widest_name}","actionStateId":"{widest_name}"}}"#,
        );
        let behaviors = repeat_entry(&behavior, 255);
        let property = format!(
            r#"{{"name":"{widest_name}","presence":"required","valueType":{{"kind":"integer","minimum":-9007199254740991,"maximum":9007199254740991}}}}"#,
        );
        let properties = repeat_entry(&property, 32);
        let contract = format!(r#"{{"formatKind":"{widest_name}","properties":[{properties}]}}"#);
        let contracts = repeat_entry(&contract, 255);
        let complete = format!(
            r#"{{"id":{id},"dependencies":[{relations}],"conflicts":[{relations}],"inlineFormats":[{formats}],"inlineFormatPropertyContracts":[{contracts}],"inlineFormatToggles":[{behaviors}],"inlineFormatSets":[{behaviors}]}}"#,
        );
        let relation_only = format!(
            r#"{{"id":{id},"dependencies":[{relations}],"conflicts":[{relations}],"inlineFormats":[],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[],"inlineFormatSets":[]}}"#,
        );
        let empty = format!(
            r#"{{"id":{id},"dependencies":[],"conflicts":[],"inlineFormats":[],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[],"inlineFormatSets":[]}}"#,
        );
        let manifests = format!(
            "{complete},{},{}",
            repeat_entry(&relation_only, 63),
            repeat_entry(&empty, 960),
        );
        let request = format!(
            r#"{{"format":null,"formatVersion":null,"schema":null,"extensions":[{manifests}]}}"#,
        );

        assert!(request.len() > 4 * 1024 * 1024);
        assert!(request.len() <= MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES);
        assert!(preflight_profile(&request).is_ok());
    }

    fn error_code(result: Result<CompiledEditorProfile, BreditorError>) -> Option<String> {
        result.err().map(|error| error.code())
    }

    fn assert_preflight_limit_pair(exact: &str, over: &str) {
        assert!(exact.len() <= MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES);
        assert!(over.len() <= MAX_PROFILE_BOOTSTRAP_V2_JSON_BYTES);
        assert!(preflight_profile(exact).is_ok());
        assert_eq!(
            preflight_profile(over).err().map(|error| error.code()),
            Some(PROFILE_BOOTSTRAP_LIMIT_CODE.to_owned()),
        );
    }

    fn preflight_request(manifests: &str) -> String {
        format!(
            r#"{{"format":null,"formatVersion":null,"schema":null,"extensions":[{manifests}]}}"#
        )
    }

    fn preflight_manifest(contracts: &str, sets: usize) -> String {
        format!(
            r#"{{"id":null,"dependencies":[],"conflicts":[],"inlineFormats":[],"inlineFormatPropertyContracts":[{contracts}],"inlineFormatToggles":[],"inlineFormatSets":[{}]}}"#,
            repeat_entry("null", sets),
        )
    }

    fn preflight_contract(properties: usize) -> String {
        format!(r#"{{"formatKind":null,"properties":[{}]}}"#, repeat_entry("null", properties))
    }

    fn repeat_entry(value: &str, count: usize) -> String {
        std::iter::repeat_n(value, count).collect::<Vec<_>>().join(",")
    }
}
