use breditor_core::{
    action::{
        ActionId, ActionStateId,
        routing::{BindingId, IntentId},
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1, InlineFormatToggleSpecV1,
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

/// Exact maximum UTF-8 size of one ABI-local profile bootstrap request.
///
/// Eight MiB is the smallest power-of-two ceiling above the compact worst-case
/// request permitted by the fixed graph, identity-width, format, and toggle
/// limits. Whitespace is transport overhead and does not expand this budget.
pub(crate) const MAX_PROFILE_BOOTSTRAP_JSON_BYTES: usize = 8 * 1024 * 1024;

const PROFILE_BOOTSTRAP_FORMAT: &str = "breditor/profile-bootstrap";
const PROFILE_BOOTSTRAP_FORMAT_VERSION: u32 = 1;

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
    inline_format_toggles: Vec<InlineFormatToggleRecord>,
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
struct InlineFormatToggleRecord {
    format_kind: String,
    action_id: String,
    intent_id: String,
    binding_id: String,
    action_state_id: String,
}

/// Strictly decodes and compiles one complete ABI 3 profile request.
pub(crate) fn decode_compiled_profile(json: &str) -> Result<CompiledEditorProfile, BreditorError> {
    if json.len() > MAX_PROFILE_BOOTSTRAP_JSON_BYTES {
        return Err(BreditorError::new(
            PROFILE_BOOTSTRAP_LIMIT_CODE,
            "the profile bootstrap request exceeds its byte limit",
        ));
    }
    preflight_profile(json)?;
    let record: ProfileBootstrapRecord = serde_json::from_str(json).map_err(|_| {
        BreditorError::new(
            INVALID_PROFILE_BOOTSTRAP_CODE,
            "the profile bootstrap request is invalid",
        )
    })?;
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
    maximum_toggles: usize,
    total_dependencies: usize,
    total_conflicts: usize,
    total_formats: usize,
    total_toggles: usize,
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
                formatter.write_str("a profile extension array")
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut result = ExtensionSequencePreflight::default();
                while let Some(manifest) = sequence.next_element::<ManifestPreflight>()? {
                    result.manifests = result.manifests.saturating_add(1);
                    result.maximum_dependencies =
                        result.maximum_dependencies.max(manifest.dependencies.0);
                    result.maximum_conflicts = result.maximum_conflicts.max(manifest.conflicts.0);
                    result.maximum_formats = result.maximum_formats.max(manifest.inline_formats.0);
                    result.maximum_toggles =
                        result.maximum_toggles.max(manifest.inline_format_toggles.0);
                    result.total_dependencies =
                        result.total_dependencies.saturating_add(manifest.dependencies.0);
                    result.total_conflicts =
                        result.total_conflicts.saturating_add(manifest.conflicts.0);
                    result.total_formats =
                        result.total_formats.saturating_add(manifest.inline_formats.0);
                    result.total_toggles =
                        result.total_toggles.saturating_add(manifest.inline_format_toggles.0);
                }
                Ok(result)
            }
        }

        deserializer.deserialize_seq(ExtensionSequenceVisitor)
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
    inline_format_toggles: SequenceCount,
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

fn preflight_profile(json: &str) -> Result<(), BreditorError> {
    let preflight: ProfilePreflight =
        serde_json::from_str(json).map_err(|_| invalid_bootstrap())?;
    let _ = (&preflight.format, &preflight.format_version, &preflight.schema);
    let counts = preflight.extensions;
    let limits = ExtensionLimits::default();
    let too_large = counts.manifests > limits.max_extensions() as usize
        || counts.maximum_dependencies > limits.max_dependencies_per_manifest() as usize
        || counts.maximum_conflicts > limits.max_conflicts_per_manifest() as usize
        || counts.maximum_formats
            > breditor_core::extension::MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST as usize
        || counts.maximum_toggles
            > breditor_core::extension::MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST as usize
        || counts.total_dependencies > limits.max_dependencies() as usize
        || counts.total_conflicts > limits.max_conflicts() as usize
        || counts.total_formats
            > breditor_core::schema::MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS as usize
        || counts.total_toggles
            > breditor_core::profile::MAX_PROFILE_INLINE_FORMAT_TOGGLES as usize;
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
    let inline_formats = record
        .inline_formats
        .into_iter()
        .map(|record| {
            Ok(InlineFormatSpecV1::new(
                qualified_name(record.kind)?,
                PersistedTypeRevision::try_new(record.revision).map_err(|_| invalid_bootstrap())?,
            ))
        })
        .collect::<Result<Vec<_>, BreditorError>>()?;
    let toggles = record
        .inline_format_toggles
        .into_iter()
        .map(|record| {
            Ok(InlineFormatToggleSpecV1::new(
                qualified_name(record.format_kind)?,
                ActionId::try_new(record.action_id).map_err(|_| invalid_bootstrap())?,
                IntentId::try_new(record.intent_id).map_err(|_| invalid_bootstrap())?,
                BindingId::try_new(record.binding_id).map_err(|_| invalid_bootstrap())?,
                ActionStateId::try_new(record.action_state_id).map_err(|_| invalid_bootstrap())?,
            ))
        })
        .collect::<Result<Vec<_>, BreditorError>>()?;
    ExtensionManifest::try_new_with_inline_formats_and_toggles(
        id,
        dependencies,
        conflicts,
        inline_formats,
        toggles,
    )
    .map_err(|_| profile_compilation())
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
    use super::*;

    const PROFILE: &str = r#"{
      "format":"breditor/profile-bootstrap",
      "formatVersion":1,
      "schema":{"name":"example/editor","version":1},
      "extensions":[{
        "id":{"name":"example/highlight","version":1},
        "dependencies":[],"conflicts":[],
        "inlineFormats":[{"kind":"example/highlight","revision":1}],
        "inlineFormatToggles":[{
          "formatKind":"example/highlight",
          "actionId":"example/toggle-highlight",
          "intentId":"example/toggle-highlight",
          "bindingId":"example/toggle-highlight-primary",
          "actionStateId":"example/control-highlight"
        }]
      }]
    }"#;

    #[test]
    fn decodes_the_complete_profile_request() -> Result<(), BreditorError> {
        let profile = decode_compiled_profile(PROFILE)?;
        assert_eq!(profile.schema().id().name().as_str(), "example/editor");
        assert_eq!(profile.extensions().len(), 1);
        assert_eq!(profile.intent_router().intent_count(), 1);
        assert_eq!(profile.action_state_catalog().len(), 4);
        Ok(())
    }

    #[test]
    fn strict_shape_and_header_fail_closed() {
        for invalid in [
            PROFILE.replace("\"formatVersion\":1", "\"formatVersion\":2"),
            PROFILE.replace("\"extensions\":", "\"unknown\":0,\"extensions\":"),
            PROFILE.replace("\"schema\":", "\"schema\":{},\"schema\":"),
            PROFILE.replace("\"version\":1", "\"version\":0"),
        ] {
            assert_eq!(
                error_code(decode_compiled_profile(&invalid)),
                Some(INVALID_PROFILE_BOOTSTRAP_CODE.to_owned()),
            );
        }
    }

    #[test]
    fn byte_limit_runs_before_parsing() {
        let oversized = " ".repeat(MAX_PROFILE_BOOTSTRAP_JSON_BYTES + 1);
        assert_eq!(
            error_code(decode_compiled_profile(&oversized)),
            Some(PROFILE_BOOTSTRAP_LIMIT_CODE.to_owned()),
        );
    }

    #[test]
    fn exact_byte_limit_is_admitted_and_limit_plus_one_is_rejected_first() {
        let padding = " ".repeat(MAX_PROFILE_BOOTSTRAP_JSON_BYTES - PROFILE.len());
        let exact = format!("{padding}{PROFILE}");
        assert!(decode_compiled_profile(&exact).is_ok());

        let over = format!(" {exact}");
        assert_eq!(
            error_code(decode_compiled_profile(&over)),
            Some(PROFILE_BOOTSTRAP_LIMIT_CODE.to_owned()),
        );
    }

    #[test]
    fn collection_limits_admit_exact_counts_and_reject_limit_plus_one_in_preflight() {
        let limits = ExtensionLimits::default();
        let empty_manifest = preflight_manifest(0, 0, 0, 0);
        assert_preflight_limit_pair(
            &preflight_request(&repeat_entry(&empty_manifest, limits.max_extensions() as usize)),
            &preflight_request(&repeat_entry(
                &empty_manifest,
                limits.max_extensions() as usize + 1,
            )),
        );
        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest(
                limits.max_dependencies_per_manifest() as usize,
                0,
                0,
                0,
            )),
            &preflight_request(&preflight_manifest(
                limits.max_dependencies_per_manifest() as usize + 1,
                0,
                0,
                0,
            )),
        );
        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest(
                0,
                limits.max_conflicts_per_manifest() as usize,
                0,
                0,
            )),
            &preflight_request(&preflight_manifest(
                0,
                limits.max_conflicts_per_manifest() as usize + 1,
                0,
                0,
            )),
        );
        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest(
                0,
                0,
                breditor_core::extension::MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST as usize,
                0,
            )),
            &preflight_request(&preflight_manifest(
                0,
                0,
                breditor_core::extension::MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST as usize + 1,
                0,
            )),
        );
        assert_preflight_limit_pair(
            &preflight_request(&preflight_manifest(
                0,
                0,
                0,
                breditor_core::extension::MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST as usize,
            )),
            &preflight_request(&preflight_manifest(
                0,
                0,
                0,
                breditor_core::extension::MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST as usize
                    + 1,
            )),
        );

        let dependency_manifests = repeat_entry(
            &preflight_manifest(limits.max_dependencies_per_manifest() as usize, 0, 0, 0),
            (limits.max_dependencies() / limits.max_dependencies_per_manifest()) as usize,
        );
        let dependency_over = format!("{dependency_manifests},{}", preflight_manifest(1, 0, 0, 0));
        assert_preflight_limit_pair(
            &preflight_request(&dependency_manifests),
            &preflight_request(&dependency_over),
        );

        let conflict_manifests = repeat_entry(
            &preflight_manifest(0, limits.max_conflicts_per_manifest() as usize, 0, 0),
            (limits.max_conflicts() / limits.max_conflicts_per_manifest()) as usize,
        );
        let conflict_over = format!("{conflict_manifests},{}", preflight_manifest(0, 1, 0, 0));
        assert_preflight_limit_pair(
            &preflight_request(&conflict_manifests),
            &preflight_request(&conflict_over),
        );
    }

    #[test]
    fn eight_mib_is_the_smallest_power_of_two_that_admits_the_widest_exact_fixture() {
        let widest_name = format!("a/{}", "a".repeat(126));
        assert_eq!(widest_name.len(), breditor_core::identity::MAX_QUALIFIED_NAME_BYTES);
        let id = format!(r#"{{"name":"{widest_name}","version":4294967295}}"#);
        let relations = repeat_entry(&id, 256);
        let format = format!(r#"{{"kind":"{widest_name}","revision":4294967295}}"#);
        let formats = repeat_entry(&format, 255);
        let toggle = format!(
            r#"{{"formatKind":"{widest_name}","actionId":"{widest_name}","intentId":"{widest_name}","bindingId":"{widest_name}","actionStateId":"{widest_name}"}}"#,
        );
        let toggles = repeat_entry(&toggle, 255);
        let complete = format!(
            r#"{{"id":{id},"dependencies":[{relations}],"conflicts":[{relations}],"inlineFormats":[{formats}],"inlineFormatToggles":[{toggles}]}}"#,
        );
        let relation_only = format!(
            r#"{{"id":{id},"dependencies":[{relations}],"conflicts":[{relations}],"inlineFormats":[],"inlineFormatToggles":[]}}"#,
        );
        let empty = format!(
            r#"{{"id":{id},"dependencies":[],"conflicts":[],"inlineFormats":[],"inlineFormatToggles":[]}}"#,
        );
        let manifests = format!(
            "{complete},{},{}",
            repeat_entry(&relation_only, 63),
            repeat_entry(&empty, 960),
        );
        let request = preflight_request(&manifests);

        assert!(request.len() > 4 * 1024 * 1024);
        assert!(request.len() <= MAX_PROFILE_BOOTSTRAP_JSON_BYTES);
        assert!(preflight_profile(&request).is_ok());
    }

    fn error_code(result: Result<CompiledEditorProfile, BreditorError>) -> Option<String> {
        result.err().map(|error| error.code())
    }

    fn assert_preflight_limit_pair(exact: &str, over: &str) {
        assert!(exact.len() <= MAX_PROFILE_BOOTSTRAP_JSON_BYTES);
        assert!(over.len() <= MAX_PROFILE_BOOTSTRAP_JSON_BYTES);
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

    fn preflight_manifest(
        dependencies: usize,
        conflicts: usize,
        formats: usize,
        toggles: usize,
    ) -> String {
        format!(
            r#"{{"id":null,"dependencies":[{}],"conflicts":[{}],"inlineFormats":[{}],"inlineFormatToggles":[{}]}}"#,
            repeat_entry("null", dependencies),
            repeat_entry("null", conflicts),
            repeat_entry("null", formats),
            repeat_entry("null", toggles),
        )
    }

    fn repeat_entry(value: &str, count: usize) -> String {
        std::iter::repeat_n(value, count).collect::<Vec<_>>().join(",")
    }
}
