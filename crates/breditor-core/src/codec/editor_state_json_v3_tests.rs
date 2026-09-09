use std::{error::Error, io};

use serde_json::{Value, json};

use crate::{
    document::{Document, Format, FormatSet, PropertyInteger, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
};

use super::{
    CodecErrorCode, DocumentJsonCodecV2, EditorStateJsonCodecV2,
    editor_state_json_v3::{EDITOR_STATE_V3_FORMAT_VERSION, EditorStateJsonCodecV3},
    editor_state_v3_error::{EditorStateV3CodecError, EditorStateV3PendingFormatErrorCode},
};

const SENTINEL: &str = "example/empty-sentinel";
const LINK: &str = "example/link";
const ENABLED: &str = "example/enabled";
const HREF: &str = "example/href";
const PRIORITY: &str = "example/priority";
const SCHEMA: &str = "example/editor-state-v3";
const SECRET: &str = "top-secret-property-value";

type TestResult = Result<(), Box<dyn Error>>;

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn property_contract(
    format: &str,
    properties: Vec<InlineFormatPropertySpecV1>,
) -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
    InlineFormatPropertyContractV1::try_new(name(format)?, properties).map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    typed_schema_with_link_maximum(64)
}

fn typed_schema_with_link_maximum(
    maximum_link_bytes: u32,
) -> Result<CompiledSchema, Box<dyn Error>> {
    let sentinel = property_contract(
        SENTINEL,
        vec![InlineFormatPropertySpecV1::new(
            name(ENABLED)?,
            PropertyPresenceV1::Optional,
            InlineFormatPropertyTypeV1::boolean(),
        )],
    )?;
    let link = property_contract(
        LINK,
        vec![
            InlineFormatPropertySpecV1::new(
                name(ENABLED)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::boolean(),
            ),
            InlineFormatPropertySpecV1::new(
                name(HREF)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, maximum_link_bytes)?,
            ),
            InlineFormatPropertySpecV1::new(
                name(PRIORITY)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_integer(None, None)?,
            ),
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/editor-state-v3-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![
            InlineFormatSpecV1::new(name(SENTINEL)?, PersistedTypeRevision::one()),
            InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one()),
        ],
        vec![sentinel, link],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name(SCHEMA)?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(typed_schema()?, limits))
}

fn document(context: &EditorContext) -> Result<Document, Box<dyn Error>> {
    let schema = context.schema();
    let json = json!({
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
                "children": [{"kind": "text", "text": "x", "formats": []}],
            }],
        },
    })
    .to_string();
    DocumentJsonCodecV2::new(schema.clone())
        .with_limits(context.limits().clone())
        .decode(&json)
        .map_err(Into::into)
}

fn collapsed_selection() -> Result<Selection, Box<dyn Error>> {
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn sentinel_formats() -> Result<FormatSet, Box<dyn Error>> {
    FormatSet::try_from_formats(vec![Format::new(name(SENTINEL)?, PropertyMap::default())])
        .map_err(Into::into)
}

fn scalar_formats(value: &str) -> Result<FormatSet, Box<dyn Error>> {
    let properties = PropertyMap::try_from_sorted(vec![
        (name(ENABLED)?, PropertyValue::boolean(true)),
        (name(HREF)?, PropertyValue::from_string(value)),
        (name(PRIORITY)?, PropertyValue::from_integer(PropertyInteger::try_new(7)?)),
    ])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK)?, properties)]).map_err(Into::into)
}

fn state(
    context: &EditorContext,
    document: Document,
    pending_formats: FormatSet,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        Some(collapsed_selection()?),
        Some(pending_formats),
    )
    .map_err(Into::into)
}

fn scalar_state(
    context: &EditorContext,
    value: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    state(context, document(context)?, scalar_formats(value)?, lineage)
}

fn decode_error(
    codec: &EditorStateJsonCodecV3,
    json: &str,
) -> Result<EditorStateV3CodecError, Box<dyn Error>> {
    codec
        .decode(json)
        .err()
        .ok_or_else(|| io::Error::other("invalid editor-state V3 unexpectedly decoded").into())
}

fn replace_once(input: &str, from: &str, to: &str) -> Result<String, Box<dyn Error>> {
    let replaced = input.replacen(from, to, 1);
    if replaced == input {
        return Err(io::Error::other(format!("fixture fragment was not found: {from}")).into());
    }
    Ok(replaced)
}

fn assert_preflight_error_without_secrets(
    codec: &EditorStateJsonCodecV3,
    hostile: &str,
    forbidden: &[&str],
) -> TestResult {
    let error = decode_error(codec, hostile)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidJson);
    let diagnostic = error.to_string();
    for value in forbidden {
        assert!(!diagnostic.contains(value), "diagnostic retained `{value}`: {diagnostic}");
    }
    Ok(())
}

#[test]
fn optional_only_contract_is_a_typed_sentinel_and_round_trips_exactly() -> TestResult {
    assert_eq!(EDITOR_STATE_V3_FORMAT_VERSION, 3);
    let context = context(DocumentLimits::default())?;
    let state =
        state(&context, document(&context)?, sentinel_formats()?, "editor-state-v3-sentinel")?;
    let codec = EditorStateJsonCodecV3::new(context.clone());
    assert_eq!(codec.context(), &context);

    let encoded = codec.encode(&state)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["formatVersion"], json!(3));
    assert_eq!(value["document"]["formatVersion"], json!(2));
    assert_eq!(value["pendingFormats"][0]["type"], json!(SENTINEL));
    assert_eq!(value["pendingFormats"][0]["properties"], json!({}));
    let decoded = codec.decode(&encoded)?;
    assert_eq!(decoded, state);
    assert_eq!(codec.encode(&decoded)?, encoded);

    assert!(EditorStateJsonCodecV2::new(context).encode(&state).is_err());
    Ok(())
}

#[test]
fn scalar_properties_selection_and_snapshot_round_trip_exactly() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let state = scalar_state(&context, SECRET, "editor-state-v3-scalars")?;
    let codec = EditorStateJsonCodecV3::new(context);

    let encoded = codec.encode(&state)?;
    let value: Value = serde_json::from_str(&encoded)?;
    let properties = &value["pendingFormats"][0]["properties"];
    assert_eq!(properties[ENABLED], json!(true));
    assert_eq!(properties[HREF], json!(SECRET));
    assert_eq!(properties[PRIORITY], json!(7));
    let decoded = codec.decode(&encoded)?;
    assert_eq!(decoded.snapshot(), state.snapshot());
    assert_eq!(decoded.selection(), state.selection());
    assert_eq!(decoded.pending_formats(), state.pending_formats());
    assert_eq!(codec.encode(&decoded)?, encoded);
    Ok(())
}

#[test]
fn malformed_duplicate_and_out_of_order_property_keys_fail_before_ownership() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = EditorStateJsonCodecV3::new(context.clone());
    let valid = codec.encode(&scalar_state(&context, SECRET, "editor-state-v3-keys")?)?;
    let canonical = format!(r#""{ENABLED}":true,"{HREF}":"{SECRET}","{PRIORITY}":7"#);
    let cases = [
        replace_once(&valid, &canonical, r#""SECRET INVALID":"top-secret-property-value""#)?,
        replace_once(
            &valid,
            &canonical,
            r#""secret/key":"top-secret-property-value","secret/key":"other-secret-value""#,
        )?,
        replace_once(
            &valid,
            &canonical,
            r#""secret/z":"top-secret-property-value","secret/a":"other-secret-value""#,
        )?,
        replace_once(
            &valid,
            &format!(r#""{HREF}":"{SECRET}""#),
            &format!(r#""{HREF}":{{"SECRET INVALID":"{SECRET}"}}"#),
        )?,
        replace_once(
            &valid,
            &format!(r#""properties":{{{canonical}}}"#),
            r#""properties":"SECRET_PROPERTIES_PAYLOAD""#,
        )?,
    ];

    for hostile in cases {
        assert_preflight_error_without_secrets(
            &codec,
            &hostile,
            &["SECRET", "secret/", SECRET, "other-secret-value", "SECRET_PROPERTIES_PAYLOAD"],
        )?;
    }
    Ok(())
}

#[test]
fn unsafe_and_fractional_numbers_fail_with_redacted_json_errors() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = EditorStateJsonCodecV3::new(context.clone());
    let valid = codec.encode(&scalar_state(&context, SECRET, "editor-state-v3-numbers")?)?;
    let needle = format!(r#""{PRIORITY}":7"#);
    for replacement in [
        format!(r#""{PRIORITY}":9007199254740992"#),
        format!(r#""{PRIORITY}":-9007199254740992"#),
        format!(r#""{PRIORITY}":1.5"#),
    ] {
        let hostile = replace_once(&valid, &needle, &replacement)?;
        assert_preflight_error_without_secrets(
            &codec,
            &hostile,
            &["9007199254740992", "1.5", SECRET],
        )?;
    }
    Ok(())
}

#[test]
fn property_depth_count_and_string_limits_are_preflighted() -> TestResult {
    let generous = context(DocumentLimits::default())?;
    let valid = EditorStateJsonCodecV3::new(generous.clone()).encode(&scalar_state(
        &generous,
        SECRET,
        "editor-state-v3-limits",
    )?)?;

    let depth_json = replace_once(
        &valid,
        &format!(r#""{HREF}":"{SECRET}""#),
        &format!(r#""{HREF}":["{SECRET}"]"#),
    )?;
    let limit_cases = [
        (DocumentLimits::default().with_max_formats_per_text(0), valid.as_str()),
        (DocumentLimits::default().with_max_properties_per_owner(2), valid.as_str()),
        (DocumentLimits::default().with_max_property_values(2), valid.as_str()),
        (DocumentLimits::default().with_max_property_depth(0), depth_json.as_str()),
        (
            DocumentLimits::default()
                .with_max_property_string_bytes(4)
                .with_max_total_property_string_bytes(4),
            valid.as_str(),
        ),
    ];

    for (limits, json) in limit_cases {
        let limited = EditorContext::new(generous.schema().clone(), limits);
        assert_preflight_error_without_secrets(
            &EditorStateJsonCodecV3::new(limited),
            json,
            &[SECRET],
        )?;
    }
    Ok(())
}

#[test]
fn schema_contract_failures_are_typed_bounded_and_redacted() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = EditorStateJsonCodecV3::new(context.clone());
    let valid = codec.encode(&scalar_state(&context, SECRET, "editor-state-v3-contract")?)?;
    let sensitive = "SENSITIVE_PROPERTY_PAYLOAD_".repeat(4);
    let hostile = replace_once(
        &valid,
        &format!(r#""{HREF}":"{SECRET}""#),
        &format!(r#""{HREF}":"{sensitive}""#),
    )?;

    let error = decode_error(&codec, &hostile)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidEditorState);
    let EditorStateV3CodecError::InvalidPendingFormats(source) = error else {
        return Err(io::Error::other("expected typed pending-format error").into());
    };
    assert_eq!(source.code(), EditorStateV3PendingFormatErrorCode::InvalidFormatInstance);
    assert_eq!(source.format_index(), Some(0));
    assert!(!source.to_string().contains(HREF));
    assert!(!source.to_string().contains("SENSITIVE_PROPERTY_PAYLOAD"));
    Ok(())
}

#[test]
fn selector_and_fingerprint_mismatches_fail_before_nested_state_decode() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = EditorStateJsonCodecV3::new(context.clone());
    let valid = codec.encode(&scalar_state(&context, SECRET, "editor-state-v3-binding")?)?;

    let wrong_schema = replace_once(
        &valid,
        &format!(r#""name":"{SCHEMA}""#),
        r#""name":"example/other-state-schema""#,
    )?;
    assert_eq!(decode_error(&codec, &wrong_schema)?.code(), CodecErrorCode::SchemaMismatch);

    let fingerprint = context.schema().fingerprint().to_string();
    let wrong_fingerprint = typed_schema_with_link_maximum(63)?.fingerprint().to_string();
    assert_ne!(wrong_fingerprint, fingerprint);
    let wrong_binding = replace_once(&valid, &fingerprint, &wrong_fingerprint)?;
    assert_eq!(decode_error(&codec, &wrong_binding)?.code(), CodecErrorCode::SchemaMismatch);
    Ok(())
}

#[test]
fn encode_and_decode_share_the_exact_same_utf8_byte_ceiling() -> TestResult {
    let generous = context(DocumentLimits::default())?;
    let generous_state = scalar_state(&generous, SECRET, "editor-state-v3-bytes")?;
    let encoded = EditorStateJsonCodecV3::new(generous.clone()).encode(&generous_state)?;
    let exact_size = encoded.len();

    let exact_context = EditorContext::new(
        generous.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(exact_size),
    );
    let exact_state = state(
        &exact_context,
        generous_state.document().clone(),
        scalar_formats(SECRET)?,
        "editor-state-v3-bytes",
    )?;
    let exact_codec = EditorStateJsonCodecV3::new(exact_context);
    assert_eq!(exact_codec.encode(&exact_state)?, encoded);
    assert_eq!(exact_codec.decode(&encoded)?, exact_state);

    let tight_context = EditorContext::new(
        generous.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(exact_size - 1),
    );
    let tight_state = state(
        &tight_context,
        generous_state.document().clone(),
        scalar_formats(SECRET)?,
        "editor-state-v3-bytes",
    )?;
    let tight_codec = EditorStateJsonCodecV3::new(tight_context);
    assert!(matches!(
        tight_codec.encode(&tight_state),
        Err(EditorStateV3CodecError::OutputTooLarge { maximum, .. }) if maximum == exact_size - 1
    ));
    assert!(matches!(
        tight_codec.decode(&encoded),
        Err(EditorStateV3CodecError::InputTooLarge { actual, maximum })
            if actual == exact_size && maximum == exact_size - 1
    ));
    Ok(())
}
