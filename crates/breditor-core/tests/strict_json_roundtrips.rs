//! Black-box conformance tests for the strict versioned JSON boundary.

mod support;

use breditor_core::{
    codec::{CodecErrorCode, DocumentCodecError},
    schema::{ValidationCode, ValidationSubject},
};
use serde_json::Value;
use support::{
    TestResult, assert_codec_error_code, assert_validation_issue, codec, document_json,
    minimal_document_json, paragraph, text_node,
};

const CANONICAL_EMPTY_DOCUMENT: &str = concat!(
    r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}}"#,
);

fn document_with_root_properties(properties: &str) -> String {
    [
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":"#,
        properties,
        r#","children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}]}}"#,
    ]
    .concat()
}

#[test]
fn canonical_documents_round_trip_to_stable_compact_json() -> TestResult {
    let codec = codec();
    let document = codec.decode(CANONICAL_EMPTY_DOCUMENT)?;
    let encoded = codec.encode(&document)?;
    assert_eq!(encoded, CANONICAL_EMPTY_DOCUMENT);
    assert_eq!(codec.decode(&encoded)?, document);
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);

    let pretty_input = serde_json::to_string_pretty(&serde_json::from_str::<Value>(&encoded)?)?;
    assert_eq!(codec.encode(&codec.decode(&pretty_input)?)?, encoded);
    Ok(())
}

#[test]
fn unicode_content_round_trips_byte_for_byte_without_normalization() -> TestResult {
    let input = document_json(&[paragraph(&[text_node("é", false), text_node("e\u{301}", true)])]);
    let codec = codec();
    let document = codec.decode(&input)?;
    let encoded = codec.encode(&document)?;
    let decoded_again = codec.decode(&encoded)?;
    assert_eq!(decoded_again, document);
    assert!(encoded.contains("é"));
    assert!(encoded.contains("e\u{301}"));
    Ok(())
}

#[test]
fn envelope_and_record_shape_fail_closed() -> TestResult {
    let minimal = minimal_document_json();
    let wrong_format = minimal.replacen("breditor/document", "other/document", 1);
    assert_codec_error_code(&wrong_format, CodecErrorCode::UnsupportedFormat)?;

    let wrong_version = minimal.replacen(r#""formatVersion":1"#, r#""formatVersion":2"#, 1);
    assert_codec_error_code(&wrong_version, CodecErrorCode::UnsupportedFormatVersion)?;

    let invalid_schema_version = minimal.replacen(
        r#""name":"breditor/base","version":1"#,
        r#""name":"breditor/base","version":0"#,
        1,
    );
    assert_codec_error_code(&invalid_schema_version, CodecErrorCode::InvalidSchemaVersion)?;

    let schema_mismatch = minimal.replacen("breditor/base", "other/base", 1);
    assert_codec_error_code(&schema_mismatch, CodecErrorCode::SchemaMismatch)?;

    let unknown_field = minimal.replacen(r#""root":"#, r#""unknown":true,"root":"#, 1);
    assert_codec_error_code(&unknown_field, CodecErrorCode::InvalidJson)?;

    let mut missing_root_entity_id = serde_json::from_str::<Value>(&minimal)?;
    let Some(root) = missing_root_entity_id.get_mut("root").and_then(Value::as_object_mut) else {
        return Err("minimal fixture has no root object".into());
    };
    if root.remove("entityId").is_none() {
        return Err("minimal fixture root has no entityId".into());
    }
    assert_codec_error_code(
        &serde_json::to_string(&missing_root_entity_id)?,
        CodecErrorCode::InvalidJson,
    )?;

    let mut missing_nested_entity_id = serde_json::from_str::<Value>(&minimal)?;
    let Some(paragraph) = missing_nested_entity_id
        .get_mut("root")
        .and_then(|root| root.get_mut("children"))
        .and_then(Value::as_array_mut)
        .and_then(|children| children.first_mut())
        .and_then(Value::as_object_mut)
    else {
        return Err("minimal fixture has no paragraph object".into());
    };
    if paragraph.remove("entityId").is_none() {
        return Err("minimal fixture paragraph has no entityId".into());
    }
    assert_codec_error_code(
        &serde_json::to_string(&missing_nested_entity_id)?,
        CodecErrorCode::InvalidJson,
    )?;

    let duplicate_format = minimal.replacen(
        r#""format":"breditor/document""#,
        r#""format":"breditor/document","format":"breditor/document""#,
        1,
    );
    assert_codec_error_code(&duplicate_format, CodecErrorCode::InvalidJson)?;
    Ok(())
}

#[test]
fn property_json_requires_sorted_unique_keys_and_exact_numbers() -> TestResult {
    assert_codec_error_code(
        &document_with_root_properties(r#"{"breditor/value":1,"breditor/value":2}"#),
        CodecErrorCode::InvalidJson,
    )?;
    assert_codec_error_code(
        &document_with_root_properties(r#"{"breditor/z":null,"breditor/a":null}"#),
        CodecErrorCode::InvalidJson,
    )?;
    assert_codec_error_code(
        &document_with_root_properties(r#"{"breditor/value":{"z":null,"a":null}}"#),
        CodecErrorCode::InvalidJson,
    )?;
    assert_codec_error_code(
        &document_with_root_properties(r#"{"breditor/value":1.5}"#),
        CodecErrorCode::InvalidJson,
    )?;
    assert_codec_error_code(
        &document_with_root_properties(r#"{"breditor/value":9007199254740992}"#),
        CodecErrorCode::InvalidJson,
    )?;
    assert_codec_error_code(
        &document_with_root_properties(r#"{"breditor/value":-9007199254740992}"#),
        CodecErrorCode::InvalidJson,
    )?;
    Ok(())
}

#[test]
fn malformed_unicode_and_noncanonical_formats_are_rejected() -> TestResult {
    let unpaired_surrogate = concat!(
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":["#,
        r#"{"kind":"text","text":"\uD800","formats":[]}"#,
        r#"]}]}}"#,
    );
    assert_codec_error_code(unpaired_surrogate, CodecErrorCode::InvalidJson)?;

    let duplicate_strong = document_json(&[paragraph(&[serde_json::json!({
        "kind": "text",
        "text": "duplicate",
        "formats": [
            { "type": "breditor/strong", "properties": {} },
            { "type": "breditor/strong", "properties": {} },
        ],
    })])]);
    assert_validation_issue(&duplicate_strong, ValidationCode::DuplicateFormat, &[0, 0])?;

    let noncanonical_order = document_json(&[paragraph(&[serde_json::json!({
        "kind": "text",
        "text": "order",
        "formats": [
            { "type": "breditor/strong", "properties": {} },
            { "type": "breditor/a", "properties": {} },
        ],
    })])]);
    assert_validation_issue(&noncanonical_order, ValidationCode::NonCanonicalFormatOrder, &[0, 0])?;

    let invalid_then_duplicate = document_json(&[paragraph(&[serde_json::json!({
        "kind": "text",
        "text": "diagnostic index",
        "formats": [
            { "type": "Invalid", "properties": {} },
            { "type": "breditor/strong", "properties": {} },
            { "type": "breditor/strong", "properties": {} },
        ],
    })])]);
    let Err(DocumentCodecError::Validation(report)) = codec().decode(&invalid_then_duplicate)
    else {
        return Err("mixed invalid formats did not produce a validation report".into());
    };
    assert!(report.iter().any(|issue| {
        issue.code() == ValidationCode::DuplicateFormat
            && matches!(issue.subject(), ValidationSubject::Format { index: 2 })
    }));
    Ok(())
}

#[test]
fn validation_errors_keep_their_typed_report() -> TestResult {
    let invalid = document_json(&[paragraph(&[text_node("", false)])]);
    let Err(error) = codec().decode(&invalid) else {
        return Err("empty text unexpectedly decoded".into());
    };
    assert_eq!(error.code(), CodecErrorCode::ValidationFailed);
    let DocumentCodecError::Validation(report) = error else {
        return Err("validation failure did not retain its report".into());
    };
    assert!(report.contains(ValidationCode::EmptyText));
    assert_eq!(report.issue_count(), 1);
    Ok(())
}
