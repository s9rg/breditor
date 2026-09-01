//! Adversarial black-box contracts for the complete editor-state JSON boundary.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentCodecError, DocumentJsonCodec, EDITOR_STATE_FORMAT,
        EDITOR_STATE_FORMAT_VERSION, EditorStateCodecError, EditorStateJsonCodec,
        EditorStateRecordErrorCode, EditorStateRecordLocation, MAX_DIAGNOSTIC_PREVIEW_BYTES,
    },
    document::{FormatSet, NodeLookupError},
    position::{MAX_PATH_DEPTH, PointError},
    schema::{CompiledSchema, DocumentLimits, ValidationCode},
    selection::{RangeEndpoint, SelectionEndpointRule, SelectionError},
    state::{
        EditorContext, EditorState, EditorStateError, LineageId, MAX_LINEAGE_ID_BYTES, Revision,
    },
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, minimal_document_json, paragraph, test_error, text_node};

fn checkpoint_value(document: &str) -> Result<Value, Box<dyn Error>> {
    let document = serde_json::from_str::<Value>(document)?;
    Ok(json!({
        "format": EDITOR_STATE_FORMAT,
        "formatVersion": EDITOR_STATE_FORMAT_VERSION,
        "snapshot": {"lineage": "security-state", "revision": "0"},
        "document": document,
        "selection": null,
        "pendingFormats": null,
    }))
}

fn checkpoint_json(document: &str) -> Result<String, Box<dyn Error>> {
    serde_json::to_string(&checkpoint_value(document)?).map_err(Into::into)
}

fn rejected(
    codec: &EditorStateJsonCodec,
    encoded: &str,
) -> Result<EditorStateCodecError, Box<dyn Error>> {
    match codec.decode(encoded) {
        Ok(_) => Err(test_error("invalid editor-state JSON unexpectedly decoded").into()),
        Err(error) => Ok(error),
    }
}

fn assert_invalid_json(codec: &EditorStateJsonCodec, encoded: &str) -> TestResult {
    let error = rejected(codec, encoded)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidJson, "unexpected error: {error}");
    Ok(())
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, Box<dyn Error>> {
    value.as_object_mut().ok_or_else(|| test_error("fixture value is not an object").into())
}

fn replace_once(input: &str, from: &str, to: &str) -> Result<String, Box<dyn Error>> {
    if !input.contains(from) {
        return Err(
            test_error(format!("fixture does not contain replacement target {from:?}")).into()
        );
    }
    Ok(input.replacen(from, to, 1))
}

fn text_point(path: Vec<u32>, offset: u32) -> Value {
    Value::Object(Map::from_iter([
        ("kind".to_owned(), json!("text")),
        ("textPath".to_owned(), Value::Array(path.into_iter().map(Value::from).collect())),
        ("utf16Offset".to_owned(), Value::from(offset)),
        ("affinity".to_owned(), json!("before")),
    ]))
}

fn children_point(path: Vec<u32>, index: u32) -> Value {
    Value::Object(Map::from_iter([
        ("kind".to_owned(), json!("children")),
        ("parentPath".to_owned(), Value::Array(path.into_iter().map(Value::from).collect())),
        ("childIndex".to_owned(), Value::from(index)),
        ("affinity".to_owned(), json!("before")),
    ]))
}

fn range(anchor: Value, focus: Value) -> Value {
    Value::Object(Map::from_iter([
        ("kind".to_owned(), json!("range")),
        ("anchor".to_owned(), anchor),
        ("focus".to_owned(), focus),
    ]))
}

fn collapsed_text_selection() -> Value {
    let point = text_point(vec![0, 0], 0);
    range(point.clone(), point)
}

fn strong_format() -> Value {
    json!({"type": "breditor/strong", "properties": {}})
}

fn text_document(text: &str) -> String {
    document_json(&[paragraph(&[text_node(text, false)])])
}

#[test]
fn envelope_is_exact_and_nullable_fields_are_required() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = text_document("a");
    let baseline = checkpoint_value(&document)?;
    let decoded = codec.decode(&serde_json::to_string(&baseline)?)?;
    assert!(decoded.selection().is_none());
    assert!(decoded.pending_formats().is_none());

    for missing in ["snapshot", "document", "selection", "pendingFormats"] {
        let mut value = baseline.clone();
        object_mut(&mut value)?.remove(missing);
        assert_invalid_json(&codec, &serde_json::to_string(&value)?)?;
    }

    let mut unknown = baseline.clone();
    object_mut(&mut unknown)?.insert("history".to_owned(), Value::Null);
    assert_invalid_json(&codec, &serde_json::to_string(&unknown)?)?;

    let encoded = serde_json::to_string(&baseline)?;
    for (needle, replacement) in [
        (
            format!(r#""format":"{EDITOR_STATE_FORMAT}""#),
            format!(r#""format":"{EDITOR_STATE_FORMAT}","format":"{EDITOR_STATE_FORMAT}""#),
        ),
        (r#""selection":null"#.to_owned(), r#""selection":null,"selection":null"#.to_owned()),
        (
            r#""pendingFormats":null"#.to_owned(),
            r#""pendingFormats":null,"pendingFormats":null"#.to_owned(),
        ),
    ] {
        assert_invalid_json(&codec, &replace_once(&encoded, &needle, &replacement)?)?;
    }

    let mut wrong_selection_type = baseline.clone();
    wrong_selection_type["selection"] = Value::Bool(false);
    assert_invalid_json(&codec, &serde_json::to_string(&wrong_selection_type)?)?;

    let mut wrong_pending_type = baseline.clone();
    wrong_pending_type["pendingFormats"] = json!({});
    assert_invalid_json(&codec, &serde_json::to_string(&wrong_pending_type)?)?;

    let mut null_snapshot = baseline.clone();
    null_snapshot["snapshot"] = Value::Null;
    assert_invalid_json(&codec, &serde_json::to_string(&null_snapshot)?)?;

    let mut null_document = baseline;
    null_document["document"] = Value::Null;
    match rejected(&codec, &serde_json::to_string(&null_document)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::InvalidJson(_)) => {}
        other => {
            return Err(test_error(format!(
                "expected nested document JSON failure for null, got {other}"
            ))
            .into());
        }
    }
    Ok(())
}

#[test]
fn routing_precedence_is_format_then_version_then_exact_v1_shape() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let baseline = checkpoint_value(&minimal_document_json())?;

    let mut wrong_format = baseline.clone();
    wrong_format["format"] = json!("other/editor-state");
    wrong_format["formatVersion"] = json!(99);
    object_mut(&mut wrong_format)?.remove("snapshot");
    object_mut(&mut wrong_format)?.insert("future".to_owned(), Value::Bool(true));
    match rejected(&codec, &serde_json::to_string(&wrong_format)?)? {
        EditorStateCodecError::UnsupportedFormat { expected: EDITOR_STATE_FORMAT, .. } => {}
        other => return Err(test_error(format!("expected format precedence, got {other}")).into()),
    }

    let mut wrong_version = baseline.clone();
    wrong_version["formatVersion"] = json!(99);
    object_mut(&mut wrong_version)?.remove("snapshot");
    object_mut(&mut wrong_version)?.insert("future".to_owned(), Value::Bool(true));
    match rejected(&codec, &serde_json::to_string(&wrong_version)?)? {
        EditorStateCodecError::UnsupportedFormatVersion { found: 99, supported: 1 } => {}
        other => {
            return Err(test_error(format!("expected version precedence, got {other}")).into());
        }
    }

    let mut selected_v1 = baseline;
    object_mut(&mut selected_v1)?.remove("selection");
    assert_invalid_json(&codec, &serde_json::to_string(&selected_v1)?)?;

    let incomplete =
        format!(r#"{{"format":"{EDITOR_STATE_FORMAT}","formatVersion":99,"snapshot":{{"#);
    assert_invalid_json(&codec, &incomplete)?;
    Ok(())
}

#[test]
fn snapshot_object_is_exact_and_decimal_revision_is_strict_and_typed() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = minimal_document_json();
    let baseline = checkpoint_value(&document)?;

    let mut maximum = baseline.clone();
    maximum["snapshot"]["revision"] = json!(u64::MAX.to_string());
    let decoded = codec.decode(&serde_json::to_string(&maximum)?)?;
    assert_eq!(decoded.snapshot().revision(), Revision::new(u64::MAX));

    for invalid in ["", "00", "01", "+1", "-1", "1.0", " 1", "18446744073709551616"] {
        let mut value = baseline.clone();
        value["snapshot"]["revision"] = json!(invalid);
        match rejected(&codec, &serde_json::to_string(&value)?)? {
            EditorStateCodecError::InvalidEditorState(source) => {
                assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidSnapshotRevision);
                assert_eq!(source.location(), EditorStateRecordLocation::SnapshotRevision);
            }
            other => {
                return Err(test_error(format!(
                    "expected typed invalid revision for {invalid:?}, got {other}"
                ))
                .into());
            }
        }
    }

    for invalid in [json!(0), Value::Null, json!(1.0), Value::Bool(false)] {
        let mut value = baseline.clone();
        value["snapshot"]["revision"] = invalid;
        assert_invalid_json(&codec, &serde_json::to_string(&value)?)?;
    }

    for lineage in [
        String::new(),
        "-bad-start".to_owned(),
        "bad lineage".to_owned(),
        "x".repeat(MAX_LINEAGE_ID_BYTES + 1),
    ] {
        let mut value = baseline.clone();
        value["snapshot"]["lineage"] = json!(lineage);
        match rejected(&codec, &serde_json::to_string(&value)?)? {
            EditorStateCodecError::InvalidEditorState(source) => {
                assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidSnapshotLineage);
                assert_eq!(source.location(), EditorStateRecordLocation::SnapshotLineage);
                assert!(source.diagnostic().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
            }
            other => {
                return Err(
                    test_error(format!("expected typed invalid lineage, got {other}")).into()
                );
            }
        }
    }

    for mutation in [
        json!({"lineage": "security-state"}),
        json!({"revision": "0"}),
        json!({"lineage": "security-state", "revision": "0", "extra": null}),
    ] {
        let mut value = baseline.clone();
        value["snapshot"] = mutation;
        assert_invalid_json(&codec, &serde_json::to_string(&value)?)?;
    }

    let encoded = serde_json::to_string(&baseline)?;
    let duplicate =
        replace_once(&encoded, r#""revision":"0""#, r#""revision":"0","revision":"0""#)?;
    assert_invalid_json(&codec, &duplicate)?;
    Ok(())
}

#[test]
fn nested_document_keeps_its_own_strict_routing_schema_and_validation_boundary() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let valid_document = text_document("a");
    let encoded = checkpoint_json(&valid_document)?;

    let duplicate_envelope = replace_once(
        &encoded,
        r#""format":"breditor/document""#,
        r#""format":"breditor/document","format":"breditor/document""#,
    )?;
    match rejected(&codec, &duplicate_envelope)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::InvalidJson(_)) => {}
        other => {
            return Err(test_error(format!(
                "expected nested duplicate-field JSON failure, got {other}"
            ))
            .into());
        }
    }

    let duplicate_schema = replace_once(
        &encoded,
        r#""name":"breditor/base""#,
        r#""name":"breditor/base","name":"breditor/base""#,
    )?;
    match rejected(&codec, &duplicate_schema)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::InvalidJson(_)) => {}
        other => {
            return Err(test_error(format!("expected strict nested schema, got {other}")).into());
        }
    }

    let duplicate_node = replace_once(&encoded, r#""text":"a""#, r#""text":"a","text":"a""#)?;
    match rejected(&codec, &duplicate_node)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::InvalidJson(_)) => {}
        other => {
            return Err(test_error(format!("expected strict nested node, got {other}")).into());
        }
    }

    let baseline = checkpoint_value(&valid_document)?;
    let mut wrong_format = baseline.clone();
    wrong_format["document"]["format"] = json!("other/document");
    wrong_format["document"]["formatVersion"] = json!(99);
    wrong_format["document"]["root"] = Value::Null;
    match rejected(&codec, &serde_json::to_string(&wrong_format)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::UnsupportedFormat {
            ..
        }) => {}
        other => {
            return Err(
                test_error(format!("expected nested format precedence, got {other}")).into()
            );
        }
    }

    let mut wrong_version = baseline.clone();
    wrong_version["document"]["formatVersion"] = json!(2);
    wrong_version["document"]["root"] = Value::Null;
    match rejected(&codec, &serde_json::to_string(&wrong_version)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::UnsupportedFormatVersion {
            found: 2,
            supported: 1,
        }) => {}
        other => {
            return Err(
                test_error(format!("expected nested version precedence, got {other}")).into()
            );
        }
    }

    let mut schema_mismatch = baseline;
    schema_mismatch["document"]["schema"]["name"] = json!("test/other");
    schema_mismatch["document"]["root"] = Value::Null;
    match rejected(&codec, &serde_json::to_string(&schema_mismatch)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::SchemaMismatch { .. }) => {}
        other => {
            return Err(test_error(format!("expected schema before root, got {other}")).into());
        }
    }

    let invalid_document = text_document("");
    match rejected(&codec, &checkpoint_json(&invalid_document)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::Validation(report)) => {
            assert!(report.contains(ValidationCode::EmptyText));
        }
        other => {
            return Err(
                test_error(format!("expected nested validation report, got {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn field_processing_precedence_is_snapshot_preflight_document_then_state_values() -> TestResult {
    let limits = DocumentLimits::default().with_max_formats_per_text(1);
    let context = EditorContext::new(CompiledSchema::breditor_base(), limits);
    let codec = EditorStateJsonCodec::new(context);
    let valid_document = text_document("a");
    let invalid_document = {
        let mut value = serde_json::from_str::<Value>(&valid_document)?;
        value["format"] = json!("other/document");
        serde_json::to_string(&value)?
    };
    let deep_selection =
        range(children_point(vec![0; MAX_PATH_DEPTH + 2], 0), children_point(vec![0], 0));
    let too_many_formats = json!([strong_format(), strong_format(), strong_format()]);

    let mut bad_snapshot = checkpoint_value(&invalid_document)?;
    bad_snapshot["snapshot"]["revision"] = json!("01");
    bad_snapshot["selection"] = deep_selection.clone();
    bad_snapshot["pendingFormats"] = too_many_formats.clone();
    match rejected(&codec, &serde_json::to_string(&bad_snapshot)?)? {
        EditorStateCodecError::InvalidEditorState(source) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidSnapshotRevision);
        }
        other => {
            return Err(test_error(format!("expected snapshot to fail first, got {other}")).into());
        }
    }

    let mut selection_preflight = checkpoint_value(&invalid_document)?;
    selection_preflight["selection"] = deep_selection;
    selection_preflight["pendingFormats"] = too_many_formats.clone();
    match rejected(&codec, &serde_json::to_string(&selection_preflight)?)? {
        EditorStateCodecError::InvalidJson(source) => {
            assert!(source.message().contains("path items"));
        }
        other => {
            return Err(
                test_error(format!("expected selection preflight first, got {other}")).into()
            );
        }
    }

    let mut format_preflight = checkpoint_value(&invalid_document)?;
    format_preflight["pendingFormats"] = too_many_formats;
    match rejected(&codec, &serde_json::to_string(&format_preflight)?)? {
        EditorStateCodecError::InvalidJson(source) => {
            assert!(source.message().contains("formats in one text run"));
        }
        other => {
            return Err(test_error(format!(
                "expected pending preflight before document, got {other}"
            ))
            .into());
        }
    }

    let mut document_before_typed_values = checkpoint_value(&invalid_document)?;
    document_before_typed_values["selection"] =
        range(children_point(vec![0; MAX_PATH_DEPTH + 1], 0), children_point(vec![0], 0));
    document_before_typed_values["pendingFormats"] = json!([strong_format(), strong_format()]);
    match rejected(&codec, &serde_json::to_string(&document_before_typed_values)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::UnsupportedFormat {
            ..
        }) => {}
        other => {
            return Err(
                test_error(format!("expected document before typed values, got {other}")).into()
            );
        }
    }

    let mut selection_before_pending = checkpoint_value(&valid_document)?;
    selection_before_pending["selection"] =
        range(children_point(vec![0; MAX_PATH_DEPTH + 1], 0), children_point(vec![0], 0));
    selection_before_pending["pendingFormats"] = json!([strong_format(), strong_format()]);
    match rejected(&codec, &serde_json::to_string(&selection_before_pending)?)? {
        EditorStateCodecError::InvalidEditorState(source) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidSelectionPath);
        }
        other => {
            return Err(
                test_error(format!("expected selection before pending, got {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn selection_path_preflight_allows_only_the_first_excess_with_typed_locations() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = text_document("a");
    let valid = children_point(vec![0], 0);

    for (endpoint, expected_location) in [
        ("anchor", EditorStateRecordLocation::SelectionAnchor),
        ("focus", EditorStateRecordLocation::SelectionFocus),
    ] {
        let deep = children_point(vec![0; MAX_PATH_DEPTH + 1], 0);
        let selection = if endpoint == "anchor" {
            range(deep, valid.clone())
        } else {
            range(valid.clone(), deep)
        };
        let mut value = checkpoint_value(&document)?;
        value["selection"] = selection;
        match rejected(&codec, &serde_json::to_string(&value)?)? {
            EditorStateCodecError::InvalidEditorState(source) => {
                assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidSelectionPath);
                assert_eq!(source.location(), expected_location);
            }
            other => {
                return Err(
                    test_error(format!("expected typed {endpoint} path, got {other}")).into()
                );
            }
        }
    }

    let mut larger = checkpoint_value(&document)?;
    larger["selection"] = range(children_point(vec![0; MAX_PATH_DEPTH + 2], 0), valid);
    assert_invalid_json(&codec, &serde_json::to_string(&larger)?)?;
    Ok(())
}

#[test]
fn selection_resolution_failures_keep_endpoint_and_structural_reason() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = text_document("😀");
    let valid = text_point(vec![0, 0], 0);

    let mut missing_path = checkpoint_value(&document)?;
    missing_path["selection"] = range(text_point(vec![9], 0), valid.clone());
    match rejected(&codec, &serde_json::to_string(&missing_path)?)? {
        EditorStateCodecError::Validation(EditorStateError::InvalidSelection(
            SelectionError::InvalidPoint {
                endpoint: RangeEndpoint::Anchor,
                source: PointError::NodeLookup(NodeLookupError::ChildIndexOutOfBounds { .. }),
            },
        )) => {}
        other => {
            return Err(
                test_error(format!("expected indexed node lookup failure, got {other}")).into()
            );
        }
    }

    let mut expected_text = checkpoint_value(&document)?;
    expected_text["selection"] = range(text_point(vec![0], 0), valid.clone());
    match rejected(&codec, &serde_json::to_string(&expected_text)?)? {
        EditorStateCodecError::Validation(EditorStateError::InvalidSelection(
            SelectionError::InvalidPoint {
                endpoint: RangeEndpoint::Anchor,
                source: PointError::ExpectedText { .. },
            },
        )) => {}
        other => {
            return Err(test_error(format!("expected text target failure, got {other}")).into());
        }
    }

    let mut expected_element = checkpoint_value(&document)?;
    expected_element["selection"] = range(children_point(vec![0, 0], 0), valid.clone());
    match rejected(&codec, &serde_json::to_string(&expected_element)?)? {
        EditorStateCodecError::Validation(EditorStateError::InvalidSelection(
            SelectionError::InvalidPoint {
                endpoint: RangeEndpoint::Anchor,
                source: PointError::ExpectedElement { .. },
            },
        )) => {}
        other => {
            return Err(test_error(format!("expected element target failure, got {other}")).into());
        }
    }

    let mut root_boundary = checkpoint_value(&document)?;
    root_boundary["selection"] = range(children_point(Vec::new(), 0), valid.clone());
    match rejected(&codec, &serde_json::to_string(&root_boundary)?)? {
        EditorStateCodecError::Validation(EditorStateError::InvalidSelection(
            SelectionError::EndpointNotAllowed {
                endpoint: RangeEndpoint::Anchor,
                rule: SelectionEndpointRule::RootBoundary,
                ..
            },
        )) => {}
        other => {
            return Err(test_error(format!("expected root-boundary failure, got {other}")).into());
        }
    }

    let mut split_scalar = checkpoint_value(&document)?;
    split_scalar["selection"] = range(text_point(vec![0, 0], 1), valid.clone());
    match rejected(&codec, &serde_json::to_string(&split_scalar)?)? {
        EditorStateCodecError::Validation(EditorStateError::InvalidSelection(
            SelectionError::InvalidPoint {
                endpoint: RangeEndpoint::Anchor,
                source: PointError::Utf16OffsetSplitsScalar { offset: 1, .. },
            },
        )) => {}
        other => {
            return Err(test_error(format!("expected surrogate-split failure, got {other}")).into());
        }
    }

    let mut focus_out_of_bounds = checkpoint_value(&document)?;
    focus_out_of_bounds["selection"] = range(valid, text_point(vec![0, 0], 3));
    match rejected(&codec, &serde_json::to_string(&focus_out_of_bounds)?)? {
        EditorStateCodecError::Validation(EditorStateError::InvalidSelection(
            SelectionError::InvalidPoint {
                endpoint: RangeEndpoint::Focus,
                source: PointError::Utf16OffsetOutOfBounds { offset: 3, length: 2, .. },
            },
        )) => {}
        other => {
            return Err(test_error(format!("expected focus offset failure, got {other}")).into());
        }
    }
    Ok(())
}

#[test]
fn pending_null_empty_and_nonempty_values_remain_distinct() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = text_document("a");

    let decoded_null = codec.decode(&checkpoint_json(&document)?)?;
    assert!(decoded_null.pending_formats().is_none());

    let mut empty = checkpoint_value(&document)?;
    empty["selection"] = collapsed_text_selection();
    empty["pendingFormats"] = json!([]);
    let decoded_empty = codec.decode(&serde_json::to_string(&empty)?)?;
    let Some(empty_formats) = decoded_empty.pending_formats() else {
        return Err(test_error("empty pending format override was erased to null").into());
    };
    assert!(empty_formats.is_empty());

    let mut strong = empty;
    strong["pendingFormats"] = json!([strong_format()]);
    let decoded_strong = codec.decode(&serde_json::to_string(&strong)?)?;
    let Some(strong_formats) = decoded_strong.pending_formats() else {
        return Err(test_error("nonempty pending format override was erased to null").into());
    };
    assert_eq!(strong_formats.len(), 1);
    Ok(())
}

#[test]
fn pending_format_count_preflight_preserves_only_the_typed_first_excess() -> TestResult {
    let limits = DocumentLimits::default().with_max_formats_per_text(1);
    let context = EditorContext::new(CompiledSchema::breditor_base(), limits);
    let codec = EditorStateJsonCodec::new(context);
    let document = text_document("a");

    let mut one = checkpoint_value(&document)?;
    one["selection"] = collapsed_text_selection();
    one["pendingFormats"] = json!([strong_format()]);
    assert_eq!(
        codec.decode(&serde_json::to_string(&one)?)?.pending_formats().map_or(0, FormatSet::len),
        1
    );

    let mut first_excess = one.clone();
    first_excess["pendingFormats"] = json!([strong_format(), strong_format()]);
    match rejected(&codec, &serde_json::to_string(&first_excess)?)? {
        EditorStateCodecError::InvalidEditorState(source) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::PendingFormatLimit);
            assert_eq!(source.location(), EditorStateRecordLocation::PendingFormats);
        }
        other => return Err(test_error(format!("expected typed format limit, got {other}")).into()),
    }

    let mut larger = one;
    larger["pendingFormats"] = json!([strong_format(), strong_format(), strong_format()]);
    assert_invalid_json(&codec, &serde_json::to_string(&larger)?)?;
    Ok(())
}

#[test]
fn pending_formats_reject_names_schema_canonicality_and_properties_at_the_right_layer() -> TestResult
{
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = text_document("a");
    let mut baseline = checkpoint_value(&document)?;
    baseline["selection"] = collapsed_text_selection();

    let mut invalid_name = baseline.clone();
    invalid_name["pendingFormats"] = json!([{"type": "Invalid", "properties": {}}]);
    match rejected(&codec, &serde_json::to_string(&invalid_name)?)? {
        EditorStateCodecError::InvalidEditorState(source) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidQualifiedName);
            assert_eq!(
                source.location(),
                EditorStateRecordLocation::PendingFormat { format_index: 0 }
            );
        }
        other => {
            return Err(test_error(format!("expected invalid format name, got {other}")).into());
        }
    }

    let mut unknown_kind = baseline.clone();
    unknown_kind["pendingFormats"] = json!([{"type": "test/unknown", "properties": {}}]);
    match rejected(&codec, &serde_json::to_string(&unknown_kind)?)? {
        EditorStateCodecError::InvalidEditorState(source) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::PendingFormatNotAllowed);
            assert_eq!(
                source.location(),
                EditorStateRecordLocation::PendingFormat { format_index: 0 }
            );
        }
        other => {
            return Err(test_error(format!("expected schema format failure, got {other}")).into());
        }
    }

    let mut duplicate = baseline.clone();
    duplicate["pendingFormats"] = json!([strong_format(), strong_format()]);
    match rejected(&codec, &serde_json::to_string(&duplicate)?)? {
        EditorStateCodecError::InvalidEditorState(source) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::NonCanonicalPendingFormats);
            assert_eq!(
                source.location(),
                EditorStateRecordLocation::PendingFormat { format_index: 1 }
            );
        }
        other => {
            return Err(
                test_error(format!("expected canonical format failure, got {other}")).into()
            );
        }
    }

    for invalid in [
        json!([{"type": "breditor/strong", "properties": {"secret/key": true}}]),
        json!([{"type": "breditor/strong"}]),
        json!([{"type": "breditor/strong", "properties": null}]),
        json!([{"type": "breditor/strong", "properties": {}, "extra": null}]),
    ] {
        let mut value = baseline.clone();
        value["pendingFormats"] = invalid;
        assert_invalid_json(&codec, &serde_json::to_string(&value)?)?;
    }
    Ok(())
}

#[test]
fn pending_formats_require_a_spatially_collapsed_range_after_reconstruction() -> TestResult {
    let codec = EditorStateJsonCodec::new(EditorContext::default());
    let document = text_document("a");

    let mut no_selection = checkpoint_value(&document)?;
    no_selection["pendingFormats"] = json!([]);
    match rejected(&codec, &serde_json::to_string(&no_selection)?)? {
        EditorStateCodecError::Validation(
            EditorStateError::PendingFormatsRequireCollapsedRange,
        ) => {}
        other => {
            return Err(
                test_error(format!("expected missing-selection failure, got {other}")).into()
            );
        }
    }

    let mut extended = checkpoint_value(&document)?;
    extended["selection"] = range(text_point(vec![0, 0], 0), text_point(vec![0, 0], 1));
    extended["pendingFormats"] = json!([strong_format()]);
    match rejected(&codec, &serde_json::to_string(&extended)?)? {
        EditorStateCodecError::Validation(
            EditorStateError::PendingFormatsRequireCollapsedRange,
        ) => {}
        other => {
            return Err(
                test_error(format!("expected extended-selection failure, got {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn whole_input_and_output_caps_are_distinct_and_exact() -> TestResult {
    let document_json = minimal_document_json();
    let input = checkpoint_json(&document_json)?;

    let exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(input.len()),
    );
    assert!(EditorStateJsonCodec::new(exact_context).decode(&input).is_ok());

    let short_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(input.len() - 1),
    );
    match rejected(&EditorStateJsonCodec::new(short_context), &input)? {
        EditorStateCodecError::InputTooLarge { actual, maximum } => {
            assert_eq!(actual, input.len());
            assert_eq!(maximum, input.len() - 1);
        }
        other => return Err(test_error(format!("expected whole-input cap, got {other}")).into()),
    }

    let document =
        DocumentJsonCodec::new(CompiledSchema::breditor_base()).decode(&document_json)?;
    let probe_context = EditorContext::default();
    let probe_state = EditorState::try_new(
        &probe_context,
        LineageId::try_new("output-cap")?,
        document.clone(),
        None,
        None,
    )?;
    let probe = EditorStateJsonCodec::new(probe_context).encode(&probe_state)?;

    let exact_output_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(probe.len()),
    );
    let exact_output_state = EditorState::try_new(
        &exact_output_context,
        LineageId::try_new("output-cap")?,
        document.clone(),
        None,
        None,
    )?;
    let exact_output =
        EditorStateJsonCodec::new(exact_output_context).encode(&exact_output_state)?;
    assert_eq!(exact_output.len(), probe.len());

    let limited_output_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(probe.len() - 1),
    );
    let limited_output_state = EditorState::try_new(
        &limited_output_context,
        LineageId::try_new("output-cap")?,
        document,
        None,
        None,
    )?;
    match EditorStateJsonCodec::new(limited_output_context).encode(&limited_output_state) {
        Err(EditorStateCodecError::OutputTooLarge { minimum, maximum }) => {
            assert!(minimum > maximum);
            assert_eq!(maximum, probe.len() - 1);
        }
        other => {
            return Err(
                test_error(format!("expected deterministic output cap, got {other:?}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn public_diagnostics_bound_hostile_text_and_do_not_retain_property_keys() -> TestResult {
    let context = EditorContext::default();
    let codec = EditorStateJsonCodec::new(context);
    let document = minimal_document_json();
    let baseline = checkpoint_value(&document)?;

    let hostile_format = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut wrong_format = baseline.clone();
    wrong_format["format"] = json!(hostile_format);
    match rejected(&codec, &serde_json::to_string(&wrong_format)?)? {
        EditorStateCodecError::UnsupportedFormat { found, .. } => {
            assert!(found.is_truncated());
            assert!(found.preview().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(test_error(format!("expected bounded state format, got {other}")).into());
        }
    }

    let hostile_document_format = "d".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut wrong_document_format = baseline.clone();
    wrong_document_format["document"]["format"] = json!(hostile_document_format);
    match rejected(&codec, &serde_json::to_string(&wrong_document_format)?)? {
        EditorStateCodecError::InvalidDocument(DocumentCodecError::UnsupportedFormat {
            found,
            ..
        }) => {
            assert!(found.is_truncated());
            assert!(found.preview().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(test_error(format!("expected bounded document format, got {other}")).into());
        }
    }

    let hostile_key = "k".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut unknown = baseline.clone();
    object_mut(&mut unknown)?.insert(hostile_key, Value::Bool(true));
    match rejected(&codec, &serde_json::to_string(&unknown)?)? {
        EditorStateCodecError::InvalidJson(source) => {
            assert!(source.diagnostic().is_truncated());
            assert!(source.message().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(test_error(format!("expected bounded JSON failure, got {other}")).into());
        }
    }

    let secret_key = "do-not-retain-this-pending-property-key";
    let mut properties = Map::new();
    properties.insert(secret_key.to_owned(), Value::Bool(true));
    let mut pending_property = baseline;
    pending_property["selection"] = collapsed_text_selection();
    pending_property["pendingFormats"] = json!([{
        "type": "breditor/strong",
        "properties": properties,
    }]);
    match rejected(&codec, &serde_json::to_string(&pending_property)?)? {
        EditorStateCodecError::InvalidJson(source) => {
            assert!(!source.message().contains(secret_key));
        }
        other => {
            return Err(
                test_error(format!("expected property preflight failure, got {other}")).into()
            );
        }
    }
    Ok(())
}
