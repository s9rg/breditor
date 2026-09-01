//! Adversarial black-box contracts for the durable commit JSON boundary.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        COMMIT_FORMAT, COMMIT_FORMAT_VERSION, CodecErrorCode, CommitApplicationErrorCode,
        CommitCodecError, CommitJsonCodec, CommitRecordErrorCode, CommitRecordLocation,
        DocumentCodecError, DocumentJsonCodec, EditorStateCodecError, MAX_DIAGNOSTIC_PREVIEW_BYTES,
    },
    document::{FormatSet, TextFragment, TextRun},
    operation::{Operation, TextRange, TextSplice},
    position::{MAX_PATH_DEPTH, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction},
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn state(
    context: &EditorContext,
    lineage: &str,
    text: Option<&str>,
) -> Result<EditorState, Box<dyn Error>> {
    let children = text.map(|text| vec![text_node(text, false)]).unwrap_or_default();
    // The JSON byte ceiling belongs to the boundary under test. Construct the
    // trusted fixture document independently, then revalidate it in `try_new`.
    let document = DocumentJsonCodec::new(context.schema().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insertion(text: &str) -> Result<Operation, Box<dyn Error>> {
    let replacement = if text.is_empty() {
        TextFragment::empty()
    } else {
        TextRun::try_new(text, FormatSet::default())?.into()
    };
    Ok(TextSplice::try_new(
        TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?,
        TextFragment::empty(),
        replacement,
    )?
    .into())
}

fn committed_insert(
    context: &EditorContext,
    base: &EditorState,
    text: &str,
) -> Result<Commit, Box<dyn Error>> {
    Transaction::new(base, vec![insertion(text)?])
        .apply(context, base)?
        .into_commit()
        .ok_or_else(|| test_error("insertion fixture unexpectedly produced no commit").into())
}

fn commit_value(
    context: &EditorContext,
    lineage: &str,
    base_text: Option<&str>,
) -> Result<Value, Box<dyn Error>> {
    let base = state(context, lineage, base_text)?;
    let commit = committed_insert(context, &base, "x")?;
    let encoded = CommitJsonCodec::new(context.clone()).encode(&commit)?;
    serde_json::from_str(&encoded).map_err(Into::into)
}

fn rejected(codec: &CommitJsonCodec, encoded: &str) -> Result<CommitCodecError, Box<dyn Error>> {
    match codec.decode(encoded) {
        Ok(_) => Err(test_error("invalid commit JSON unexpectedly decoded").into()),
        Err(error) => Ok(error),
    }
}

fn assert_invalid_json(codec: &CommitJsonCodec, encoded: &str) -> TestResult {
    let error = rejected(codec, encoded)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidJson, "unexpected error: {error}");
    Ok(())
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, Box<dyn Error>> {
    value.as_object_mut().ok_or_else(|| test_error("fixture value is not an object").into())
}

fn fragment(text: &str) -> Value {
    if text.is_empty() {
        json!({"runs": []})
    } else {
        json!({"runs": [{"text": text, "formats": []}]})
    }
}

fn text_splice(start: u64, end: u64, expected: &str, replacement: &str) -> Value {
    json!({
        "kind": "textSplice",
        "range": {"containerPath": [0], "start": start, "end": end},
        "expectedRemoved": fragment(expected),
        "replacement": fragment(replacement),
    })
}

fn strong_format() -> Value {
    json!({"type": "breditor/strong", "properties": {}})
}

fn children_point(indices: &[u32]) -> Value {
    json!({
        "kind": "children",
        "parentPath": indices,
        "childIndex": 0,
        "affinity": "before",
    })
}

fn range_selection(anchor: &Value, focus: &Value) -> Value {
    json!({"kind": "range", "anchor": anchor, "focus": focus})
}

#[test]
fn envelope_is_exact_and_nullable_fields_are_required() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-exact-envelope", None)?;

    assert_eq!(baseline["format"], COMMIT_FORMAT);
    assert_eq!(baseline["formatVersion"], COMMIT_FORMAT_VERSION);
    assert!(baseline["resultSelection"].is_null());
    assert!(baseline["resultPendingFormats"].is_null());
    assert!(codec.decode(&serde_json::to_string(&baseline)?).is_ok());

    for missing in
        ["before", "forwardOperations", "resultSelection", "resultPendingFormats", "metadata"]
    {
        let mut value = baseline.clone();
        object_mut(&mut value)?.remove(missing);
        assert_invalid_json(&codec, &serde_json::to_string(&value)?)?;
    }

    let mut missing_action = baseline.clone();
    object_mut(&mut missing_action["metadata"])?.remove("action");
    assert_invalid_json(&codec, &serde_json::to_string(&missing_action)?)?;

    let mut unknown_outer = baseline.clone();
    object_mut(&mut unknown_outer)?.insert("after".to_owned(), Value::Null);
    assert_invalid_json(&codec, &serde_json::to_string(&unknown_outer)?)?;

    let mut unknown_metadata = baseline.clone();
    object_mut(&mut unknown_metadata["metadata"])?.insert("trusted".to_owned(), json!(true));
    assert_invalid_json(&codec, &serde_json::to_string(&unknown_metadata)?)?;

    let mut smuggled_history = baseline.clone();
    smuggled_history["metadata"]["history"] = json!({"kind": "record", "group": "test/smuggled"});
    assert_invalid_json(&codec, &serde_json::to_string(&smuggled_history)?)?;

    let duplicate = serde_json::to_string(&baseline)?.replacen(
        &format!(r#""format":"{COMMIT_FORMAT}""#),
        &format!(r#""format":"{COMMIT_FORMAT}","format":"{COMMIT_FORMAT}""#),
        1,
    );
    assert_invalid_json(&codec, &duplicate)?;
    Ok(())
}

#[test]
fn routing_is_outer_format_then_version_then_strict_nested_before() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-routing", None)?;

    let mut wrong_format = baseline.clone();
    wrong_format["format"] = json!("other/commit");
    wrong_format["formatVersion"] = json!(99);
    object_mut(&mut wrong_format)?.remove("before");
    object_mut(&mut wrong_format)?.insert("future".to_owned(), json!(true));
    match rejected(&codec, &serde_json::to_string(&wrong_format)?)? {
        CommitCodecError::UnsupportedFormat { expected: COMMIT_FORMAT, .. } => {}
        other => {
            return Err(test_error(format!("expected outer format precedence, got {other}")).into());
        }
    }

    let mut wrong_version = baseline.clone();
    wrong_version["formatVersion"] = json!(99);
    object_mut(&mut wrong_version)?.remove("before");
    object_mut(&mut wrong_version)?.insert("future".to_owned(), json!(true));
    match rejected(&codec, &serde_json::to_string(&wrong_version)?)? {
        CommitCodecError::UnsupportedFormatVersion { found: 99, supported: 1 } => {}
        other => {
            return Err(
                test_error(format!("expected outer version precedence, got {other}")).into()
            );
        }
    }

    let mut wrong_before_format = baseline.clone();
    wrong_before_format["before"]["format"] = json!("other/editor-state");
    wrong_before_format["before"]["formatVersion"] = json!(99);
    object_mut(&mut wrong_before_format["before"])?.remove("document");
    match rejected(&codec, &serde_json::to_string(&wrong_before_format)?)? {
        CommitCodecError::InvalidBeforeState(EditorStateCodecError::UnsupportedFormat {
            ..
        }) => {}
        other => {
            return Err(test_error(format!(
                "expected nested state format precedence, got {other}"
            ))
            .into());
        }
    }

    let mut wrong_before_version = baseline.clone();
    wrong_before_version["before"]["formatVersion"] = json!(2);
    object_mut(&mut wrong_before_version["before"])?.remove("document");
    match rejected(&codec, &serde_json::to_string(&wrong_before_version)?)? {
        CommitCodecError::InvalidBeforeState(EditorStateCodecError::UnsupportedFormatVersion {
            found: 2,
            supported: 1,
        }) => {}
        other => {
            return Err(test_error(format!(
                "expected nested state version precedence, got {other}"
            ))
            .into());
        }
    }

    let mut unknown_before = baseline.clone();
    object_mut(&mut unknown_before["before"])?.insert("history".to_owned(), Value::Null);
    match rejected(&codec, &serde_json::to_string(&unknown_before)?)? {
        CommitCodecError::InvalidBeforeState(EditorStateCodecError::InvalidJson(_)) => {}
        other => {
            return Err(
                test_error(format!("expected strict nested state shape, got {other}")).into()
            );
        }
    }

    let mut wrong_document_format = baseline.clone();
    wrong_document_format["before"]["document"]["format"] = json!("other/document");
    wrong_document_format["before"]["document"]["formatVersion"] = json!(99);
    wrong_document_format["before"]["document"]["root"] = Value::Null;
    match rejected(&codec, &serde_json::to_string(&wrong_document_format)?)? {
        CommitCodecError::InvalidBeforeState(EditorStateCodecError::InvalidDocument(
            DocumentCodecError::UnsupportedFormat { .. },
        )) => {}
        other => {
            return Err(test_error(format!(
                "expected nested document format precedence, got {other}"
            ))
            .into());
        }
    }

    let mut wrong_document_version = baseline;
    wrong_document_version["before"]["document"]["formatVersion"] = json!(2);
    wrong_document_version["before"]["document"]["root"] = Value::Null;
    match rejected(&codec, &serde_json::to_string(&wrong_document_version)?)? {
        CommitCodecError::InvalidBeforeState(EditorStateCodecError::InvalidDocument(
            DocumentCodecError::UnsupportedFormatVersion { found: 2, supported: 1 },
        )) => {}
        other => {
            return Err(test_error(format!(
                "expected pinned nested document version, got {other}"
            ))
            .into());
        }
    }
    Ok(())
}

#[test]
fn sequence_and_result_format_preflights_preserve_only_typed_first_excess() -> TestResult {
    let operation_context = EditorContext::default().with_max_operations_per_transaction(1);
    let operation_codec = CommitJsonCodec::new(operation_context.clone());
    let one = commit_value(&operation_context, "commit-operation-budget", None)?;
    assert!(operation_codec.decode(&serde_json::to_string(&one)?).is_ok());

    let operation = one["forwardOperations"][0].clone();
    let mut two = one.clone();
    two["forwardOperations"] = json!([operation.clone(), operation.clone()]);
    match rejected(&operation_codec, &serde_json::to_string(&two)?)? {
        CommitCodecError::OperationLimit { actual: 2, maximum: 1 } => {}
        other => {
            return Err(
                test_error(format!("expected typed N+1 operation limit, got {other}")).into()
            );
        }
    }

    let mut three = one;
    three["forwardOperations"] = json!([operation.clone(), operation.clone(), operation]);
    assert_invalid_json(&operation_codec, &serde_json::to_string(&three)?)?;

    let format_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_formats_per_text(1),
    );
    let format_codec = CommitJsonCodec::new(format_context.clone());
    let one_format = commit_value(&format_context, "commit-format-budget", None)?;

    let mut two_formats = one_format.clone();
    two_formats["resultPendingFormats"] = json!([strong_format(), strong_format()]);
    match rejected(&format_codec, &serde_json::to_string(&two_formats)?)? {
        CommitCodecError::InvalidCommit(source) => {
            assert_eq!(source.code(), CommitRecordErrorCode::PendingFormatLimit);
            assert_eq!(source.location(), CommitRecordLocation::ResultPendingFormats);
        }
        other => {
            return Err(test_error(format!(
                "expected typed N+1 pending-format limit, got {other}"
            ))
            .into());
        }
    }

    let mut three_formats = one_format;
    three_formats["resultPendingFormats"] =
        json!([strong_format(), strong_format(), strong_format()]);
    assert_invalid_json(&format_codec, &serde_json::to_string(&three_formats)?)?;
    Ok(())
}

#[test]
fn result_values_keep_typed_locations_canonicality_and_public_codes() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-result-value-contracts", None)?;
    let valid_point = children_point(&[0]);

    for (endpoint, location) in [
        ("anchor", CommitRecordLocation::ResultSelectionAnchor),
        ("focus", CommitRecordLocation::ResultSelectionFocus),
    ] {
        let deep = children_point(&[0; MAX_PATH_DEPTH + 1]);
        let selection = if endpoint == "anchor" {
            range_selection(&deep, &valid_point)
        } else {
            range_selection(&valid_point, &deep)
        };
        let mut value = baseline.clone();
        value["resultSelection"] = selection;
        let error = rejected(&codec, &serde_json::to_string(&value)?)?;
        assert_eq!(error.code(), CodecErrorCode::InvalidCommit);
        match error {
            CommitCodecError::InvalidCommit(source) => {
                assert_eq!(source.code(), CommitRecordErrorCode::InvalidSelectionPath);
                assert_eq!(source.location(), location);
            }
            other => {
                return Err(
                    test_error(format!("expected typed {endpoint} path, got {other}")).into()
                );
            }
        }
    }

    let mut larger_path = baseline.clone();
    larger_path["resultSelection"] =
        range_selection(&children_point(&[0; MAX_PATH_DEPTH + 2]), &valid_point);
    assert_invalid_json(&codec, &serde_json::to_string(&larger_path)?)?;

    let mut with_selection = baseline.clone();
    with_selection["resultSelection"] = range_selection(&valid_point, &valid_point);
    for (formats, expected_code, expected_index) in [
        (
            json!([{"type": "Invalid", "properties": {}}]),
            CommitRecordErrorCode::InvalidQualifiedName,
            0,
        ),
        (
            json!([{"type": "test/unknown", "properties": {}}]),
            CommitRecordErrorCode::PendingFormatNotAllowed,
            0,
        ),
        (
            json!([strong_format(), strong_format()]),
            CommitRecordErrorCode::NonCanonicalPendingFormats,
            1,
        ),
    ] {
        let mut value = with_selection.clone();
        value["resultPendingFormats"] = formats;
        let error = rejected(&codec, &serde_json::to_string(&value)?)?;
        assert_eq!(error.code(), CodecErrorCode::InvalidCommit);
        match error {
            CommitCodecError::InvalidCommit(source) => {
                assert_eq!(source.code(), expected_code);
                assert_eq!(
                    source.location(),
                    CommitRecordLocation::ResultPendingFormat { format_index: expected_index }
                );
            }
            other => {
                return Err(
                    test_error(format!("expected typed pending format, got {other}")).into()
                );
            }
        }
    }

    let mut invalid_result = baseline;
    invalid_result["resultPendingFormats"] = json!([]);
    let error = rejected(&codec, &serde_json::to_string(&invalid_result)?)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidCommit);
    match error {
        CommitCodecError::Apply(source) => {
            assert_eq!(source.code(), CommitApplicationErrorCode::InvalidResultState);
            assert_eq!(source.operation_index(), None);
        }
        other => {
            return Err(test_error(format!("expected invalid result state, got {other}")).into());
        }
    }
    Ok(())
}

#[test]
fn operation_layers_and_encode_context_have_distinct_public_codes() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-operation-error-layers", None)?;

    let mut malformed = baseline.clone();
    object_mut(&mut malformed["forwardOperations"][0])?.remove("range");
    let error = rejected(&codec, &serde_json::to_string(&malformed)?)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidJson);
    assert!(matches!(error, CommitCodecError::InvalidOperationJson { operation_index: 0, .. }));

    let mut invalid_record = baseline.clone();
    invalid_record["forwardOperations"][0]["range"]["start"] = json!(1);
    invalid_record["forwardOperations"][0]["range"]["end"] = json!(0);
    let error = rejected(&codec, &serde_json::to_string(&invalid_record)?)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidOperation);
    assert!(matches!(error, CommitCodecError::InvalidOperation { operation_index: 0, .. }));

    let mut static_invalid = baseline;
    static_invalid["forwardOperations"][0]["range"]["containerPath"] = json!([u32::MAX]);
    let error = rejected(&codec, &serde_json::to_string(&static_invalid)?)?;
    assert_eq!(error.code(), CodecErrorCode::ValidationFailed);
    assert!(matches!(error, CommitCodecError::OperationValidation { operation_index: 0, .. }));

    let base = state(&context, "commit-encode-context", None)?;
    let commit = committed_insert(&context, &base, "x")?;
    let other_codec = CommitJsonCodec::new(context.with_max_operations_per_transaction(7));
    let error = other_codec
        .encode(&commit)
        .map_or_else(Ok, |_| Err(test_error("context-mismatched commit encoded")))?;
    assert_eq!(error.code(), CodecErrorCode::ContextMismatch);
    assert!(matches!(error, CommitCodecError::ContextConfigurationMismatch));
    Ok(())
}

#[test]
fn invalid_metadata_names_keep_commit_specific_locations() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-metadata-locations", None)?;

    let mut bad_action = baseline.clone();
    bad_action["metadata"]["action"] = json!("missing-separator");
    match rejected(&codec, &serde_json::to_string(&bad_action)?)? {
        CommitCodecError::InvalidCommit(source) => {
            assert_eq!(source.code(), CommitRecordErrorCode::InvalidQualifiedName);
            assert_eq!(source.location(), CommitRecordLocation::MetadataAction);
        }
        other => {
            return Err(test_error(format!("expected invalid metadata action, got {other}")).into());
        }
    }

    let mut bad_group = baseline;
    bad_group["metadata"]["history"] = json!({"kind": "merge", "group": "missing-separator"});
    match rejected(&codec, &serde_json::to_string(&bad_group)?)? {
        CommitCodecError::InvalidCommit(source) => {
            assert_eq!(source.code(), CommitRecordErrorCode::InvalidQualifiedName);
            assert_eq!(source.location(), CommitRecordLocation::MetadataHistoryGroup);
        }
        other => {
            return Err(test_error(format!("expected invalid history group, got {other}")).into());
        }
    }
    Ok(())
}

#[test]
fn replay_failures_are_typed_and_never_publish_a_partial_commit() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-replay-failure", Some("a"))?;

    let mut stale_guard = baseline.clone();
    stale_guard["forwardOperations"] = json!([text_splice(0, 1, "z", "x")]);
    match rejected(&codec, &serde_json::to_string(&stale_guard)?)? {
        CommitCodecError::Apply(source) => {
            assert_eq!(source.code(), CommitApplicationErrorCode::Operation);
            assert_eq!(source.operation_index(), Some(0));
            assert!(!format!("{source:?}").contains("\"z\""));
        }
        other => {
            return Err(test_error(format!("expected replay guard failure, got {other}")).into());
        }
    }

    let mut overflow = baseline;
    overflow["before"]["snapshot"]["revision"] = json!(u64::MAX.to_string());
    match rejected(&codec, &serde_json::to_string(&overflow)?)? {
        CommitCodecError::Apply(source) => {
            assert_eq!(source.code(), CommitApplicationErrorCode::RevisionOverflow);
            assert_eq!(source.operation_index(), None);
        }
        other => {
            return Err(
                test_error(format!("expected replay revision overflow, got {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn unchanged_and_hidden_noop_recipes_are_rejected_canonically() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-canonical-operations", None)?;
    let applied = baseline["forwardOperations"][0].clone();
    let noop = text_splice(0, 0, "", "");

    let mut unchanged = baseline.clone();
    unchanged["forwardOperations"] = json!([]);
    match rejected(&codec, &serde_json::to_string(&unchanged)?)? {
        CommitCodecError::UnexpectedUnchanged => {}
        other => {
            return Err(
                test_error(format!("expected unchanged commit rejection, got {other}")).into()
            );
        }
    }

    let mut hidden_first = baseline.clone();
    hidden_first["forwardOperations"] = json!([noop.clone(), applied.clone()]);
    match rejected(&codec, &serde_json::to_string(&hidden_first)?)? {
        CommitCodecError::NonCanonicalForwardOperations { operation_index: 0 } => {}
        other => {
            return Err(test_error(format!("expected first mismatch at zero, got {other}")).into());
        }
    }

    let mut hidden_last = baseline;
    hidden_last["forwardOperations"] = json!([applied, noop]);
    match rejected(&codec, &serde_json::to_string(&hidden_last)?)? {
        CommitCodecError::NonCanonicalForwardOperations { operation_index: 1 } => {}
        other => {
            return Err(test_error(format!("expected first mismatch at one, got {other}")).into());
        }
    }
    Ok(())
}

#[test]
fn input_and_output_caps_are_distinct_and_report_observed_bounds() -> TestResult {
    let default_context = EditorContext::default();
    let oversized =
        serde_json::to_string(&commit_value(&default_context, "commit-input-cap", None)?)?;
    assert!(oversized.len() > 32);

    let limited_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(32),
    );
    let codec = CommitJsonCodec::new(limited_context.clone());
    match rejected(&codec, &oversized)? {
        CommitCodecError::InputTooLarge { actual, maximum: 32 } => {
            assert_eq!(actual, oversized.len());
        }
        other => return Err(test_error(format!("expected input byte cap, got {other}")).into()),
    }

    let base = state(&limited_context, "commit-output-cap", None)?;
    let commit = committed_insert(&limited_context, &base, "x")?;
    match codec.encode(&commit) {
        Err(CommitCodecError::OutputTooLarge { minimum, maximum: 32 }) => {
            assert!(minimum > 32);
        }
        other => return Err(test_error(format!("expected output byte cap, got {other:?}")).into()),
    }
    Ok(())
}

#[test]
fn hostile_public_diagnostics_are_bounded_and_do_not_copy_property_keys() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context.clone());
    let baseline = commit_value(&context, "commit-bounded-diagnostics", None)?;

    let hostile_format = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut wrong_format = baseline.clone();
    wrong_format["format"] = json!(hostile_format);
    match rejected(&codec, &serde_json::to_string(&wrong_format)?)? {
        CommitCodecError::UnsupportedFormat { found, .. } => {
            assert!(found.is_truncated());
            assert!(found.preview().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(
                test_error(format!("expected bounded format diagnostic, got {other}")).into()
            );
        }
    }

    let hostile_key = "k".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut unknown = baseline.clone();
    object_mut(&mut unknown)?.insert(hostile_key, json!(true));
    match rejected(&codec, &serde_json::to_string(&unknown)?)? {
        CommitCodecError::InvalidJson(source) => {
            assert!(source.diagnostic().is_truncated());
            assert!(source.message().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(test_error(format!("expected bounded JSON diagnostic, got {other}")).into());
        }
    }

    let secret_key = "do-not-retain-this-commit-property-key";
    let mut properties = Map::new();
    properties.insert(secret_key.to_owned(), json!(true));
    let mut nonempty_properties = baseline;
    nonempty_properties["resultPendingFormats"] = json!([{
        "type": "breditor/strong",
        "properties": properties,
    }]);
    match rejected(&codec, &serde_json::to_string(&nonempty_properties)?)? {
        CommitCodecError::InvalidJson(source) => {
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
