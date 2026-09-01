//! Adversarial black-box contracts for the durable local-log-entry boundary.

mod support;

use std::{error::Error, fmt::Write as _};

use breditor_core::{
    codec::{
        COMMIT_FORMAT, CodecErrorCode, CommitCodecError, LOCAL_LOG_ENTRY_FORMAT,
        LOCAL_LOG_ENTRY_FORMAT_VERSION, LocalLogCommitEventKind, LocalLogEntryCodecError,
        LocalLogEntryJsonCodec, LocalLogEntryRecordErrorCode, LocalLogEntryRecordLocation,
        MAX_DIAGNOSTIC_PREVIEW_BYTES,
    },
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventErrorCode, LocalLogEventKind, LocalLogId,
        LocalLogIdentityErrorCode, LocalLogSequence, LocalLogSequenceError, LocalSessionId,
        MAX_LOCAL_LOG_IDENTITY_BYTES, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
    transaction::{
        Commit, HistoryIntent, SelectionUpdate, Transaction, TransactionMetadata,
        TransactionOutcome,
    },
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error};

const SESSION_ID: &str = "session:security";
const LOG_ID: &str = "log:generation-1";
const REPLAY_ID: &str = "replay:security-1";

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    let document = breditor_core::codec::DocumentJsonCodec::new(context.schema().clone())
        .decode(&document_json(&[paragraph(&[])]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    if text.is_empty() {
        Ok(TextFragment::empty())
    } else {
        Ok(TextRun::try_new(text, FormatSet::default())?.into())
    }
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome
        .into_commit()
        .ok_or_else(|| test_error("security fixture transaction was unexpectedly unchanged").into())
}

fn content_commit(
    context: &EditorContext,
    lineage: &str,
    text: &str,
    metadata: TransactionMetadata,
) -> Result<Commit, Box<dyn Error>> {
    let base = state(context, lineage)?;
    let operation = TextSplice::try_new(
        TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?,
        TextFragment::empty(),
        fragment(text)?,
    )?;
    committed(
        Transaction::new(&base, vec![operation.into()])
            .with_metadata(metadata)
            .apply(context, &base)?,
    )
}

fn selection_only_commit(
    context: &EditorContext,
    lineage: &str,
    metadata: TransactionMetadata,
) -> Result<Commit, Box<dyn Error>> {
    let base = state(context, lineage)?;
    let point =
        Point::Children { parent_path: path(&[0])?, child_index: 0, affinity: Affinity::Before };
    let selection: Selection = RangeSelection::new(point.clone(), point).into();
    committed(
        Transaction::new(&base, Vec::new())
            .with_selection_update(SelectionUpdate::Set(Some(selection)))
            .with_metadata(metadata)
            .apply(context, &base)?,
    )
}

fn history_commits(context: &EditorContext) -> Result<(Commit, Commit, Commit), Box<dyn Error>> {
    let edit =
        content_commit(context, "local-log-history", "history", TransactionMetadata::default())?;
    let undo_transaction = edit.undo_transaction(edit.after())?;
    let undo = committed(undo_transaction.apply(context, edit.after())?)?;
    let redo_transaction = edit.redo_transaction(undo.after())?;
    let redo = committed(redo_transaction.apply(context, undo.after())?)?;
    Ok((edit, undo, redo))
}

fn entry(event: LocalLogEvent) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(LOG_ID)?,
        LocalLogSequence::FIRST,
        ReplayId::try_new(REPLAY_ID)?,
        event,
    ))
}

fn encoded_value(context: &EditorContext, event: LocalLogEvent) -> Result<Value, Box<dyn Error>> {
    let encoded = LocalLogEntryJsonCodec::new(context.clone()).encode(&entry(event)?)?;
    serde_json::from_str(&encoded).map_err(Into::into)
}

fn control_value(context: &EditorContext) -> Result<Value, Box<dyn Error>> {
    encoded_value(context, LocalLogEvent::clear_history())
}

fn commit_value(
    context: &EditorContext,
    lineage: &str,
    text: &str,
    metadata: TransactionMetadata,
) -> Result<Value, Box<dyn Error>> {
    encoded_value(context, LocalLogEvent::commit(content_commit(context, lineage, text, metadata)?))
}

fn rejected(
    codec: &LocalLogEntryJsonCodec,
    encoded: &str,
) -> Result<LocalLogEntryCodecError, Box<dyn Error>> {
    codec
        .decode(encoded)
        .err()
        .ok_or_else(|| test_error("hostile local-log entry was accepted").into())
}

fn rejected_value(
    codec: &LocalLogEntryJsonCodec,
    value: &Value,
) -> Result<LocalLogEntryCodecError, Box<dyn Error>> {
    rejected(codec, &serde_json::to_string(value)?)
}

fn escaped_ascii(value: &str) -> Result<String, std::fmt::Error> {
    let mut escaped = String::with_capacity(value.len().saturating_mul(6));
    for byte in value.bytes() {
        write!(&mut escaped, "\\u{byte:04x}")?;
    }
    Ok(escaped)
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, Box<dyn Error>> {
    value.as_object_mut().ok_or_else(|| test_error("fixture value is not an object").into())
}

fn event_mut(value: &mut Value) -> Result<&mut Value, Box<dyn Error>> {
    value.get_mut("event").ok_or_else(|| test_error("fixture has no event").into())
}

fn nested_commit_mut(value: &mut Value) -> Result<&mut Value, Box<dyn Error>> {
    event_mut(value)?
        .get_mut("commit")
        .ok_or_else(|| test_error("fixture event has no commit").into())
}

fn assert_invalid_json(error: &LocalLogEntryCodecError) {
    assert_eq!(error.code(), CodecErrorCode::InvalidJson, "unexpected error: {error}");
    assert!(matches!(error, LocalLogEntryCodecError::InvalidJson(_)));
}

fn assert_record_error(
    error: &LocalLogEntryCodecError,
    expected_code: LocalLogEntryRecordErrorCode,
    expected_location: LocalLogEntryRecordLocation,
) -> TestResult {
    let LocalLogEntryCodecError::InvalidRecord(record) = error else {
        return Err(test_error(format!("expected invalid record, got {error}")).into());
    };
    assert_eq!(record.code(), expected_code);
    assert_eq!(record.location(), expected_location);
    assert!(record.diagnostic_value().preview().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
    Ok(())
}

#[test]
fn outer_byte_cap_and_routing_precedence_fail_closed() -> TestResult {
    let tiny_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(64),
    );
    let tiny_codec = LocalLogEntryJsonCodec::new(tiny_context);
    let oversized = "{".repeat(65);
    assert!(matches!(
        rejected(&tiny_codec, &oversized)?,
        LocalLogEntryCodecError::InputTooLarge { actual: 65, maximum: 64 }
    ));

    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let baseline = control_value(&context)?;

    let mut wrong_format = baseline.clone();
    wrong_format["format"] = json!("attacker/log");
    wrong_format["formatVersion"] = json!(99);
    object_mut(&mut wrong_format)?.remove("event");
    assert!(matches!(
        rejected_value(&codec, &wrong_format)?,
        LocalLogEntryCodecError::UnsupportedFormat { expected: LOCAL_LOG_ENTRY_FORMAT, .. }
    ));

    let mut wrong_version = baseline.clone();
    wrong_version["formatVersion"] = json!(99);
    object_mut(&mut wrong_version)?.remove("event");
    assert!(matches!(
        rejected_value(&codec, &wrong_version)?,
        LocalLogEntryCodecError::UnsupportedFormatVersion { found: 99, supported: 1 }
    ));

    let mut selected_v1 = baseline;
    object_mut(&mut selected_v1)?.remove("event");
    assert_invalid_json(&rejected_value(&codec, &selected_v1)?);
    assert_invalid_json(&rejected(&codec, r#"{"format":"breditor/local-log-entry""#)?);
    Ok(())
}

#[test]
fn exact_seven_field_outer_shape_rejects_smuggling_and_type_confusion() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let baseline = control_value(&context)?;
    assert_eq!(baseline.as_object().map(Map::len), Some(7));
    codec.decode(&serde_json::to_string(&baseline)?)?;

    for field in ["format", "formatVersion", "sessionId", "logId", "sequence", "replayId", "event"]
    {
        let mut missing = baseline.clone();
        object_mut(&mut missing)?.remove(field);
        assert_invalid_json(&rejected_value(&codec, &missing)?);
    }

    let mut unknown = baseline.clone();
    object_mut(&mut unknown)?.insert("authorization".to_owned(), json!("smuggled"));
    assert_invalid_json(&rejected_value(&codec, &unknown)?);

    let duplicate = serde_json::to_string(&baseline)?.replacen(
        r#""replayId":"replay:security-1""#,
        r#""replayId":"first","replayId":"replay:security-1""#,
        1,
    );
    assert_invalid_json(&rejected(&codec, &duplicate)?);

    for (field, wrong) in [
        ("format", Value::Null),
        ("formatVersion", json!("1")),
        ("sessionId", json!({})),
        ("logId", json!(1)),
        ("sequence", json!(1)),
        ("replayId", json!(false)),
        ("event", Value::Null),
    ] {
        let mut malformed = baseline.clone();
        malformed[field] = wrong;
        assert_invalid_json(&rejected_value(&codec, &malformed)?);
    }

    let oversized_wrong_type = Value::Array(vec![Value::Null; 1_000]);
    for field in ["sessionId", "logId", "sequence", "replayId"] {
        let mut malformed = baseline.clone();
        malformed[field] = oversized_wrong_type.clone();
        assert_invalid_json(&rejected_value(&codec, &malformed)?);
    }
    Ok(())
}

#[test]
fn object_member_order_is_ignored_and_reencoding_restores_canonical_order() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());

    let canonical_control = codec.encode(&entry(LocalLogEvent::clear_history())?)?;
    let reordered_outer = format!(
        r#"{{"event":{{"kind":"clearHistory"}},"replayId":"{REPLAY_ID}","sequence":"1","logId":"{LOG_ID}","sessionId":"{SESSION_ID}","formatVersion":1,"format":"{LOCAL_LOG_ENTRY_FORMAT}"}}"#
    );
    let decoded_control = codec.decode(&reordered_outer)?;
    assert_eq!(codec.encode(&decoded_control)?, canonical_control);

    let commit = content_commit(
        &context,
        "local-log-member-order",
        "order",
        TransactionMetadata::default(),
    )?;
    let canonical_commit = codec.encode(&entry(LocalLogEvent::commit(commit))?)?;
    let value: Value = serde_json::from_str(&canonical_commit)?;
    let nested_commit = serde_json::to_string(&value["event"]["commit"])?;
    let reordered_commit = format!(
        r#"{{"format":"{LOCAL_LOG_ENTRY_FORMAT}","formatVersion":1,"sessionId":"{SESSION_ID}","logId":"{LOG_ID}","sequence":"1","replayId":"{REPLAY_ID}","event":{{"commit":{nested_commit},"kind":"commit"}}}}"#
    );
    assert_ne!(reordered_commit, canonical_commit);
    let decoded_commit = codec.decode(&reordered_commit)?;
    assert_eq!(codec.encode(&decoded_commit)?, canonical_commit);
    Ok(())
}

#[test]
fn identities_enforce_the_exact_ascii_grammar_and_raw_string_preflight() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let baseline = control_value(&context)?;

    let mut maximum = baseline.clone();
    maximum["sessionId"] = json!(format!("S{}", "a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES - 1)));
    maximum["logId"] = json!(format!("L{}", "0".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES - 1)));
    maximum["replayId"] = json!(format!("R{}", "-".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES - 1)));
    codec.decode(&serde_json::to_string(&maximum)?)?;

    let encoded = serde_json::to_string(&baseline)?;
    let maximum_identity = "a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES);
    let escaped_identity = escaped_ascii(&maximum_identity)?;
    for (field, original) in [("sessionId", SESSION_ID), ("logId", LOG_ID), ("replayId", REPLAY_ID)]
    {
        let escaped_record = encoded.replacen(
            &format!(r#""{field}":"{original}""#),
            &format!(r#""{field}":"{escaped_identity}""#),
            1,
        );
        let decoded = codec.decode(&escaped_record)?;
        let actual = match field {
            "sessionId" => decoded.session_id().as_str(),
            "logId" => decoded.log_id().as_str(),
            "replayId" => decoded.replay_id().as_str(),
            _ => return Err(test_error("unknown identity fixture field").into()),
        };
        assert_eq!(actual, maximum_identity);
    }

    let escaped_excess = escaped_ascii(&"a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1))?;
    for (field, original, code, location) in [
        (
            "sessionId",
            SESSION_ID,
            LocalLogEntryRecordErrorCode::InvalidSessionId,
            LocalLogEntryRecordLocation::SessionId,
        ),
        (
            "logId",
            LOG_ID,
            LocalLogEntryRecordErrorCode::InvalidLogId,
            LocalLogEntryRecordLocation::LogId,
        ),
        (
            "replayId",
            REPLAY_ID,
            LocalLogEntryRecordErrorCode::InvalidReplayId,
            LocalLogEntryRecordLocation::ReplayId,
        ),
    ] {
        let escaped_record = encoded.replacen(
            &format!(r#""{field}":"{original}""#),
            &format!(r#""{field}":"{escaped_excess}""#),
            1,
        );
        assert_record_error(&rejected(&codec, &escaped_record)?, code, location)?;
    }

    let fields = [
        (
            "sessionId",
            LocalLogEntryRecordErrorCode::InvalidSessionId,
            LocalLogEntryRecordLocation::SessionId,
        ),
        ("logId", LocalLogEntryRecordErrorCode::InvalidLogId, LocalLogEntryRecordLocation::LogId),
        (
            "replayId",
            LocalLogEntryRecordErrorCode::InvalidReplayId,
            LocalLogEntryRecordLocation::ReplayId,
        ),
    ];
    for (field, code, location) in fields {
        for invalid in ["", "-starts-with-punctuation", "contains/slash", "nonascii-é"] {
            let mut value = baseline.clone();
            value[field] = json!(invalid);
            assert_record_error(&rejected_value(&codec, &value)?, code, location)?;
        }
        let mut too_long = baseline.clone();
        too_long[field] = json!("a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1));
        assert_record_error(&rejected_value(&codec, &too_long)?, code, location)?;
    }

    let encoded = serde_json::to_string(&baseline)?;
    let escaped = r"\u0061".repeat(10_000);
    let hostile = encoded.replacen(
        r#""sessionId":"session:security""#,
        &format!(r#""sessionId":"{escaped}""#),
        1,
    );
    let error = rejected(&codec, &hostile)?;
    assert_record_error(
        &error,
        LocalLogEntryRecordErrorCode::InvalidSessionId,
        LocalLogEntryRecordLocation::SessionId,
    )?;
    let LocalLogEntryCodecError::InvalidRecord(record) = error else {
        return Err(test_error("escaped identity did not produce a record error").into());
    };
    assert!(record.diagnostic_value().original_byte_len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
    assert!(!format!("{record:?}").contains(&"a".repeat(512)));
    Ok(())
}

#[test]
fn sequence_is_a_canonical_one_based_decimal_u64_string() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let baseline = control_value(&context)?;

    for accepted in ["1", "18446744073709551615"] {
        let mut value = baseline.clone();
        value["sequence"] = json!(accepted);
        let decoded = codec.decode(&serde_json::to_string(&value)?)?;
        assert_eq!(decoded.sequence().get().to_string(), accepted);
    }

    for rejected_sequence in ["0", "00", "01", "", "-1", "+1", " 1", "1 ", "18446744073709551616"] {
        let mut value = baseline.clone();
        value["sequence"] = json!(rejected_sequence);
        assert_record_error(
            &rejected_value(&codec, &value)?,
            LocalLogEntryRecordErrorCode::InvalidSequence,
            LocalLogEntryRecordLocation::Sequence,
        )?;
    }

    for wrong_type in [json!(1), Value::Null, json!(true), json!({})] {
        let mut value = baseline.clone();
        value["sequence"] = wrong_type;
        assert_invalid_json(&rejected_value(&codec, &value)?);
    }

    let encoded = serde_json::to_string(&baseline)?;
    let maximum = u64::MAX.to_string();
    let escaped_maximum = encoded.replacen(
        r#""sequence":"1""#,
        &format!(r#""sequence":"{}""#, escaped_ascii(&maximum)?),
        1,
    );
    assert_eq!(codec.decode(&escaped_maximum)?.sequence().get(), u64::MAX);

    let escaped_twenty_one_digits = encoded.replacen(
        r#""sequence":"1""#,
        &format!(r#""sequence":"{}""#, escaped_ascii("111111111111111111111")?),
        1,
    );
    assert_record_error(
        &rejected(&codec, &escaped_twenty_one_digits)?,
        LocalLogEntryRecordErrorCode::InvalidSequence,
        LocalLogEntryRecordLocation::Sequence,
    )?;
    Ok(())
}

#[test]
fn all_five_event_shapes_are_exact_and_unknown_kinds_fail_closed() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let (edit, undo, redo) = history_commits(&context)?;
    let cases = [
        (LocalLogEvent::commit(edit), "commit", true),
        (LocalLogEvent::try_undo(undo)?, "undo", true),
        (LocalLogEvent::try_redo(redo)?, "redo", true),
        (LocalLogEvent::close_history_group(), "closeHistoryGroup", false),
        (LocalLogEvent::clear_history(), "clearHistory", false),
    ];

    let mut values = Vec::new();
    for (event, expected_kind, has_commit) in cases {
        let value = encoded_value(&context, event)?;
        assert_eq!(value["event"]["kind"], expected_kind);
        assert_eq!(value["event"].get("commit").is_some(), has_commit);
        assert_eq!(value["event"].as_object().map(Map::len), Some(if has_commit { 2 } else { 1 }));
        codec.decode(&serde_json::to_string(&value)?)?;
        values.push(value);
    }

    let control =
        values.last().cloned().ok_or_else(|| test_error("event fixture list was empty"))?;
    let mut missing_kind = control.clone();
    object_mut(event_mut(&mut missing_kind)?)?.remove("kind");
    assert_invalid_json(&rejected_value(&codec, &missing_kind)?);
    let mut unknown_kind = control.clone();
    unknown_kind["event"]["kind"] = json!("futureEvent");
    assert_invalid_json(&rejected_value(&codec, &unknown_kind)?);
    let mut smuggled_commit = control.clone();
    object_mut(event_mut(&mut smuggled_commit)?)?.insert("commit".to_owned(), json!({}));
    assert_invalid_json(&rejected_value(&codec, &smuggled_commit)?);

    let duplicate_kind = serde_json::to_string(&control)?.replacen(
        r#""kind":"clearHistory""#,
        r#""kind":"clearHistory","kind":"clearHistory""#,
        1,
    );
    assert_invalid_json(&rejected(&codec, &duplicate_kind)?);

    let commit = values.first().cloned().ok_or_else(|| test_error("commit fixture was absent"))?;
    let mut missing_commit = commit.clone();
    object_mut(event_mut(&mut missing_commit)?)?.remove("commit");
    assert_invalid_json(&rejected_value(&codec, &missing_commit)?);
    let mut unknown_commit_field = commit.clone();
    object_mut(event_mut(&mut unknown_commit_field)?)?.insert("trusted".to_owned(), json!(true));
    assert_invalid_json(&rejected_value(&codec, &unknown_commit_field)?);
    let duplicate_commit =
        serde_json::to_string(&commit)?.replacen(r#""commit":"#, r#""commit":null,"commit":"#, 1);
    assert_invalid_json(&rejected(&codec, &duplicate_commit)?);
    Ok(())
}

#[test]
fn nested_commit_v1_routing_and_typed_failures_are_preserved() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let baseline =
        commit_value(&context, "local-log-nested", "nested", TransactionMetadata::default())?;

    let mut wrong_format = baseline.clone();
    nested_commit_mut(&mut wrong_format)?["format"] = json!("attacker/commit");
    nested_commit_mut(&mut wrong_format)?["formatVersion"] = json!(99);
    object_mut(nested_commit_mut(&mut wrong_format)?)?.remove("before");
    assert!(matches!(
        rejected_value(&codec, &wrong_format)?,
        LocalLogEntryCodecError::InvalidCommit {
            event_kind: LocalLogCommitEventKind::Commit,
            source: CommitCodecError::UnsupportedFormat { expected: COMMIT_FORMAT, .. },
        }
    ));

    let mut wrong_version = baseline.clone();
    nested_commit_mut(&mut wrong_version)?["formatVersion"] = json!(2);
    object_mut(nested_commit_mut(&mut wrong_version)?)?.remove("before");
    assert!(matches!(
        rejected_value(&codec, &wrong_version)?,
        LocalLogEntryCodecError::InvalidCommit {
            event_kind: LocalLogCommitEventKind::Commit,
            source: CommitCodecError::UnsupportedFormatVersion { found: 2, supported: 1 },
        }
    ));

    let mut invalid_shape = baseline;
    object_mut(nested_commit_mut(&mut invalid_shape)?)?.remove("before");
    assert!(matches!(
        rejected_value(&codec, &invalid_shape)?,
        LocalLogEntryCodecError::InvalidCommit {
            event_kind: LocalLogCommitEventKind::Commit,
            source: CommitCodecError::InvalidJson(_),
        }
    ));
    Ok(())
}

fn assert_replay_failure(
    error: &LocalLogEntryCodecError,
    expected_code: LocalLogEventErrorCode,
    expected_kind: LocalLogEventKind,
    secret: &str,
) -> TestResult {
    assert_eq!(error.code(), CodecErrorCode::InvalidLocalLogEntry);
    let debug = format!("{error:?}");
    let display = error.to_string();
    let LocalLogEntryCodecError::InvalidEventCommit(source) = error else {
        return Err(
            test_error(format!("expected replay classification error, got {display}")).into()
        );
    };
    assert_eq!(source.code(), expected_code);
    assert_eq!(source.kind(), expected_kind);
    assert!(!debug.contains(secret));
    assert!(!display.contains(secret));
    Ok(())
}

#[test]
fn undo_and_redo_classification_errors_are_typed_and_payload_free() -> TestResult {
    const SECRET: &str = "TOP-SECRET-DOCUMENT-PAYLOAD";
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());

    for (wire_kind, runtime_kind, expected_action) in [
        ("undo", LocalLogEventKind::Undo, "breditor/undo"),
        ("redo", LocalLogEventKind::Redo, "breditor/redo"),
    ] {
        let mut wrong_action = commit_value(
            &context,
            &format!("local-log-{wire_kind}-wrong-action"),
            SECRET,
            TransactionMetadata::default(),
        )?;
        wrong_action["event"]["kind"] = json!(wire_kind);
        assert_replay_failure(
            &rejected_value(&codec, &wrong_action)?,
            LocalLogEventErrorCode::UnexpectedAction,
            runtime_kind,
            SECRET,
        )?;

        let mut wrong_history = commit_value(
            &context,
            &format!("local-log-{wire_kind}-wrong-history"),
            SECRET,
            TransactionMetadata::default(),
        )?;
        wrong_history["event"]["kind"] = json!(wire_kind);
        wrong_history["event"]["commit"]["metadata"]["action"] = json!(expected_action);
        assert_replay_failure(
            &rejected_value(&codec, &wrong_history)?,
            LocalLogEventErrorCode::UnexpectedHistoryIntent,
            runtime_kind,
            SECRET,
        )?;

        let metadata = TransactionMetadata::new(
            Some(QualifiedName::try_new(expected_action)?),
            HistoryIntent::Ignore,
        );
        let empty_commit =
            selection_only_commit(&context, &format!("local-log-{wire_kind}-empty"), metadata)?;
        let mut empty = encoded_value(&context, LocalLogEvent::commit(empty_commit))?;
        empty["event"]["kind"] = json!(wire_kind);
        assert_replay_failure(
            &rejected_value(&codec, &empty)?,
            LocalLogEventErrorCode::EmptyForwardOperations,
            runtime_kind,
            SECRET,
        )?;
    }
    Ok(())
}

#[test]
fn encode_rejects_context_mismatch_and_complete_wrapper_overflow() -> TestResult {
    let source_context = EditorContext::default();
    let commit = content_commit(
        &source_context,
        "local-log-encode-context",
        "context",
        TransactionMetadata::default(),
    )?;
    let commit_entry = entry(LocalLogEvent::commit(commit))?;
    let different_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(100_001),
    );
    assert!(matches!(
        LocalLogEntryJsonCodec::new(different_context).encode(&commit_entry),
        Err(LocalLogEntryCodecError::ContextConfigurationMismatch)
    ));

    let tiny_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(32),
    );
    let control_entry = entry(LocalLogEvent::close_history_group())?;
    assert!(matches!(
        LocalLogEntryJsonCodec::new(tiny_context).encode(&control_entry),
        Err(LocalLogEntryCodecError::OutputTooLarge { maximum: 32, .. })
    ));

    let nested_limit = 512;
    let nested_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(nested_limit),
    );
    let large_text = "x".repeat(2_048);
    let large_commit = content_commit(
        &nested_context,
        "local-log-nested-output-cap",
        &large_text,
        TransactionMetadata::default(),
    )?;
    let error = LocalLogEntryJsonCodec::new(nested_context)
        .encode(&entry(LocalLogEvent::commit(large_commit))?)
        .err()
        .ok_or_else(|| test_error("oversized nested commit unexpectedly encoded"))?;
    assert_eq!(error.code(), CodecErrorCode::OutputTooLarge);
    assert!(matches!(
        error,
        LocalLogEntryCodecError::OutputTooLarge { maximum, .. } if maximum == nested_limit
    ));
    Ok(())
}

#[test]
fn codec_reuse_after_failure_publishes_only_complete_entries() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let baseline = control_value(&context)?;
    let mut hostile = baseline.clone();
    hostile["sequence"] = json!("0");
    assert!(codec.decode(&serde_json::to_string(&hostile)?).is_err());

    let decoded = codec.decode(&serde_json::to_string(&baseline)?)?;
    assert_eq!(decoded.session_id().as_str(), SESSION_ID);
    assert_eq!(decoded.log_id().as_str(), LOG_ID);
    assert_eq!(decoded.sequence(), LocalLogSequence::FIRST);
    assert_eq!(decoded.replay_id().as_str(), REPLAY_ID);
    assert_eq!(decoded.event_kind(), LocalLogEventKind::ClearHistory);
    Ok(())
}

#[test]
fn diagnostics_are_bounded_and_public_codes_are_namespaced() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let mut hostile = control_value(&context)?;
    let format = format!("{}DO-NOT-RETAIN-THIS-TAIL", "x".repeat(4_096));
    hostile["format"] = json!(format);
    let error = rejected_value(&codec, &hostile)?;
    assert_eq!(error.code(), CodecErrorCode::UnsupportedFormat);
    let LocalLogEntryCodecError::UnsupportedFormat { found, .. } = &error else {
        return Err(test_error("hostile format did not preserve its typed route").into());
    };
    assert!(found.preview().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
    assert!(found.is_truncated());
    assert!(!format!("{error:?}").contains("DO-NOT-RETAIN-THIS-TAIL"));

    let hostile_event_tail = "EVENT-KIND-TAIL-MUST-NOT-BE-RETAINED";
    let mut hostile_event = control_value(&context)?;
    hostile_event["event"]["kind"] = json!(format!("{}{}", "e".repeat(4_096), hostile_event_tail));
    let event_error = rejected_value(&codec, &hostile_event)?;
    let LocalLogEntryCodecError::InvalidJson(event_source) = &event_error else {
        return Err(test_error("hostile event kind did not stay a JSON-shape failure").into());
    };
    assert!(event_source.diagnostic().is_truncated());
    assert!(!format!("{event_error:?}").contains(hostile_event_tail));

    let hostile_field_tail = "UNKNOWN-FIELD-TAIL-MUST-NOT-BE-RETAINED";
    let mut hostile_field = control_value(&context)?;
    object_mut(&mut hostile_field)?
        .insert(format!("{}{}", "f".repeat(4_096), hostile_field_tail), json!(true));
    let field_error = rejected_value(&codec, &hostile_field)?;
    let LocalLogEntryCodecError::InvalidJson(field_source) = &field_error else {
        return Err(test_error("hostile unknown field did not stay a JSON-shape failure").into());
    };
    assert!(field_source.diagnostic().is_truncated());
    assert!(!format!("{field_error:?}").contains(hostile_field_tail));

    let nested_tail = "NESTED-FORMAT-TAIL-MUST-NOT-BE-RETAINED";
    let mut hostile_nested =
        commit_value(&context, "local-log-diagnostic", "nested", TransactionMetadata::default())?;
    nested_commit_mut(&mut hostile_nested)?["format"] =
        json!(format!("{}{}", "n".repeat(4_096), nested_tail));
    let nested_error = rejected_value(&codec, &hostile_nested)?;
    let LocalLogEntryCodecError::InvalidCommit {
        source: CommitCodecError::UnsupportedFormat { found: nested_found, .. },
        ..
    } = &nested_error
    else {
        return Err(test_error("hostile nested format did not preserve its typed route").into());
    };
    assert!(nested_found.is_truncated());
    assert!(!format!("{nested_error:?}").contains(nested_tail));

    let broad_codes = [
        (CodecErrorCode::InvalidLocalLogEntry.as_str(), "codec.invalid_local_log_entry"),
        (CodecErrorCode::InputTooLarge.as_str(), "codec.input_too_large"),
        (CodecErrorCode::OutputTooLarge.as_str(), "codec.output_too_large"),
    ];
    for (actual, expected) in broad_codes {
        assert_eq!(actual, expected);
    }
    assert_eq!(
        LocalLogEntryRecordErrorCode::InvalidSessionId.as_str(),
        "local_log_entry_record.invalid_session_id"
    );
    assert_eq!(
        LocalLogEntryRecordErrorCode::InvalidSequence.as_str(),
        "local_log_entry_record.invalid_sequence"
    );
    assert_eq!(
        LocalLogEventErrorCode::UnexpectedAction.as_str(),
        "local_log_event.unexpected_action"
    );
    assert_eq!(
        LocalLogIdentityErrorCode::InvalidCharacter.as_str(),
        "local_log_identity.invalid_character"
    );
    assert_eq!(LocalLogSequenceError::Zero.as_str(), "local_log_sequence.zero");
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT_VERSION, 1);
    Ok(())
}
