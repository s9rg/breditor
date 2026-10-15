//! Original shared-profile configuration, not a document, journal or V6 bootstrap.
use super::{bounded::Bounded, limits::Limits};
use crate::Error;
use breditor_core::{
    document::PropertyInteger,
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    schema::{CompiledSchema, PersistedTypeRevision, SchemaId, SchemaVersion},
};
use serde::{Deserialize, Deserializer};

const MAX_BYTES: usize = 1024 * 1024;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Configuration {
    format: String,
    format_version: u32,
    schema: Identity,
    extensions: Bounded<Extension, 64>,
    #[serde(default)]
    limits: Limits,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    name: String,
    version: u32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Extension {
    id: Identity,
    dependencies: Bounded<Identity, 64>,
    conflicts: Bounded<Identity, 64>,
    formats: Bounded<Format, 255>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Format {
    kind: String,
    revision: u32,
    properties: Bounded<Property, 32>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Property {
    name: String,
    presence: Presence,
    value_type: PropertyType,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Presence {
    Required,
    Optional,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum PropertyType {
    Boolean,
    Integer {
        #[serde(deserialize_with = "nullable_integer")]
        minimum: Option<i64>,
        #[serde(deserialize_with = "nullable_integer")]
        maximum: Option<i64>,
    },
    String {
        #[serde(rename = "minimumUtf8Bytes")]
        minimum_utf8_bytes: u32,
        #[serde(rename = "maximumUtf8Bytes")]
        maximum_utf8_bytes: u32,
    },
}
fn nullable_integer<'de, D: Deserializer<'de>>(d: D) -> Result<Option<i64>, D::Error> {
    Option::<i64>::deserialize(d)
}
fn rejected<T>(_error: T) -> Error {
    Error::Contract("shared profile configuration")
}
fn name(value: String) -> Result<QualifiedName, Error> {
    QualifiedName::try_new(value).map_err(rejected)
}
fn identity(id: Identity) -> Result<ExtensionId, Error> {
    Ok(ExtensionId::new(name(id.name)?, ExtensionVersion::try_new(id.version).map_err(rejected)?))
}
fn property_type(value: PropertyType) -> Result<InlineFormatPropertyTypeV1, Error> {
    match value {
        PropertyType::Boolean => Ok(InlineFormatPropertyTypeV1::boolean()),
        PropertyType::Integer { minimum, maximum } => InlineFormatPropertyTypeV1::try_integer(
            minimum.map(PropertyInteger::try_new).transpose().map_err(rejected)?,
            maximum.map(PropertyInteger::try_new).transpose().map_err(rejected)?,
        )
        .map_err(rejected),
        PropertyType::String { minimum_utf8_bytes, maximum_utf8_bytes } => {
            InlineFormatPropertyTypeV1::try_string(minimum_utf8_bytes, maximum_utf8_bytes)
                .map_err(rejected)
        }
    }
}
fn extension(value: Extension) -> Result<ExtensionManifest, Error> {
    let mut formats = Vec::new();
    let mut contracts = Vec::new();
    for format in value.formats.0 {
        let kind = name(format.kind)?;
        formats.push(InlineFormatSpecV1::new(
            kind.clone(),
            PersistedTypeRevision::try_new(format.revision).map_err(rejected)?,
        ));
        if !format.properties.0.is_empty() {
            let properties = format
                .properties
                .0
                .into_iter()
                .map(|p| {
                    Ok(InlineFormatPropertySpecV1::new(
                        name(p.name)?,
                        match p.presence {
                            Presence::Required => PropertyPresenceV1::Required,
                            Presence::Optional => PropertyPresenceV1::Optional,
                        },
                        property_type(p.value_type)?,
                    ))
                })
                .collect::<Result<Vec<_>, Error>>()?;
            contracts
                .push(InlineFormatPropertyContractV1::try_new(kind, properties).map_err(rejected)?);
        }
    }
    ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        identity(value.id)?,
        value.dependencies.0.into_iter().map(identity).collect::<Result<_, _>>()?,
        value.conflicts.0.into_iter().map(identity).collect::<Result<_, _>>()?,
        formats,
        contracts,
    )
    .map_err(rejected)
}
pub(super) fn compile(
    input: &str,
) -> Result<(CompiledSchema, breditor_core::schema::DocumentLimits), Error> {
    if input.len() > MAX_BYTES {
        return Err(Error::Limit("shared profile JSON bytes"));
    }
    let config: Configuration = serde_json::from_str(input).map_err(rejected)?;
    if config.format != "breditor/shared-rich-profile" || config.format_version != 1 {
        return Err(rejected(()));
    }
    let limits = config.limits.compile()?;
    let id = SchemaId::new(
        name(config.schema.name)?,
        SchemaVersion::try_new(config.schema.version).map_err(rejected)?,
    );
    let extensions = ExtensionSet::try_new(
        config.extensions.0.into_iter().map(extension).collect::<Result<_, _>>()?,
        ExtensionLimits::default(),
    )
    .map_err(rejected)?;
    let schema =
        CompiledSchema::try_compile_rich_content_profile(id, &extensions).map_err(rejected)?;
    Ok((schema, limits))
}
