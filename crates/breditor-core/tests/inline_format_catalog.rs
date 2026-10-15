//! Read-only presentation catalogs retain exact schema contracts, not runtime authority.
use breditor_core::{
    codec::{
        INLINE_FORMAT_CATALOG_FORMAT, INLINE_FORMAT_CATALOG_VERSION, encode_inline_format_catalog,
    },
    document::PropertyInteger,
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    schema::{CompiledSchema, PersistedTypeRevision, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn name(value: &str) -> Result<QualifiedName> {
    Ok(QualifiedName::try_new(value)?)
}
fn schema(maximum: u32) -> Result<CompiledSchema> {
    let kind = name("example/link")?;
    let property = |key: &str, presence, value_type| -> Result<InlineFormatPropertySpecV1> {
        Ok(InlineFormatPropertySpecV1::new(name(key)?, presence, value_type))
    };
    let contract = InlineFormatPropertyContractV1::try_new(
        kind.clone(),
        vec![
            property(
                "example/url",
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, maximum)?,
            )?,
            property(
                "example/active",
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::boolean(),
            )?,
            property(
                "example/rank",
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_integer(
                    Some(PropertyInteger::try_new(-3)?),
                    Some(PropertyInteger::try_new(9)?),
                )?,
            )?,
            property(
                "example/unbounded",
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_integer(None, None)?,
            )?,
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind, PersistedTypeRevision::try_new(7)?)],
        vec![contract],
    )?;
    Ok(CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/catalog")?, SchemaVersion::try_new(2)?),
        &ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?,
    )?)
}

#[test]
fn base_catalog_contains_exact_built_in_format_and_durable_binding() -> Result {
    let schema = CompiledSchema::breditor_base();
    let value: Value = serde_json::from_str(&encode_inline_format_catalog(&schema))?;
    assert_eq!(
        value,
        json!({"format":INLINE_FORMAT_CATALOG_FORMAT,"formatVersion":INLINE_FORMAT_CATALOG_VERSION,
        "schema":{"name":"breditor/base","version":1,"fingerprint":schema.fingerprint().to_string()},
        "formats":[{"kind":"breditor/strong","revision":1,"properties":[]}]})
    );
    Ok(())
}

#[test]
fn typed_catalog_retains_order_presence_revisions_and_all_scalar_domains() -> Result {
    let value: Value = serde_json::from_str(&encode_inline_format_catalog(&schema(2048)?))?;
    assert_eq!(
        value["formats"],
        json!([
            {"kind":"breditor/strong","revision":1,"properties":[]},
            {"kind":"example/link","revision":7,"properties":[
                {"name":"example/active","presence":"optional","valueType":{"kind":"boolean"}},
                {"name":"example/rank","presence":"optional","valueType":{"kind":"integer","minimum":-3,"maximum":9}},
                {"name":"example/unbounded","presence":"optional","valueType":{"kind":"integer","minimum":null,"maximum":null}},
                {"name":"example/url","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}}
            ]}
        ])
    );
    Ok(())
}

#[test]
fn catalog_reads_do_not_change_schema_identity_and_independent_compiles_agree() -> Result {
    let first = schema(2048)?;
    let before = first.fingerprint();
    let encoded = encode_inline_format_catalog(&first);
    assert_eq!(encoded, encode_inline_format_catalog(&first));
    assert_eq!(encoded, encode_inline_format_catalog(&schema(2048)?));
    assert_eq!(before, first.fingerprint());
    assert_ne!(encoded, encode_inline_format_catalog(&schema(1024)?));
    Ok(())
}
