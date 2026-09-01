//! Adversarial black-box contracts for the transaction-request JSON boundary.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, MAX_DIAGNOSTIC_PREVIEW_BYTES, OperationRecordErrorCode,
        TRANSACTION_REQUEST_FORMAT, TRANSACTION_REQUEST_FORMAT_VERSION, TransactionCodecError,
        TransactionJsonCodec, TransactionRecordErrorCode, TransactionRecordLocation,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::{MAX_QUALIFIED_NAME_BYTES, QualifiedName},
    operation::{Operation, OperationValidationError, TextRange, TextSplice},
    position::{MAX_PATH_DEPTH, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    state::{EditorContext, EditorState, LineageId, MAX_LINEAGE_ID_BYTES, Revision},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionApplyError,
        TransactionMetadata,
    },
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn state(
    context: &EditorContext,
    lineage: &str,
    text: Option<&str>,
) -> Result<EditorState, Box<dyn Error>> {
    let children = text.map(|text| vec![text_node(text, false)]).unwrap_or_default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn empty_fragment() -> Value {
    json!({"runs": []})
}

fn text_fragment(text: &str) -> Value {
    if text.is_empty() {
        return empty_fragment();
    }
    json!({"runs": [{"text": text, "formats": []}]})
}

fn text_splice(start: u64, end: u64, expected: &str, replacement: &str) -> Value {
    json!({
        "kind": "textSplice",
        "range": {"containerPath": [0], "start": start, "end": end},
        "expectedRemoved": text_fragment(expected),
        "replacement": text_fragment(replacement),
    })
}

fn request_value(base: &EditorState, operations: Vec<Value>) -> Value {
    let operations = Value::Array(operations);
    json!({
        "format": TRANSACTION_REQUEST_FORMAT,
        "formatVersion": TRANSACTION_REQUEST_FORMAT_VERSION,
        "schema": {"name": "breditor/base", "version": 1},
        "baseSnapshot": {
            "lineage": base.snapshot().lineage().as_str(),
            "revision": base.snapshot().revision().get().to_string(),
        },
        "operations": operations,
        "selectionRelocation": {"anchor": "reject", "focus": "reject"},
        "selectionUpdate": {"kind": "relocate"},
        "pendingFormatsUpdate": {"kind": "preserve"},
        "metadata": {"action": null, "history": {"kind": "record"}},
    })
}

fn request_json(base: &EditorState, operations: Vec<Value>) -> Result<String, serde_json::Error> {
    serde_json::to_string(&request_value(base, operations))
}

fn rejected(
    codec: &TransactionJsonCodec,
    base: &EditorState,
    json: &str,
) -> Result<TransactionCodecError, Box<dyn Error>> {
    match codec.decode(json, base) {
        Ok(_) => Err(test_error("invalid transaction JSON unexpectedly decoded").into()),
        Err(error) => Ok(error),
    }
}

fn assert_invalid_json(codec: &TransactionJsonCodec, base: &EditorState, json: &str) -> TestResult {
    let error = rejected(codec, base, json)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidJson, "unexpected error: {error}");
    Ok(())
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, Box<dyn Error>> {
    value.as_object_mut().ok_or_else(|| test_error("fixture value is not an object").into())
}

fn insertion_operation(text: &str, formats: FormatSet) -> Result<Operation, Box<dyn Error>> {
    let replacement: TextFragment = TextRun::try_new(text, formats)?.into();
    Ok(TextSplice::try_new(
        TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?,
        TextFragment::empty(),
        replacement,
    )?
    .into())
}

#[test]
fn envelope_and_nested_fixed_objects_reject_unknown_missing_and_duplicate_fields() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "strict-shapes", None)?;
    let codec = TransactionJsonCodec::new(context);
    let baseline = request_value(&base, vec![text_splice(0, 0, "", "x")]);

    let mut unknown_outer = baseline.clone();
    object_mut(&mut unknown_outer)?.insert("commit".to_owned(), Value::Bool(true));
    assert_invalid_json(&codec, &base, &serde_json::to_string(&unknown_outer)?)?;

    let mut missing_outer = baseline.clone();
    object_mut(&mut missing_outer)?.remove("metadata");
    assert_invalid_json(&codec, &base, &serde_json::to_string(&missing_outer)?)?;

    let duplicate_outer = serde_json::to_string(&baseline)?.replacen(
        &format!(r#""format":"{TRANSACTION_REQUEST_FORMAT}""#),
        &format!(
            r#""format":"{TRANSACTION_REQUEST_FORMAT}","format":"{TRANSACTION_REQUEST_FORMAT}""#
        ),
        1,
    );
    assert_invalid_json(&codec, &base, &duplicate_outer)?;

    let mut unknown_nested = baseline.clone();
    object_mut(&mut unknown_nested["selectionRelocation"])?
        .insert("extra".to_owned(), Value::Bool(true));
    assert_invalid_json(&codec, &base, &serde_json::to_string(&unknown_nested)?)?;

    let mut missing_nested = baseline.clone();
    object_mut(&mut missing_nested["selectionRelocation"])?.remove("focus");
    assert_invalid_json(&codec, &base, &serde_json::to_string(&missing_nested)?)?;

    let duplicate_nested = serde_json::to_string(&baseline)?.replacen(
        r#""anchor":"reject""#,
        r#""anchor":"reject","anchor":"after""#,
        1,
    );
    assert_invalid_json(&codec, &base, &duplicate_nested)?;

    for (field, smuggled) in [
        ("selectionUpdate", json!({"kind": "relocate", "selection": null})),
        ("pendingFormatsUpdate", json!({"kind": "preserve", "formats": []})),
    ] {
        let mut value = baseline.clone();
        value[field] = smuggled;
        assert_invalid_json(&codec, &base, &serde_json::to_string(&value)?)?;
    }
    for history in [
        json!({"kind": "record", "group": "test/smuggled"}),
        json!({"kind": "ignore", "group": "test/smuggled"}),
    ] {
        let mut value = baseline.clone();
        value["metadata"]["history"] = history;
        assert_invalid_json(&codec, &base, &serde_json::to_string(&value)?)?;
    }

    let mut unknown_operation = baseline.clone();
    object_mut(&mut unknown_operation["operations"][0])?.insert("derived".to_owned(), Value::Null);
    match rejected(&codec, &base, &serde_json::to_string(&unknown_operation)?)? {
        TransactionCodecError::InvalidOperationJson { operation_index: 0, .. } => {}
        other => {
            return Err(test_error(format!(
                "expected indexed operation JSON failure, got {other}"
            ))
            .into());
        }
    }

    let duplicate_operation = serde_json::to_string(&baseline)?.replacen(
        r#""kind":"textSplice""#,
        r#""kind":"textSplice","kind":"textSplice""#,
        1,
    );
    match rejected(&codec, &base, &duplicate_operation)? {
        TransactionCodecError::InvalidOperationJson { operation_index: 0, .. } => {}
        other => {
            return Err(test_error(format!(
                "expected indexed duplicate operation failure, got {other}"
            ))
            .into());
        }
    }
    Ok(())
}

#[test]
fn nullable_state_fields_are_required_and_null_remains_distinct_from_empty() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "required-nullables", None)?;
    let codec = TransactionJsonCodec::new(context);

    let mut missing_selection = request_value(&base, Vec::new());
    missing_selection["selectionUpdate"] = json!({"kind": "set"});
    assert_invalid_json(&codec, &base, &serde_json::to_string(&missing_selection)?)?;

    let mut missing_formats = request_value(&base, Vec::new());
    missing_formats["pendingFormatsUpdate"] = json!({"kind": "set"});
    assert_invalid_json(&codec, &base, &serde_json::to_string(&missing_formats)?)?;

    let mut missing_action = request_value(&base, Vec::new());
    missing_action["metadata"] = json!({"history": {"kind": "record"}});
    assert_invalid_json(&codec, &base, &serde_json::to_string(&missing_action)?)?;

    let mut nulls = request_value(&base, Vec::new());
    nulls["selectionUpdate"] = json!({"kind": "set", "selection": null});
    nulls["pendingFormatsUpdate"] = json!({"kind": "set", "formats": null});
    let decoded_nulls = codec.decode(&serde_json::to_string(&nulls)?, &base)?;
    assert_eq!(decoded_nulls.selection_update(), &SelectionUpdate::Set(None));
    assert_eq!(decoded_nulls.pending_formats_update(), &PendingFormatsUpdate::Set(None));

    let mut empty_formats = request_value(&base, Vec::new());
    empty_formats["pendingFormatsUpdate"] = json!({"kind": "set", "formats": []});
    let decoded_empty = codec.decode(&serde_json::to_string(&empty_formats)?, &base)?;
    assert_eq!(
        decoded_empty.pending_formats_update(),
        &PendingFormatsUpdate::Set(Some(FormatSet::default()))
    );
    assert_ne!(decoded_nulls, decoded_empty);
    Ok(())
}

#[test]
fn routing_precedence_is_format_then_version_before_exact_v1_shape() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "routing-precedence", None)?;
    let codec = TransactionJsonCodec::new(context);

    let mut wrong_both = request_value(&base, Vec::new());
    wrong_both["format"] = json!("other/transaction");
    wrong_both["formatVersion"] = json!(99);
    object_mut(&mut wrong_both)?.insert("futureField".to_owned(), Value::Bool(true));
    match rejected(&codec, &base, &serde_json::to_string(&wrong_both)?)? {
        TransactionCodecError::UnsupportedFormat { .. } => {}
        other => return Err(test_error(format!("expected format precedence, got {other}")).into()),
    }

    let mut wrong_version = request_value(&base, Vec::new());
    wrong_version["formatVersion"] = json!(99);
    object_mut(&mut wrong_version)?.insert("futureField".to_owned(), Value::Bool(true));
    match rejected(&codec, &base, &serde_json::to_string(&wrong_version)?)? {
        TransactionCodecError::UnsupportedFormatVersion { found: 99, supported: 1 } => {}
        other => {
            return Err(test_error(format!("expected version precedence, got {other}")).into());
        }
    }

    let malformed =
        format!(r#"{{"format":"{TRANSACTION_REQUEST_FORMAT}","formatVersion":99,"operations":["#);
    assert_invalid_json(&codec, &base, &malformed)?;
    Ok(())
}

#[test]
fn canonical_decimal_revision_supports_full_u64_and_rejects_every_coercion() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "revision-contract", None)?;
    let codec = TransactionJsonCodec::new(context);

    let mut full = request_value(&base, Vec::new());
    full["baseSnapshot"]["revision"] = json!(u64::MAX.to_string());
    match rejected(&codec, &base, &serde_json::to_string(&full)?)? {
        TransactionCodecError::BaseSnapshotMismatch { found, .. } => {
            assert_eq!(found.revision(), Revision::new(u64::MAX));
        }
        other => return Err(test_error(format!("full u64 was not parsed exactly: {other}")).into()),
    }

    for invalid in ["", "00", "01", "+1", "-1", "1.0", " 1", "18446744073709551616"] {
        let mut value = request_value(&base, Vec::new());
        value["baseSnapshot"]["revision"] = json!(invalid);
        match rejected(&codec, &base, &serde_json::to_string(&value)?)? {
            TransactionCodecError::InvalidTransaction(source) => {
                assert_eq!(source.code(), TransactionRecordErrorCode::InvalidBaseRevision);
                assert_eq!(source.location(), TransactionRecordLocation::BaseRevision);
            }
            other => {
                return Err(test_error(format!(
                    "expected typed invalid revision for {invalid:?}, got {other}"
                ))
                .into());
            }
        }
    }

    for invalid in [json!(0), Value::Null, json!(1.0)] {
        let mut value = request_value(&base, Vec::new());
        value["baseSnapshot"]["revision"] = invalid;
        assert_invalid_json(&codec, &base, &serde_json::to_string(&value)?)?;
    }
    Ok(())
}

#[test]
fn lineage_and_schema_names_fail_with_bounded_typed_classification() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "identity-contract", None)?;
    let codec = TransactionJsonCodec::new(context);

    for lineage in ["bad lineage".to_owned(), "x".repeat(MAX_LINEAGE_ID_BYTES + 1)] {
        let mut value = request_value(&base, Vec::new());
        value["baseSnapshot"]["lineage"] = json!(lineage);
        match rejected(&codec, &base, &serde_json::to_string(&value)?)? {
            TransactionCodecError::InvalidTransaction(source) => {
                assert_eq!(source.code(), TransactionRecordErrorCode::InvalidBaseLineage);
                assert_eq!(source.location(), TransactionRecordLocation::BaseLineage);
            }
            other => {
                return Err(test_error(format!("expected invalid lineage, got {other}")).into());
            }
        }
    }

    for schema_name in ["invalid".to_owned(), "x".repeat(MAX_QUALIFIED_NAME_BYTES + 1)] {
        let mut value = request_value(&base, Vec::new());
        value["schema"]["name"] = json!(schema_name);
        match rejected(&codec, &base, &serde_json::to_string(&value)?)? {
            TransactionCodecError::InvalidSchemaName { value, .. } => {
                assert!(value.original_byte_len() <= MAX_QUALIFIED_NAME_BYTES + 1);
            }
            other => {
                return Err(test_error(format!("expected invalid schema name, got {other}")).into());
            }
        }
    }
    Ok(())
}

#[test]
fn operation_count_preflight_allows_only_one_excess_for_typed_limit() -> TestResult {
    let context = EditorContext::default().with_max_operations_per_transaction(1);
    let base = state(&context, "operation-count", None)?;
    let codec = TransactionJsonCodec::new(context);
    let operation = text_splice(0, 0, "", "x");

    let one = request_json(&base, vec![operation.clone()])?;
    assert_eq!(codec.decode(&one, &base)?.operations().len(), 1);

    let two = request_json(&base, vec![operation.clone(), operation.clone()])?;
    match rejected(&codec, &base, &two)? {
        TransactionCodecError::OperationLimit { actual: 2, maximum: 1 } => {}
        other => return Err(test_error(format!("expected typed N+1 limit, got {other}")).into()),
    }

    let three = request_json(&base, vec![operation.clone(), operation.clone(), operation])?;
    assert_invalid_json(&codec, &base, &three)?;

    let zero_context = EditorContext::default().with_max_operations_per_transaction(0);
    let zero_base = state(&zero_context, "zero-operation-count", None)?;
    let zero_codec = TransactionJsonCodec::new(zero_context);
    assert!(zero_codec.decode(&request_json(&zero_base, Vec::new())?, &zero_base).is_ok());
    match rejected(
        &zero_codec,
        &zero_base,
        &request_json(&zero_base, vec![text_splice(0, 0, "", "x")])?,
    )? {
        TransactionCodecError::OperationLimit { actual: 1, maximum: 0 } => {}
        other => {
            return Err(
                test_error(format!("expected zero-budget typed excess, got {other}")).into()
            );
        }
    }
    assert_invalid_json(
        &zero_codec,
        &zero_base,
        &request_json(&zero_base, vec![text_splice(0, 0, "", "x"), text_splice(0, 0, "", "y")])?,
    )?;
    Ok(())
}

#[test]
fn operation_failures_retain_their_zero_based_transaction_index() -> TestResult {
    let context = EditorContext::default().with_max_operations_per_transaction(3);
    let base = state(&context, "indexed-operation-errors", None)?;
    let codec = TransactionJsonCodec::new(context);
    let first = text_splice(0, 0, "", "x");

    let malformed = request_json(&base, vec![first.clone(), json!({"kind": "textSplice"})])?;
    match rejected(&codec, &base, &malformed)? {
        TransactionCodecError::InvalidOperationJson { operation_index: 1, .. } => {}
        other => {
            return Err(test_error(format!("expected indexed JSON failure, got {other}")).into());
        }
    }

    let reversed = text_splice(1, 0, "", "");
    let constructor = request_json(&base, vec![first, reversed])?;
    match rejected(&codec, &base, &constructor)? {
        TransactionCodecError::InvalidOperation { operation_index: 1, source } => {
            assert_eq!(source.code(), OperationRecordErrorCode::InvalidRange);
        }
        other => {
            return Err(
                test_error(format!("expected indexed constructor failure, got {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn static_operation_validation_is_indexed_after_first_excess_text_preflight() -> TestResult {
    let limits = DocumentLimits::default().with_max_text_bytes(1);
    let context = EditorContext::new(CompiledSchema::breditor_base(), limits)
        .with_max_operations_per_transaction(2);
    let base = state(&context, "indexed-static-validation", None)?;
    let codec = TransactionJsonCodec::new(context);

    let first_excess =
        request_json(&base, vec![text_splice(0, 0, "", "a"), text_splice(0, 0, "", "ab")])?;
    match rejected(&codec, &base, &first_excess)? {
        TransactionCodecError::OperationValidation { operation_index: 1, source } => {
            assert!(matches!(source, OperationValidationError::FragmentTextBytesLimit { .. }));
        }
        other => {
            return Err(
                test_error(format!("expected indexed static validation, got {other}")).into()
            );
        }
    }

    let larger = request_json(&base, vec![text_splice(0, 0, "", "abc")])?;
    assert_invalid_json(&codec, &base, &larger)?;
    Ok(())
}

fn explicit_selection_with_path(path: Vec<u32>) -> Value {
    let path = Value::Array(path.into_iter().map(Value::from).collect());
    let point = json!({
        "kind": "children",
        "parentPath": path,
        "childIndex": 0,
        "affinity": "before",
    });
    json!({
        "kind": "set",
        "selection": {"kind": "range", "anchor": point.clone(), "focus": point},
    })
}

#[test]
fn state_preflight_allows_typed_first_excess_but_stops_larger_paths_names_and_arrays() -> TestResult
{
    let context = EditorContext::default();
    let base = state(&context, "state-preflight", None)?;
    let codec = TransactionJsonCodec::new(context);

    let mut first_path = request_value(&base, Vec::new());
    first_path["selectionUpdate"] = explicit_selection_with_path(vec![0; MAX_PATH_DEPTH + 1]);
    match rejected(&codec, &base, &serde_json::to_string(&first_path)?)? {
        TransactionCodecError::InvalidTransaction(source) => {
            assert_eq!(source.code(), TransactionRecordErrorCode::InvalidSelectionPath);
            assert_eq!(source.location(), TransactionRecordLocation::SelectionAnchor);
        }
        other => return Err(test_error(format!("expected typed path excess, got {other}")).into()),
    }

    let mut larger_path = request_value(&base, Vec::new());
    larger_path["selectionUpdate"] = explicit_selection_with_path(vec![0; MAX_PATH_DEPTH + 2]);
    assert_invalid_json(&codec, &base, &serde_json::to_string(&larger_path)?)?;

    let mut first_name = request_value(&base, Vec::new());
    first_name["metadata"]["action"] = json!("a".repeat(MAX_QUALIFIED_NAME_BYTES + 1));
    match rejected(&codec, &base, &serde_json::to_string(&first_name)?)? {
        TransactionCodecError::InvalidTransaction(source) => {
            assert_eq!(source.code(), TransactionRecordErrorCode::InvalidQualifiedName);
            assert_eq!(source.location(), TransactionRecordLocation::MetadataAction);
        }
        other => return Err(test_error(format!("expected typed name excess, got {other}")).into()),
    }

    let mut larger_name = request_value(&base, Vec::new());
    larger_name["metadata"]["action"] = json!("a".repeat(MAX_QUALIFIED_NAME_BYTES + 2));
    assert_invalid_json(&codec, &base, &serde_json::to_string(&larger_name)?)?;

    let format_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_formats_per_text(1),
    );
    let format_base = state(&format_context, "state-format-preflight", None)?;
    let format_codec = TransactionJsonCodec::new(format_context);
    let strong = json!({"type": "breditor/strong", "properties": {}});
    let mut first_formats = request_value(&format_base, Vec::new());
    first_formats["pendingFormatsUpdate"] =
        json!({"kind": "set", "formats": [strong.clone(), strong.clone()]});
    match rejected(&format_codec, &format_base, &serde_json::to_string(&first_formats)?)? {
        TransactionCodecError::InvalidTransaction(source) => {
            assert_eq!(source.code(), TransactionRecordErrorCode::PendingFormatLimit);
        }
        other => {
            return Err(
                test_error(format!("expected typed format-count excess, got {other}")).into()
            );
        }
    }
    let mut larger_formats = request_value(&format_base, Vec::new());
    larger_formats["pendingFormatsUpdate"] =
        json!({"kind": "set", "formats": [strong.clone(), strong.clone(), strong]});
    assert_invalid_json(&format_codec, &format_base, &serde_json::to_string(&larger_formats)?)?;
    Ok(())
}

#[test]
fn input_and_output_byte_caps_are_distinct_and_exact() -> TestResult {
    let limits = DocumentLimits::default().with_max_json_bytes(32);
    let context = EditorContext::new(CompiledSchema::breditor_base(), limits);
    let base = state(&context, "byte-caps", None)?;
    let codec = TransactionJsonCodec::new(context);
    let input = request_json(&base, Vec::new())?;
    assert!(input.len() > 32);

    match rejected(&codec, &base, &input)? {
        TransactionCodecError::InputTooLarge { actual, maximum: 32 } => {
            assert_eq!(actual, input.len());
        }
        other => return Err(test_error(format!("expected input byte cap, got {other}")).into()),
    }

    match codec.encode(&Transaction::new(&base, Vec::new())) {
        Err(TransactionCodecError::OutputTooLarge { minimum, maximum: 32 }) => {
            assert!(minimum > 32);
        }
        other => {
            return Err(test_error(format!("expected output byte cap, got {other:?}")).into());
        }
    }
    Ok(())
}

#[test]
fn output_cap_stops_before_validating_later_operations() -> TestResult {
    let probe_context = EditorContext::default();
    let probe_base = state(&probe_context, "lazy-encode-validation", None)?;
    let large_text = "bounded-serialization-must-stop-before-later-validation".repeat(8);
    let valid = insertion_operation(&large_text, FormatSet::default())?;
    let probe = TransactionJsonCodec::new(probe_context.clone())
        .encode(&Transaction::new(&probe_base, vec![valid.clone()]))?;
    let text_start = probe
        .find(&large_text)
        .ok_or_else(|| test_error("probe encoding did not contain its replacement text"))?;
    let maximum = text_start + large_text.len() / 2;

    let limited_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let limited_base = state(&limited_context, "lazy-encode-validation", None)?;
    let unsupported = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("test/unsupported")?,
        PropertyMap::default(),
    )])?;
    let invalid_later = insertion_operation("x", unsupported)?;
    let transaction = Transaction::new(&limited_base, vec![valid, invalid_later]);

    match TransactionJsonCodec::new(limited_context).encode(&transaction) {
        Err(TransactionCodecError::OutputTooLarge { minimum, maximum: found }) => {
            assert_eq!(found, maximum);
            assert!(minimum > maximum);
        }
        other => {
            return Err(test_error(format!(
                "expected output cap before later operation validation, got {other:?}"
            ))
            .into());
        }
    }
    Ok(())
}

#[test]
fn public_diagnostics_bound_hostile_text_and_do_not_retain_property_keys() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "bounded-diagnostics", None)?;
    let codec = TransactionJsonCodec::new(context);

    let hostile_format = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut wrong_format = request_value(&base, Vec::new());
    wrong_format["format"] = json!(hostile_format);
    match rejected(&codec, &base, &serde_json::to_string(&wrong_format)?)? {
        TransactionCodecError::UnsupportedFormat { found, .. } => {
            assert!(found.is_truncated());
            assert!(found.preview().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => return Err(test_error(format!("expected bounded format, got {other}")).into()),
    }

    let hostile_key = "k".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    let mut unknown = request_value(&base, Vec::new());
    object_mut(&mut unknown)?.insert(hostile_key, Value::Bool(true));
    match rejected(&codec, &base, &serde_json::to_string(&unknown)?)? {
        TransactionCodecError::InvalidJson(source) => {
            assert!(source.diagnostic().is_truncated());
            assert!(source.message().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(test_error(format!("expected bounded JSON failure, got {other}")).into());
        }
    }

    let secret_key = "do-not-retain-this-property-key";
    let mut nonempty_properties = request_value(&base, Vec::new());
    let mut properties = Map::new();
    properties.insert(secret_key.to_owned(), Value::Bool(true));
    nonempty_properties["pendingFormatsUpdate"] = json!({
        "kind": "set",
        "formats": [{"type": "breditor/strong", "properties": properties}],
    });
    match rejected(&codec, &base, &serde_json::to_string(&nonempty_properties)?)? {
        TransactionCodecError::InvalidJson(source) => {
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

#[test]
fn decode_never_applies_and_history_intent_round_trips_as_requested_behavior() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, "decode-does-not-apply", Some("a"))?;
    let codec = TransactionJsonCodec::new(context.clone());
    let original = base.clone();

    let stale_guard = request_json(&base, vec![text_splice(0, 1, "z", "x")])?;
    let decoded = codec.decode(&stale_guard, &base)?;
    assert_eq!(base, original);
    assert_eq!(base.snapshot().revision(), Revision::ZERO);
    assert!(matches!(
        decoded.apply(&context, &base),
        Err(TransactionApplyError::Operation { operation_index: 0, .. })
    ));
    assert_eq!(base, original);

    let metadata = TransactionMetadata::new(
        Some(QualifiedName::try_new("breditor/remote")?),
        HistoryIntent::Ignore,
    );
    let trusted_request = Transaction::new(&base, Vec::new()).with_metadata(metadata);
    let encoded = codec.encode(&trusted_request)?;
    let round_trip = codec.decode(&encoded, &base)?;
    assert_eq!(round_trip, trusted_request);
    assert!(matches!(round_trip.metadata().history(), HistoryIntent::Ignore));
    assert_eq!(base, original);
    Ok(())
}
