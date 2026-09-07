//! Public contracts for sealed property-free inline-format schema profiles.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{DocumentCodecError, DocumentJsonCodec, DocumentJsonCodecV2, DocumentV2CodecError},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1, MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST,
    },
    identity::QualifiedName,
    schema::{
        CompiledSchema, MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS, PersistedTypeRevision,
        SchemaCompilationError, SchemaId, SchemaVersion, ValidationCode,
    },
};
use serde_json::{Value, json};
use support::TestResult;

fn extension_id(name: &str, version: u32) -> Result<ExtensionId, Box<dyn Error>> {
    Ok(ExtensionId::new(QualifiedName::try_new(name)?, ExtensionVersion::try_new(version)?))
}

fn schema_id(name: &str, version: u32) -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(QualifiedName::try_new(name)?, SchemaVersion::try_new(version)?))
}

fn format_spec(kind: &str, revision: u32) -> Result<InlineFormatSpecV1, Box<dyn Error>> {
    Ok(InlineFormatSpecV1::new(
        QualifiedName::try_new(kind)?,
        PersistedTypeRevision::try_new(revision)?,
    ))
}

fn manifest(
    owner: ExtensionId,
    formats: Vec<InlineFormatSpecV1>,
) -> Result<ExtensionManifest, Box<dyn Error>> {
    ExtensionManifest::try_new_with_inline_formats(owner, Vec::new(), Vec::new(), formats)
        .map_err(Into::into)
}

fn extension_set(manifests: Vec<ExtensionManifest>) -> Result<ExtensionSet, Box<dyn Error>> {
    ExtensionSet::try_new(manifests, ExtensionLimits::default()).map_err(Into::into)
}

fn profile(
    schema_name: &str,
    owner_name: &str,
    owner_version: u32,
    formats: &[(&str, u32)],
) -> Result<CompiledSchema, Box<dyn Error>> {
    let formats = formats
        .iter()
        .map(|(kind, revision)| format_spec(kind, *revision))
        .collect::<Result<Vec<_>, _>>()?;
    let set = extension_set(vec![manifest(extension_id(owner_name, owner_version)?, formats)?])?;
    CompiledSchema::try_compile_base_text_profile(schema_id(schema_name, 1)?, &set)
        .map_err(Into::into)
}

fn document_v2(schema: &CompiledSchema, format_kind: &str, properties: &Value) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": schema.id().name().as_str(),
            "version": schema.id().version().get(),
        },
        "schemaFingerprint": schema.fingerprint().to_string(),
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": [{
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": [{
                    "kind": "text",
                    "text": "alpha",
                    "formats": [{"type": format_kind, "properties": properties}],
                }],
            }],
        },
    })
    .to_string()
}

#[test]
fn public_manifest_to_schema_to_document_v2_path_is_complete() -> TestResult {
    let schema = profile(
        "example/editor-profile",
        "example/emphasis-extension",
        7,
        &[("example/emphasis", 3)],
    )?;
    let emphasis = QualifiedName::try_new("example/emphasis")?;
    assert_eq!(schema.id().to_string(), "example/editor-profile@1");
    assert_eq!(
        schema.fingerprint().to_string(),
        "sha256:3d3fce00be80c1c79d7528502a015724541fbe5f16d37768662e04cfcdbadb54"
    );
    assert!(schema.is_property_free_inline_format(&emphasis));
    assert!(schema.is_property_free_inline_format(&QualifiedName::try_new("breditor/strong")?));
    assert!(!schema.is_property_free_inline_format(&QualifiedName::try_new("example/missing")?));

    let codec = DocumentJsonCodecV2::new(schema.clone());
    let document = codec.decode(&document_v2(&schema, "example/emphasis", &json!({})))?;
    let encoded = codec.encode(&document)?;
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);

    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| support::test_error("profile document lost its paragraph"))?;
    let text = paragraph
        .children()
        .get(0)
        .and_then(breditor_core::document::NodeRef::as_text)
        .ok_or_else(|| support::test_error("profile document lost its text"))?;
    assert!(text.formats().get(&emphasis).is_some());
    Ok(())
}

#[test]
fn unknown_and_property_bearing_formats_fail_complete_validation() -> TestResult {
    let schema = profile(
        "example/validation-profile",
        "example/format-extension",
        1,
        &[("example/emphasis", 1)],
    )?;
    let codec = DocumentJsonCodecV2::new(schema.clone());

    let Err(DocumentV2CodecError::Validation(unknown)) =
        codec.decode(&document_v2(&schema, "example/unknown", &json!({})))
    else {
        return Err(support::test_error("unknown format did not fail validation").into());
    };
    assert!(unknown.contains(ValidationCode::UnknownFormat));

    let Err(DocumentV2CodecError::Validation(properties)) =
        codec.decode(&document_v2(&schema, "example/emphasis", &json!({"example/value": true})))
    else {
        return Err(support::test_error("format properties did not fail validation").into());
    };
    assert!(properties.contains(ValidationCode::PropertiesNotAllowed));
    Ok(())
}

#[test]
fn declaration_order_owner_and_extension_version_do_not_change_content_identity() -> TestResult {
    let alpha = format_spec("example/alpha", 2)?;
    let zeta = format_spec("example/zeta", 9)?;
    let first_set = extension_set(vec![manifest(
        extension_id("example/first-owner", 1)?,
        vec![zeta.clone(), alpha.clone()],
    )?])?;
    let second_set = extension_set(vec![manifest(
        extension_id("example/renamed-owner", 99)?,
        vec![alpha, zeta],
    )?])?;
    let id = schema_id("example/deterministic-profile", 4)?;
    let first = CompiledSchema::try_compile_base_text_profile(id.clone(), &first_set)?;
    let second = CompiledSchema::try_compile_base_text_profile(id, &second_set)?;

    assert_eq!(first, second);
    assert_eq!(first.fingerprint(), second.fingerprint());

    let changed_revision = profile(
        "example/deterministic-profile",
        "example/first-owner",
        1,
        &[("example/alpha", 3), ("example/zeta", 9)],
    )?;
    let changed_kind = profile(
        "example/deterministic-profile",
        "example/first-owner",
        1,
        &[("example/beta", 2), ("example/zeta", 9)],
    )?;
    let changed_schema_id = CompiledSchema::try_compile_base_text_profile(
        schema_id("example/another-profile", 4)?,
        &first_set,
    )?;
    assert_ne!(first.fingerprint(), changed_revision.fingerprint());
    assert_ne!(first.fingerprint(), changed_kind.fingerprint());
    assert_ne!(first.fingerprint(), changed_schema_id.fingerprint());
    Ok(())
}

#[test]
fn reserved_and_duplicate_ownership_errors_are_canonical() -> TestResult {
    let empty = extension_set(Vec::new())?;
    assert_eq!(
        CompiledSchema::try_compile_base_text_profile(schema_id("breditor/base", 1)?, &empty),
        Err(SchemaCompilationError::ReservedSchemaName {
            name: QualifiedName::try_new("breditor/base")?,
        })
    );

    let reserved_owner = extension_set(vec![manifest(
        extension_id("breditor/extension", 1)?,
        vec![format_spec("example/format", 1)?],
    )?])?;
    assert!(matches!(
        CompiledSchema::try_compile_base_text_profile(
            schema_id("example/profile", 1)?,
            &reserved_owner,
        ),
        Err(SchemaCompilationError::ReservedExtensionName { .. })
    ));

    let first_owner = extension_id("example/alpha-owner", 1)?;
    let second_owner = extension_id("example/zeta-owner", 2)?;
    let duplicate = extension_set(vec![
        manifest(first_owner.clone(), vec![format_spec("example/shared", 1)?])?,
        manifest(second_owner.clone(), vec![format_spec("example/shared", 8)?])?,
    ])?;
    assert_eq!(
        CompiledSchema::try_compile_base_text_profile(schema_id("example/profile", 1)?, &duplicate,),
        Err(SchemaCompilationError::DuplicateInlineFormat {
            kind: QualifiedName::try_new("example/shared")?,
            first_owner,
            second_owner,
        })
    );

    let reserved_format_owner = extension_id("example/owner", 1)?;
    let reserved_format = extension_set(vec![manifest(
        reserved_format_owner.clone(),
        vec![format_spec("breditor/strong", 1)?],
    )?])?;
    assert_eq!(
        CompiledSchema::try_compile_base_text_profile(
            schema_id("example/profile", 1)?,
            &reserved_format,
        ),
        Err(SchemaCompilationError::ReservedInlineFormatName {
            kind: QualifiedName::try_new("breditor/strong")?,
            owner: reserved_format_owner,
        })
    );

    let duplicate_reserved = extension_set(vec![
        manifest(extension_id("example/alpha", 1)?, vec![format_spec("breditor/strong", 1)?])?,
        manifest(extension_id("example/zeta", 1)?, vec![format_spec("breditor/strong", 2)?])?,
    ])?;
    assert!(matches!(
        CompiledSchema::try_compile_base_text_profile(
            schema_id("example/profile", 1)?,
            &duplicate_reserved,
        ),
        Err(SchemaCompilationError::DuplicateInlineFormat { kind, .. })
            if kind.as_str() == "breditor/strong"
    ));
    Ok(())
}

#[test]
fn aggregate_format_limit_counts_builtin_strong_separately() -> TestResult {
    assert_eq!(MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST, 255);
    assert_eq!(MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS, 255);

    let formats = (0..MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS)
        .map(|index| format_spec(&format!("example/format-{index}"), 1))
        .collect::<Result<Vec<_>, _>>()?;
    let exact_set =
        extension_set(vec![manifest(extension_id("example/exact-owner", 1)?, formats)?])?;
    let exact = CompiledSchema::try_compile_base_text_profile(
        schema_id("example/exact-profile", 1)?,
        &exact_set,
    )?;
    assert!(exact.is_property_free_inline_format(&QualifiedName::try_new("example/format-254")?));

    let left = (0..128)
        .map(|index| format_spec(&format!("example/left-{index}"), 1))
        .collect::<Result<Vec<_>, _>>()?;
    let right = (0..128)
        .map(|index| format_spec(&format!("example/right-{index}"), 1))
        .collect::<Result<Vec<_>, _>>()?;
    let too_many = extension_set(vec![
        manifest(extension_id("example/left-owner", 1)?, left)?,
        manifest(extension_id("example/right-owner", 1)?, right)?,
    ])?;
    assert_eq!(
        CompiledSchema::try_compile_base_text_profile(
            schema_id("example/overflow-profile", 1)?,
            &too_many,
        ),
        Err(SchemaCompilationError::TooManyInlineFormats {
            actual: 256,
            maximum: MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS,
        })
    );
    Ok(())
}

#[test]
fn legacy_document_v1_rejects_an_extension_profile() -> TestResult {
    let schema = profile(
        "example/v2-only-profile",
        "example/v2-only-extension",
        1,
        &[("example/emphasis", 1)],
    )?;
    let v1 = DocumentJsonCodec::new(schema);
    let input = support::minimal_document_json();
    assert!(matches!(v1.decode(&input), Err(DocumentCodecError::SchemaMismatch { .. })));
    Ok(())
}
