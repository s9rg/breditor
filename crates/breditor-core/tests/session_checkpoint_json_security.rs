//! Hostile-input and failure-precedence contracts for durable session checkpoints.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, EditorStateCodecError, EditorStateRecordErrorCode,
        EditorStateRecordLocation, MAX_DIAGNOSTIC_PREVIEW_BYTES, OperationRecordErrorCode,
        RetainedResourceKind, SessionCheckpointApplicationErrorCode, SessionCheckpointCodecError,
        SessionCheckpointJsonCodec, SessionCheckpointLimits, SessionCheckpointRecordErrorCode,
        SessionCheckpointRecordLocation, SessionCheckpointReplayDirection,
        SessionCheckpointResourceLimit, SessionCheckpointTopologyError,
    },
    document::{FormatSet, TextFragment, TextRun},
    operation::{OperationValidationError, TextRange, TextSplice},
    position::TextOffset,
    schema::{CompiledSchema, DocumentLimits},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{HistoryIntent, Transaction, TransactionMetadata},
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    // JSON bytes are a codec-envelope concern, not part of runtime document validity. Using the
    // default document byte limit lets output-limit tests create a valid state under a tiny
    // checkpoint envelope budget.
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
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

fn splice_transaction(
    state: &EditorState,
    start: u64,
    end: u64,
    replacement: &str,
) -> Result<Transaction, Box<dyn Error>> {
    let range =
        TextRange::try_new(path(&[0])?, TextOffset::try_new(start)?, TextOffset::try_new(end)?)?;
    let splice =
        TextSplice::capture(state.context(), state.document(), range, fragment(replacement)?)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn session_with_splices(
    context: &EditorContext,
    lineage: &str,
    initial_text: &str,
    splices: &[(u64, u64, &str)],
) -> Result<EditorSession, Box<dyn Error>> {
    let mut session = EditorSession::new(state(context, initial_text, lineage)?);
    for &(start, end, replacement) in splices {
        let transaction = splice_transaction(session.state(), start, end, replacement)?;
        let outcome = session.apply_transaction(&transaction)?;
        if outcome.into_commit().is_none() {
            return Err(test_error("security fixture splice was unexpectedly unchanged").into());
        }
    }
    Ok(session)
}

fn checkpoint_value(
    context: &EditorContext,
    lineage: &str,
    initial_text: &str,
    splices: &[(u64, u64, &str)],
) -> Result<Value, Box<dyn Error>> {
    let session = session_with_splices(context, lineage, initial_text, splices)?;
    let encoded = SessionCheckpointJsonCodec::new(context.clone()).encode(&session)?;
    serde_json::from_str(&encoded).map_err(Into::into)
}

fn minimal_value(context: &EditorContext, lineage: &str) -> Result<Value, Box<dyn Error>> {
    checkpoint_value(context, lineage, "", &[])
}

fn one_entry_value(context: &EditorContext, lineage: &str) -> Result<Value, Box<dyn Error>> {
    checkpoint_value(context, lineage, "", &[(0, 0, "a")])
}

fn two_entry_value(context: &EditorContext, lineage: &str) -> Result<Value, Box<dyn Error>> {
    checkpoint_value(context, lineage, "", &[(0, 0, "a"), (1, 1, "b")])
}

fn rejected_value(
    codec: &SessionCheckpointJsonCodec,
    value: &Value,
) -> Result<SessionCheckpointCodecError, Box<dyn Error>> {
    rejected_json(codec, &serde_json::to_string(value)?)
}

fn rejected_json(
    codec: &SessionCheckpointJsonCodec,
    encoded: &str,
) -> Result<SessionCheckpointCodecError, Box<dyn Error>> {
    codec
        .decode(encoded)
        .err()
        .ok_or_else(|| test_error("hostile session checkpoint was accepted").into())
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, Box<dyn Error>> {
    value.as_object_mut().ok_or_else(|| test_error("fixture value was not an object").into())
}

fn entry_mut(value: &mut Value, index: usize) -> Result<&mut Value, Box<dyn Error>> {
    value
        .get_mut("entries")
        .and_then(Value::as_array_mut)
        .and_then(|entries| entries.get_mut(index))
        .ok_or_else(|| test_error(format!("fixture had no entry {index}")).into())
}

fn operation_mut(
    value: &mut Value,
    entry: usize,
    operation: usize,
) -> Result<&mut Value, Box<dyn Error>> {
    entry_mut(value, entry)?
        .get_mut("forwardOperations")
        .and_then(Value::as_array_mut)
        .and_then(|operations| operations.get_mut(operation))
        .ok_or_else(|| {
            test_error(format!("fixture had no operation {operation} in entry {entry}")).into()
        })
}

fn canonical_no_op() -> Value {
    json!({
        "kind": "textSplice",
        "range": { "containerPath": [0], "start": 0, "end": 0 },
        "expectedRemoved": { "runs": [] },
        "replacement": { "runs": [] },
    })
}

#[test]
fn exact_envelope_and_entry_shapes_require_nullable_fields() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let minimal = minimal_value(&context, "checkpoint-security-shape-minimal")?;
    assert!(minimal.get("openMergeGroup").is_some_and(Value::is_null));
    codec.decode(&serde_json::to_string(&minimal)?)?;

    for field in [
        "format",
        "formatVersion",
        "historyBase",
        "currentRevision",
        "historyCapacity",
        "cursor",
        "entries",
        "openMergeGroup",
    ] {
        let mut malformed = minimal.clone();
        object_mut(&mut malformed)?.remove(field);
        assert!(
            matches!(
                rejected_value(&codec, &malformed)?,
                SessionCheckpointCodecError::InvalidJson(_)
            ),
            "missing top-level field {field} did not route to InvalidJson"
        );
    }

    let mut unknown = minimal.clone();
    object_mut(&mut unknown)?.insert("unknown".to_owned(), Value::Null);
    assert!(matches!(
        rejected_value(&codec, &unknown)?,
        SessionCheckpointCodecError::InvalidJson(_)
    ));

    let duplicate = serde_json::to_string(&minimal)?.replacen(
        r#""format":"breditor/session-checkpoint""#,
        r#""format":"breditor/session-checkpoint","format":"breditor/session-checkpoint""#,
        1,
    );
    assert!(matches!(
        rejected_json(&codec, &duplicate)?,
        SessionCheckpointCodecError::InvalidJson(_)
    ));

    let entry = one_entry_value(&context, "checkpoint-security-shape-entry")?;
    assert!(entry["entries"][0]["resultSelection"].is_null());
    assert!(entry["entries"][0]["resultPendingFormats"].is_null());
    for field in ["forwardOperations", "resultSelection", "resultPendingFormats"] {
        let mut malformed = entry.clone();
        object_mut(entry_mut(&mut malformed, 0)?)?.remove(field);
        match rejected_value(&codec, &malformed)? {
            SessionCheckpointCodecError::InvalidEntryJson { entry_index: 0, .. } => {}
            other => {
                return Err(test_error(format!(
                    "missing entry field {field} did not preserve its entry index: {other}"
                ))
                .into());
            }
        }
    }

    let mut unknown_entry = entry.clone();
    object_mut(entry_mut(&mut unknown_entry, 0)?)?.insert("unknown".to_owned(), Value::Null);
    assert!(matches!(
        rejected_value(&codec, &unknown_entry)?,
        SessionCheckpointCodecError::InvalidEntryJson { entry_index: 0, .. }
    ));

    let duplicate_entry = serde_json::to_string(&entry)?.replacen(
        r#""resultSelection":null"#,
        r#""resultSelection":null,"resultSelection":null"#,
        1,
    );
    assert!(matches!(
        rejected_json(&codec, &duplicate_entry)?,
        SessionCheckpointCodecError::InvalidEntryJson { entry_index: 0, .. }
    ));
    Ok(())
}

#[test]
fn format_version_and_history_base_headers_have_stable_routing_precedence() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let minimal = minimal_value(&context, "checkpoint-security-routing")?;

    let mut wrong_format = minimal.clone();
    wrong_format["format"] = json!("attacker/format");
    wrong_format["formatVersion"] = json!(99);
    object_mut(&mut wrong_format)?.remove("historyBase");
    assert!(matches!(
        rejected_value(&codec, &wrong_format)?,
        SessionCheckpointCodecError::UnsupportedFormat { .. }
    ));

    let mut wrong_version = minimal.clone();
    wrong_version["formatVersion"] = json!(99);
    object_mut(&mut wrong_version)?.remove("historyBase");
    assert!(matches!(
        rejected_value(&codec, &wrong_version)?,
        SessionCheckpointCodecError::UnsupportedFormatVersion { found: 99, supported: 1 }
    ));

    let mut selected_v1 = minimal.clone();
    object_mut(&mut selected_v1)?.remove("historyBase");
    assert!(matches!(
        rejected_value(&codec, &selected_v1)?,
        SessionCheckpointCodecError::InvalidJson(_)
    ));
    assert!(matches!(
        rejected_json(&codec, r#"{"format":"breditor/session-checkpoint""#)?,
        SessionCheckpointCodecError::InvalidJson(_)
    ));

    let mut bad_base_precedes_capacity = minimal;
    bad_base_precedes_capacity["historyBase"]["format"] = json!("attacker/editor-state");
    let base_error = rejected_value(&codec, &bad_base_precedes_capacity)?;
    assert!(
        matches!(
            &base_error,
            SessionCheckpointCodecError::InvalidHistoryBase(
                EditorStateCodecError::UnsupportedFormat { .. }
            )
        ),
        "history-base header was accepted: {base_error:?}"
    );
    bad_base_precedes_capacity["historyCapacity"] = json!(u32::MAX);
    assert_eq!(bad_base_precedes_capacity["historyBase"]["format"], "attacker/editor-state");
    let error = rejected_value(&codec, &bad_base_precedes_capacity)?;
    assert!(
        matches!(
            &error,
            SessionCheckpointCodecError::ResourceLimit(
                SessionCheckpointResourceLimit::HistoryCapacity {
                    actual: u32::MAX,
                    maximum: 10_000,
                }
            )
        ),
        "capacity preflight did not precede history-base decoding: {error:?}"
    );
    Ok(())
}

#[test]
fn revisions_are_strict_canonical_decimal_u64_values() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let minimal = minimal_value(&context, "checkpoint-security-revision")?;

    let mut maximum = minimal.clone();
    maximum["currentRevision"] = json!(u64::MAX.to_string());
    let restored = codec.decode(&serde_json::to_string(&maximum)?)?;
    assert_eq!(restored.state().snapshot().revision(), Revision::new(u64::MAX));

    for rejected in ["", "00", "01", "+1", "-1", "1.0", " 1", "18446744073709551616"] {
        let mut malformed = minimal.clone();
        malformed["currentRevision"] = json!(rejected);
        match rejected_value(&codec, &malformed)? {
            SessionCheckpointCodecError::InvalidRecord(source) => {
                assert_eq!(source.code(), SessionCheckpointRecordErrorCode::InvalidCurrentRevision);
                assert_eq!(source.location(), SessionCheckpointRecordLocation::CurrentRevision);
            }
            other => {
                return Err(test_error(format!(
                    "noncanonical current revision {rejected:?} routed incorrectly: {other}"
                ))
                .into());
            }
        }
    }

    let mut numeric = minimal.clone();
    numeric["currentRevision"] = json!(1);
    assert!(matches!(
        rejected_value(&codec, &numeric)?,
        SessionCheckpointCodecError::InvalidJson(_)
    ));

    let mut nonzero_base = minimal.clone();
    nonzero_base["historyBase"]["snapshot"]["revision"] = json!(u64::MAX.to_string());
    assert!(matches!(
        rejected_value(&codec, &nonzero_base)?,
        SessionCheckpointCodecError::NonZeroHistoryBaseRevision { actual }
            if actual == Revision::new(u64::MAX)
    ));

    let mut noncanonical_base = minimal;
    noncanonical_base["historyBase"]["snapshot"]["revision"] = json!("00");
    match rejected_value(&codec, &noncanonical_base)? {
        SessionCheckpointCodecError::InvalidHistoryBase(
            EditorStateCodecError::InvalidEditorState(source),
        ) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::InvalidSnapshotRevision);
            assert_eq!(source.location(), EditorStateRecordLocation::SnapshotRevision);
        }
        other => {
            return Err(test_error(format!(
                "noncanonical base revision routed incorrectly: {other}"
            ))
            .into());
        }
    }
    Ok(())
}

#[test]
fn capacity_cursor_and_open_group_topology_are_checked_before_replay() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let one = one_entry_value(&context, "checkpoint-security-topology-one")?;

    let mut above_capacity = one.clone();
    above_capacity["historyCapacity"] = json!(0);
    assert!(matches!(
        rejected_value(&codec, &above_capacity)?,
        SessionCheckpointCodecError::InvalidTopology(
            SessionCheckpointTopologyError::EntryCountExceedsCapacity { actual: 1, capacity: 0 }
        )
    ));

    let mut bad_cursor = one.clone();
    bad_cursor["cursor"] = json!(2);
    assert!(matches!(
        rejected_value(&codec, &bad_cursor)?,
        SessionCheckpointCodecError::InvalidTopology(
            SessionCheckpointTopologyError::CursorOutOfBounds { cursor: 2, entries: 1 }
        )
    ));

    let mut no_undo = minimal_value(&context, "checkpoint-security-open-empty")?;
    no_undo["openMergeGroup"] = json!("test/open");
    assert!(matches!(
        rejected_value(&codec, &no_undo)?,
        SessionCheckpointCodecError::InvalidTopology(
            SessionCheckpointTopologyError::OpenMergeGroupWithoutUndo
        )
    ));

    let mut with_redo = two_entry_value(&context, "checkpoint-security-open-redo")?;
    with_redo["cursor"] = json!(1);
    with_redo["openMergeGroup"] = json!("test/open");
    assert!(matches!(
        rejected_value(&codec, &with_redo)?,
        SessionCheckpointCodecError::InvalidTopology(
            SessionCheckpointTopologyError::OpenMergeGroupWithRedo { cursor: 1, entries: 2 }
        )
    ));

    let mut invalid_group = one;
    invalid_group["openMergeGroup"] = json!("not-qualified");
    match rejected_value(&codec, &invalid_group)? {
        SessionCheckpointCodecError::InvalidRecord(source) => {
            assert_eq!(source.code(), SessionCheckpointRecordErrorCode::InvalidQualifiedName);
            assert_eq!(source.location(), SessionCheckpointRecordLocation::OpenMergeGroup);
        }
        other => {
            return Err(
                test_error(format!("invalid merge group routed incorrectly: {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn host_capacity_per_entry_and_aggregate_operation_limits_are_independent() -> TestResult {
    let context = EditorContext::default();
    let mut capacity_record = minimal_value(&context, "checkpoint-security-host-capacity")?;
    capacity_record["historyCapacity"] = json!(2);
    let capacity_codec = SessionCheckpointJsonCodec::new(context.clone()).with_limits(
        SessionCheckpointLimits::default().with_max_history_capacity(HistoryCapacity::try_new(1)?),
    );
    assert!(matches!(
        rejected_value(&capacity_codec, &capacity_record)?,
        SessionCheckpointCodecError::ResourceLimit(
            SessionCheckpointResourceLimit::HistoryCapacity { actual: 2, maximum: 1 }
        )
    ));

    let operation_context = context.clone().with_max_operations_per_transaction(1);
    let operation_codec = SessionCheckpointJsonCodec::new(operation_context.clone());
    let mut empty = one_entry_value(&operation_context, "checkpoint-security-empty-entry")?;
    empty["entries"][0]["forwardOperations"] = json!([]);
    assert!(matches!(
        rejected_value(&operation_codec, &empty)?,
        SessionCheckpointCodecError::InvalidTopology(
            SessionCheckpointTopologyError::EmptyEntryOperations { entry_index: 0 }
        )
    ));

    let mut too_many = one_entry_value(&operation_context, "checkpoint-security-entry-ops")?;
    let duplicate = too_many["entries"][0]["forwardOperations"][0].clone();
    too_many["entries"][0]["forwardOperations"]
        .as_array_mut()
        .ok_or_else(|| test_error("operations fixture was not an array"))?
        .push(duplicate);
    assert!(matches!(
        rejected_value(&operation_codec, &too_many)?,
        SessionCheckpointCodecError::ResourceLimit(
            SessionCheckpointResourceLimit::EntryOperations {
                entry_index: 0,
                actual: 2,
                maximum: 1,
            }
        )
    ));

    let aggregate = two_entry_value(&context, "checkpoint-security-aggregate")?;
    let aggregate_codec = SessionCheckpointJsonCodec::new(context)
        .with_limits(SessionCheckpointLimits::default().with_max_aggregate_forward_operations(1));
    assert!(matches!(
        rejected_value(&aggregate_codec, &aggregate)?,
        SessionCheckpointCodecError::ResourceLimit(
            SessionCheckpointResourceLimit::AggregateForwardOperations { actual: 2, maximum: 1 }
        )
    ));
    Ok(())
}

#[test]
fn malformed_record_static_validation_and_guard_failures_keep_exact_indices() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let valid = one_entry_value(&context, "checkpoint-security-operation-errors")?;

    let mut malformed_json = valid.clone();
    object_mut(operation_mut(&mut malformed_json, 0, 0)?)?.remove("range");
    assert!(matches!(
        rejected_value(&codec, &malformed_json)?,
        SessionCheckpointCodecError::InvalidOperationJson {
            entry_index: 0,
            operation_index: 0,
            ..
        }
    ));

    let mut invalid_record = valid.clone();
    invalid_record["entries"][0]["forwardOperations"][0]["range"]["start"] = json!(1);
    invalid_record["entries"][0]["forwardOperations"][0]["range"]["end"] = json!(0);
    match rejected_value(&codec, &invalid_record)? {
        SessionCheckpointCodecError::InvalidOperation {
            entry_index: 0,
            operation_index: 0,
            source,
        } => assert_eq!(source.code(), OperationRecordErrorCode::InvalidRange),
        other => {
            return Err(test_error(format!(
                "invalid operation record routed incorrectly: {other}"
            ))
            .into());
        }
    }

    let mut invalid_for_context = valid.clone();
    invalid_for_context["entries"][0]["forwardOperations"][0]["range"]["containerPath"] =
        json!([u32::MAX]);
    match rejected_value(&codec, &invalid_for_context)? {
        SessionCheckpointCodecError::OperationValidation {
            entry_index: 0,
            operation_index: 0,
            source: OperationValidationError::PathIndexLimit { .. },
        } => {}
        other => {
            return Err(
                test_error(format!("operation validation routed incorrectly: {other}")).into()
            );
        }
    }

    let mut stale_guard = valid.clone();
    stale_guard["entries"][0]["forwardOperations"][0]["range"]["start"] = json!(1);
    stale_guard["entries"][0]["forwardOperations"][0]["range"]["end"] = json!(1);
    match rejected_value(&codec, &stale_guard)? {
        SessionCheckpointCodecError::Apply(source) => {
            assert_eq!(source.entry_index(), 0);
            assert_eq!(source.direction(), SessionCheckpointReplayDirection::Forward);
            assert_eq!(source.operation_index(), Some(0));
            assert_eq!(source.code(), SessionCheckpointApplicationErrorCode::Operation);
            assert!(source.diagnostic().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        }
        other => {
            return Err(
                test_error(format!("operation guard failure routed incorrectly: {other}")).into()
            );
        }
    }
    Ok(())
}

#[test]
fn unchanged_operations_are_rejected_at_the_first_noncanonical_wire_index() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let valid = one_entry_value(&context, "checkpoint-security-canonical")?;

    let mut leading = valid.clone();
    leading["entries"][0]["forwardOperations"]
        .as_array_mut()
        .ok_or_else(|| test_error("operations fixture was not an array"))?
        .insert(0, canonical_no_op());
    assert!(matches!(
        rejected_value(&codec, &leading)?,
        SessionCheckpointCodecError::NonCanonicalForwardOperations {
            entry_index: 0,
            operation_index: 0,
        }
    ));

    let mut trailing = valid.clone();
    trailing["entries"][0]["forwardOperations"]
        .as_array_mut()
        .ok_or_else(|| test_error("operations fixture was not an array"))?
        .push(canonical_no_op());
    assert!(matches!(
        rejected_value(&codec, &trailing)?,
        SessionCheckpointCodecError::NonCanonicalForwardOperations {
            entry_index: 0,
            operation_index: 1,
        }
    ));

    let mut only = valid;
    only["entries"][0]["forwardOperations"] = json!([canonical_no_op()]);
    assert!(matches!(
        rejected_value(&codec, &only)?,
        SessionCheckpointCodecError::UnexpectedUnchanged {
            entry_index: 0,
            direction: SessionCheckpointReplayDirection::Forward,
        }
    ));
    Ok(())
}

#[test]
fn retained_boundary_budgets_apply_to_decode_and_encode() -> TestResult {
    let context = EditorContext::default();
    let minimal = minimal_value(&context, "checkpoint-security-retained-base")?;
    let node_limits = SessionCheckpointLimits::default().with_max_retained_nodes(1);
    let node_codec = SessionCheckpointJsonCodec::new(context.clone()).with_limits(node_limits);
    assert!(matches!(
        rejected_value(&node_codec, &minimal)?,
        SessionCheckpointCodecError::ResourceLimit(SessionCheckpointResourceLimit::Retained {
            kind: RetainedResourceKind::Nodes,
            boundary_index: 0,
            actual: 2,
            maximum: 1,
        })
    ));
    let minimal_session =
        session_with_splices(&context, "checkpoint-security-retained-encode", "", &[])?;
    assert!(matches!(
        node_codec.encode(&minimal_session),
        Err(SessionCheckpointCodecError::ResourceLimit(SessionCheckpointResourceLimit::Retained {
            kind: RetainedResourceKind::Nodes,
            boundary_index: 0,
            actual: 2,
            maximum: 1,
        }))
    ));

    let one = one_entry_value(&context, "checkpoint-security-retained-text")?;
    let text_codec = SessionCheckpointJsonCodec::new(context.clone())
        .with_limits(SessionCheckpointLimits::default().with_max_retained_text_bytes(0));
    assert!(matches!(
        rejected_value(&text_codec, &one)?,
        SessionCheckpointCodecError::ResourceLimit(SessionCheckpointResourceLimit::Retained {
            kind: RetainedResourceKind::TextBytes,
            boundary_index: 1,
            actual: 1,
            maximum: 0,
        })
    ));

    let property_codec = SessionCheckpointJsonCodec::new(context)
        .with_limits(SessionCheckpointLimits::default().with_max_retained_property_values(0));
    property_codec.decode(&serde_json::to_string(&minimal)?)?;
    Ok(())
}

#[test]
fn byte_caps_are_symmetric_and_checked_before_semantic_routing() -> TestResult {
    let default_context = EditorContext::default();
    let valid = minimal_value(&default_context, "checkpoint-security-byte-input")?;
    let valid_json = serde_json::to_string(&valid)?;
    let maximum = 64;
    assert!(valid_json.len() > maximum);

    let tiny_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let codec = SessionCheckpointJsonCodec::new(tiny_context.clone());
    assert!(matches!(
        rejected_json(&codec, &valid_json)?,
        SessionCheckpointCodecError::InputTooLarge {
            actual,
            maximum: 64,
        } if actual == valid_json.len()
    ));

    let hostile = format!(r#"{{"format":"{}","formatVersion":99}}"#, "x".repeat(128));
    assert!(matches!(
        rejected_json(&codec, &hostile)?,
        SessionCheckpointCodecError::InputTooLarge { maximum: 64, .. }
    ));

    let session = session_with_splices(&tiny_context, "checkpoint-security-byte-output", "", &[])?;
    assert!(matches!(
        codec.encode(&session),
        Err(SessionCheckpointCodecError::OutputTooLarge {
            minimum,
            maximum: 64,
        }) if minimum > 64
    ));
    Ok(())
}

#[test]
fn untrusted_diagnostics_are_bounded_and_codec_is_reusable_after_failure() -> TestResult {
    let context = EditorContext::default();
    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let valid = one_entry_value(&context, "checkpoint-security-reuse")?;
    let valid_json = serde_json::to_string(&valid)?;

    let mut hostile_format = valid.clone();
    let complete_format = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    hostile_format["format"] = json!(complete_format);
    match rejected_value(&codec, &hostile_format)? {
        SessionCheckpointCodecError::UnsupportedFormat { found, .. } => {
            assert!(found.is_truncated());
            assert_eq!(found.preview().len(), MAX_DIAGNOSTIC_PREVIEW_BYTES);
            assert_eq!(found.original_byte_len(), MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
        }
        other => {
            return Err(test_error(format!("hostile format routed incorrectly: {other}")).into());
        }
    }

    let guarded_text = "s".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 2);
    let guarded_session = session_with_splices(
        &context,
        "checkpoint-security-bounded-apply",
        &guarded_text,
        &[(0, (MAX_DIAGNOSTIC_PREVIEW_BYTES * 2) as u64, "")],
    )?;
    let mut guarded: Value = serde_json::from_str(&codec.encode(&guarded_session)?)?;
    let attacker_fragment = "z".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 2);
    guarded["entries"][0]["forwardOperations"][0]["expectedRemoved"]["runs"][0]["text"] =
        json!(attacker_fragment.clone());
    match rejected_value(&codec, &guarded)? {
        SessionCheckpointCodecError::Apply(source) => {
            assert_eq!(source.code(), SessionCheckpointApplicationErrorCode::Operation);
            assert_eq!(source.direction(), SessionCheckpointReplayDirection::Forward);
            assert!(source.diagnostic().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
            let debug = format!("{source:?}");
            assert!(!debug.contains(&attacker_fragment));
            assert!(!debug.contains(&guarded_text));
        }
        other => {
            return Err(test_error(format!("guard mismatch routed incorrectly: {other}")).into());
        }
    }

    // A failed decode cannot poison replay scratch state or the codec's configured context.
    let restored = codec.decode(&valid_json)?;
    assert_eq!(serde_json::from_str::<Value>(&codec.encode(&restored)?)?, valid);
    assert_eq!(codec.context(), &context);
    assert_eq!(CodecErrorCode::ValidationFailed.as_str(), "codec.validation_failed");
    Ok(())
}
