//! Hostile-input and failure-precedence contracts for Local Log Checkpoint V1.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, LocalLogCheckpointBindingField,
        LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits,
        LocalLogCheckpointRecordErrorCode, LocalLogCheckpointRecordLocation,
        LocalLogCheckpointResourceLimit, LocalLogCheckpointResourceLimitCode,
        LocalLogCheckpointTopologyError, LocalLogCheckpointTopologyErrorCode,
        MAX_DIAGNOSTIC_PREVIEW_BYTES, SessionCheckpointCodecError, SessionCheckpointJsonCodec,
        SessionCheckpointLimits, SessionCheckpointResourceLimit,
    },
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId,
        LocalLogRecovery, LocalSessionId, MAX_LOCAL_LOG_IDENTITY_BYTES,
    },
    schema::{CompiledSchema, DocumentLimits},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId},
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, test_error};

const SESSION_ID: &str = "session:checkpoint-json-security";
const CHECKPOINT_LOG_ID: &str = "log:checkpoint-json-sealed";
const SUCCESSOR_LOG_ID: &str = "log:checkpoint-json-successor";

fn binding() -> Result<LocalLogCheckpointBinding, Box<dyn Error>> {
    LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )
    .map_err(Into::into)
}

fn checkpoint_codec(
    context: &EditorContext,
) -> Result<LocalLogCheckpointJsonCodec, Box<dyn Error>> {
    Ok(LocalLogCheckpointJsonCodec::new(context.clone(), binding()?))
}

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    // The JSON-byte ceiling belongs to a codec envelope, not runtime document validity. Decoding
    // with the default budget lets the output-limit test construct a valid state in a tiny context.
    let document = DocumentJsonCodec::new(context.schema().clone())
        .decode(&document_json(&[paragraph(&[])]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn nested_session_value(context: &EditorContext, lineage: &str) -> Result<Value, Box<dyn Error>> {
    let session = EditorSession::new(state(context, lineage)?);
    let encoded = SessionCheckpointJsonCodec::new(context.clone()).encode(&session)?;
    serde_json::from_str(&encoded).map_err(Into::into)
}

fn minimal_value(context: &EditorContext, lineage: &str) -> Result<Value, Box<dyn Error>> {
    Ok(json!({
        "format": "breditor/local-log-checkpoint",
        "formatVersion": 1,
        "sessionId": SESSION_ID,
        "checkpointLogId": CHECKPOINT_LOG_ID,
        "successorLogId": SUCCESSOR_LOG_ID,
        "coveredThrough": null,
        "replayTombstones": [],
        "sessionCheckpoint": nested_session_value(context, lineage)?,
    }))
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, Box<dyn Error>> {
    value.as_object_mut().ok_or_else(|| test_error("fixture was not an object").into())
}

fn rejected_value(
    codec: &LocalLogCheckpointJsonCodec,
    value: &Value,
) -> Result<LocalLogCheckpointCodecError, Box<dyn Error>> {
    rejected_json(codec, &serde_json::to_string(value)?)
}

fn rejected_json(
    codec: &LocalLogCheckpointJsonCodec,
    encoded: &str,
) -> Result<LocalLogCheckpointCodecError, Box<dyn Error>> {
    codec
        .decode(encoded)
        .err()
        .ok_or_else(|| test_error("hostile local-log checkpoint was accepted").into())
}

fn duplicate_field_json(value: &Value, field: &str) -> Result<String, Box<dyn Error>> {
    let encoded = serde_json::to_string(value)?;
    let field_value =
        value.get(field).ok_or_else(|| test_error(format!("fixture omitted field {field}")))?;
    let member = format!(r#""{field}":{}"#, serde_json::to_string(field_value)?);
    let duplicated = format!("{member},{member}");
    let result = encoded.replacen(&member, &duplicated, 1);
    if result == encoded {
        return Err(test_error(format!("could not duplicate fixture field {field}")).into());
    }
    Ok(result)
}

fn empty_anchor(context: &EditorContext) -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    let recovered = LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    )
    .recover(EditorSession::new(state(context, "checkpoint-json-output-cap")?), Vec::new())?;
    recovered
        .try_into_checkpoint_anchor(
            LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
            LocalLogCompactionLimits::default(),
        )
        .map_err(Into::into)
}

#[test]
fn exact_outer_shape_rejects_every_missing_unknown_and_duplicate_field() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-exact-shape")?;
    codec.decode(&serde_json::to_string(&valid)?)?;

    for field in [
        "format",
        "formatVersion",
        "sessionId",
        "checkpointLogId",
        "successorLogId",
        "coveredThrough",
        "replayTombstones",
        "sessionCheckpoint",
    ] {
        let mut missing = valid.clone();
        object_mut(&mut missing)?.remove(field);
        assert!(
            matches!(
                rejected_value(&codec, &missing)?,
                LocalLogCheckpointCodecError::InvalidJson(_)
            ),
            "missing field {field} did not fail the strict JSON boundary"
        );

        assert!(
            matches!(
                rejected_json(&codec, &duplicate_field_json(&valid, field)?)?,
                LocalLogCheckpointCodecError::InvalidJson(_)
            ),
            "duplicate field {field} did not fail the strict JSON boundary"
        );
    }

    let mut unknown = valid;
    unknown["attackerControlled"] = json!({ "nested": [1, 2, 3] });
    assert!(matches!(
        rejected_value(&codec, &unknown)?,
        LocalLogCheckpointCodecError::InvalidJson(_)
    ));
    Ok(())
}

#[test]
fn byte_cap_and_routing_headers_have_deterministic_precedence() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;

    assert!(matches!(
        rejected_json(&codec, r#"{"format":"foreign","formatVersion":99}"#)?,
        LocalLogCheckpointCodecError::UnsupportedFormat { .. }
    ));
    assert!(matches!(
        rejected_json(&codec, r#"{"format":"breditor/local-log-checkpoint","formatVersion":99}"#,)?,
        LocalLogCheckpointCodecError::UnsupportedFormatVersion { found: 99, supported: 1 }
    ));
    assert!(matches!(
        rejected_json(&codec, r#"{"format":"breditor/local-log-checkpoint","formatVersion":1}"#,)?,
        LocalLogCheckpointCodecError::InvalidJson(_)
    ));

    let maximum = 64;
    let tiny_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let tiny_codec = checkpoint_codec(&tiny_context)?;
    let oversized_hostile =
        format!(r#"{{"format":"{}","formatVersion":99}}"#, "x".repeat(maximum * 2));
    assert!(matches!(
        rejected_json(&tiny_codec, &oversized_hostile)?,
        LocalLogCheckpointCodecError::InputTooLarge {
            actual,
            maximum: 64,
        } if actual == oversized_hostile.len()
    ));
    Ok(())
}

#[test]
fn every_wire_identity_is_checked_against_the_independent_binding() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-binding")?;

    for (field_name, replacement, expected_field) in [
        ("sessionId", "session:attacker", LocalLogCheckpointBindingField::SessionId),
        ("checkpointLogId", "log:attacker-sealed", LocalLogCheckpointBindingField::CheckpointLogId),
        (
            "successorLogId",
            "log:attacker-successor",
            LocalLogCheckpointBindingField::SuccessorLogId,
        ),
    ] {
        let mut hostile = valid.clone();
        hostile[field_name] = json!(replacement);
        let error = rejected_value(&codec, &hostile)?;
        let debug = format!("{error:?}");
        assert!(!debug.contains(replacement));
        assert!(!debug.contains(SESSION_ID));
        assert!(!debug.contains(CHECKPOINT_LOG_ID));
        assert!(!debug.contains(SUCCESSOR_LOG_ID));
        match error {
            LocalLogCheckpointCodecError::BindingMismatch { field } => {
                assert_eq!(field, expected_field);
            }
            other => {
                return Err(test_error(format!(
                    "binding mismatch for {field_name} used the wrong variant: {other}"
                ))
                .into());
            }
        }
    }
    Ok(())
}

#[test]
fn binding_mismatch_precedes_tombstone_and_nested_session_work() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let mut hostile = minimal_value(&context, "checkpoint-json-binding-precedence")?;
    hostile["sessionId"] = json!("session:foreign-precedence");
    hostile["replayTombstones"] = json!(false);
    hostile["sessionCheckpoint"] = json!(false);

    assert!(matches!(
        rejected_value(&codec, &hostile)?,
        LocalLogCheckpointCodecError::BindingMismatch {
            field: LocalLogCheckpointBindingField::SessionId
        }
    ));
    Ok(())
}

#[test]
fn same_generation_fails_before_binding_or_nested_work() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let mut hostile = minimal_value(&context, "checkpoint-json-same-generation")?;
    hostile["checkpointLogId"] = json!("log:attacker-same");
    hostile["successorLogId"] = json!("log:attacker-same");
    hostile["sessionCheckpoint"] = json!(false);

    let error = rejected_value(&codec, &hostile)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidLocalLogCheckpoint);
    assert!(matches!(
        error,
        LocalLogCheckpointCodecError::InvalidTopology(
            LocalLogCheckpointTopologyError::GenerationNotAdvanced
        )
    ));
    Ok(())
}

#[test]
fn checked_fields_report_stable_codes_and_exact_locations() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-record-locations")?;

    for (field, value, expected_code, expected_location) in [
        (
            "sessionId",
            json!(""),
            LocalLogCheckpointRecordErrorCode::InvalidSessionId,
            LocalLogCheckpointRecordLocation::SessionId,
        ),
        (
            "checkpointLogId",
            json!(""),
            LocalLogCheckpointRecordErrorCode::InvalidCheckpointLogId,
            LocalLogCheckpointRecordLocation::CheckpointLogId,
        ),
        (
            "successorLogId",
            json!(""),
            LocalLogCheckpointRecordErrorCode::InvalidSuccessorLogId,
            LocalLogCheckpointRecordLocation::SuccessorLogId,
        ),
        (
            "coveredThrough",
            json!("0"),
            LocalLogCheckpointRecordErrorCode::InvalidCoveredThrough,
            LocalLogCheckpointRecordLocation::CoveredThrough,
        ),
    ] {
        let mut hostile = valid.clone();
        hostile[field] = value;
        match rejected_value(&codec, &hostile)? {
            LocalLogCheckpointCodecError::InvalidRecord(source) => {
                assert_eq!(source.code(), expected_code);
                assert_eq!(source.location(), expected_location);
            }
            other => {
                return Err(test_error(format!(
                    "invalid field {field} used the wrong variant: {other}"
                ))
                .into());
            }
        }
    }

    assert_eq!(
        CodecErrorCode::InvalidLocalLogCheckpoint.as_str(),
        "codec.invalid_local_log_checkpoint"
    );
    assert_eq!(
        LocalLogCheckpointRecordErrorCode::InvalidReplayId.as_str(),
        "local_log_checkpoint_record.invalid_replay_id"
    );
    assert_eq!(
        LocalLogCheckpointTopologyErrorCode::DuplicateReplayId.as_str(),
        "local_log_checkpoint_topology.duplicate_replay_id"
    );
    assert_eq!(
        LocalLogCheckpointResourceLimitCode::ReplayTombstones.as_str(),
        "local_log_checkpoint_resource.replay_tombstones"
    );
    Ok(())
}

#[test]
fn top_level_identity_types_escaped_sizes_and_frontier_grammar_fail_closed() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-top-fields")?;

    for field in ["sessionId", "checkpointLogId", "successorLogId"] {
        let mut wrong_type = valid.clone();
        wrong_type[field] = json!(7);
        assert!(matches!(
            rejected_value(&codec, &wrong_type)?,
            LocalLogCheckpointCodecError::InvalidJson(_)
        ));
    }

    let valid_json = serde_json::to_string(&valid)?;
    let escaped_attacker = r"\u0061".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1);
    let escaped_json = valid_json.replacen(
        &format!(r#""sessionId":"{SESSION_ID}""#),
        &format!(r#""sessionId":"{escaped_attacker}""#),
        1,
    );
    match rejected_json(&codec, &escaped_json)? {
        LocalLogCheckpointCodecError::InvalidRecord(source) => {
            assert_eq!(source.code(), LocalLogCheckpointRecordErrorCode::InvalidSessionId);
            assert_eq!(source.location(), LocalLogCheckpointRecordLocation::SessionId);
        }
        other => {
            return Err(
                test_error(format!("escaped session ID routed incorrectly: {other}")).into()
            );
        }
    }

    for frontier in ["", "01", "-1", "18446744073709551616"] {
        let mut invalid = valid.clone();
        invalid["coveredThrough"] = json!(frontier);
        match rejected_value(&codec, &invalid)? {
            LocalLogCheckpointCodecError::InvalidRecord(source) => {
                assert_eq!(source.code(), LocalLogCheckpointRecordErrorCode::InvalidCoveredThrough);
                assert_eq!(source.location(), LocalLogCheckpointRecordLocation::CoveredThrough);
            }
            other => {
                return Err(test_error(format!(
                    "frontier `{frontier}` routed incorrectly: {other}"
                ))
                .into());
            }
        }
    }
    Ok(())
}

#[test]
fn nullable_frontier_and_complete_tombstone_count_must_agree() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-cardinality")?;

    for (covered, tombstones, expected_covered, expected_actual) in [
        (Value::Null, json!(["replay:one"]), 0, 1),
        (json!("1"), json!([]), 1, 0),
        (json!("2"), json!(["replay:one"]), 2, 1),
    ] {
        let mut hostile = valid.clone();
        hostile["coveredThrough"] = covered;
        hostile["replayTombstones"] = tombstones;
        assert!(matches!(
            rejected_value(&codec, &hostile)?,
            LocalLogCheckpointCodecError::InvalidTopology(
                LocalLogCheckpointTopologyError::TombstoneCountMismatch {
                    covered,
                    actual,
                }
            ) if covered == expected_covered && actual == expected_actual
        ));
    }
    Ok(())
}

#[test]
fn tombstones_reject_duplicates_invalid_values_and_escaped_oversize() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-tombstone-records")?;

    let mut duplicate = valid.clone();
    duplicate["coveredThrough"] = json!("2");
    duplicate["replayTombstones"] = json!(["replay:same", "replay:same"]);
    assert!(matches!(
        rejected_value(&codec, &duplicate)?,
        LocalLogCheckpointCodecError::InvalidTopology(
            LocalLogCheckpointTopologyError::DuplicateReplayId {
                first_index: 0,
                duplicate_index: 1,
            }
        )
    ));

    let mut empty = valid.clone();
    empty["coveredThrough"] = json!("1");
    empty["replayTombstones"] = json!([""]);
    match rejected_value(&codec, &empty)? {
        LocalLogCheckpointCodecError::InvalidRecord(source) => {
            assert_eq!(source.code(), LocalLogCheckpointRecordErrorCode::InvalidReplayId);
            assert_eq!(
                source.location(),
                LocalLogCheckpointRecordLocation::ReplayTombstone { tombstone_index: 0 }
            );
        }
        other => {
            return Err(test_error(format!("empty replay ID routed incorrectly: {other}")).into());
        }
    }

    let mut non_string = valid.clone();
    non_string["coveredThrough"] = json!("1");
    non_string["replayTombstones"] = json!([7]);
    assert!(matches!(
        rejected_value(&codec, &non_string)?,
        LocalLogCheckpointCodecError::InvalidReplayTombstoneJson { tombstone_index: 0, .. }
    ));

    let mut escaped_base = valid;
    escaped_base["coveredThrough"] = json!("1");
    let encoded = serde_json::to_string(&escaped_base)?;
    let escaped_attacker = r"\u0061".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1);
    let escaped_json = encoded.replacen(
        r#""replayTombstones":[]"#,
        &format!(r#""replayTombstones":["{escaped_attacker}"]"#),
        1,
    );
    let error = rejected_json(&codec, &escaped_json)?;
    match &error {
        LocalLogCheckpointCodecError::InvalidRecord(source) => {
            assert_eq!(source.code(), LocalLogCheckpointRecordErrorCode::InvalidReplayId);
            assert_eq!(
                source.location(),
                LocalLogCheckpointRecordLocation::ReplayTombstone { tombstone_index: 0 }
            );
        }
        other => {
            return Err(test_error(format!(
                "escaped oversized replay ID routed incorrectly: {other}"
            ))
            .into());
        }
    }
    assert!(!format!("{error:?}").contains(&escaped_attacker));
    Ok(())
}

#[test]
fn tombstone_limits_precede_shape_cardinality_and_u64_max_work() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(1));
    let valid = minimal_value(&context, "checkpoint-json-tombstone-limits")?;

    let mut declared_excess = valid.clone();
    declared_excess["coveredThrough"] = json!("2");
    declared_excess["replayTombstones"] = json!(false);
    assert!(matches!(
        rejected_value(&codec, &declared_excess)?,
        LocalLogCheckpointCodecError::ResourceLimit(
            LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
        )
    ));

    let mut terminal = valid.clone();
    terminal["coveredThrough"] = json!(u64::MAX.to_string());
    terminal["replayTombstones"] = json!({ "not": "an array" });
    assert!(matches!(
        rejected_value(&codec, &terminal)?,
        LocalLogCheckpointCodecError::ResourceLimit(
            LocalLogCheckpointResourceLimit::ReplayTombstones { actual: u64::MAX, maximum: 1 }
        )
    ));

    let mut observed_excess = valid;
    observed_excess["coveredThrough"] = json!("1");
    observed_excess["replayTombstones"] = json!(["replay:valid", { "hostile": true }]);
    assert!(matches!(
        rejected_value(&codec, &observed_excess)?,
        LocalLogCheckpointCodecError::ResourceLimit(
            LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
        )
    ));

    let terminal_codec = checkpoint_codec(&context)?
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(u64::MAX));
    let mut incomplete_terminal = minimal_value(&context, "checkpoint-json-terminal-max-policy")?;
    incomplete_terminal["coveredThrough"] = json!(u64::MAX.to_string());
    assert!(matches!(
        rejected_value(&terminal_codec, &incomplete_terminal)?,
        LocalLogCheckpointCodecError::InvalidTopology(
            LocalLogCheckpointTopologyError::TombstoneCountMismatch {
                covered: u64::MAX,
                actual: 0,
            }
        )
    ));
    Ok(())
}

#[test]
fn nested_session_routing_and_host_limits_remain_typed() -> TestResult {
    let context = EditorContext::default();
    let default_codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-nested")?;

    let mut wrong_format = valid.clone();
    wrong_format["sessionCheckpoint"]["format"] = json!("attacker/session-checkpoint");
    let error = rejected_value(&default_codec, &wrong_format)?;
    assert_eq!(error.code(), CodecErrorCode::UnsupportedFormat);
    assert!(matches!(
        error,
        LocalLogCheckpointCodecError::InvalidSessionCheckpoint(
            SessionCheckpointCodecError::UnsupportedFormat { .. }
        )
    ));

    let mut wrong_version = valid.clone();
    wrong_version["sessionCheckpoint"]["formatVersion"] = json!(99);
    let error = rejected_value(&default_codec, &wrong_version)?;
    assert_eq!(error.code(), CodecErrorCode::UnsupportedFormatVersion);
    assert!(matches!(
        error,
        LocalLogCheckpointCodecError::InvalidSessionCheckpoint(
            SessionCheckpointCodecError::UnsupportedFormatVersion { found: 99, supported: 1 }
        )
    ));

    let nested_limits =
        SessionCheckpointLimits::default().with_max_history_capacity(HistoryCapacity::try_new(1)?);
    let limited_codec = checkpoint_codec(&context)?
        .with_limits(LocalLogCheckpointLimits::default().with_session_checkpoint(nested_limits));
    let mut excessive_capacity = valid;
    excessive_capacity["sessionCheckpoint"]["historyCapacity"] = json!(2);
    let error = rejected_value(&limited_codec, &excessive_capacity)?;
    assert_eq!(error.code(), CodecErrorCode::ResourceLimit);
    assert!(matches!(
        error,
        LocalLogCheckpointCodecError::InvalidSessionCheckpoint(
            SessionCheckpointCodecError::ResourceLimit(
                SessionCheckpointResourceLimit::HistoryCapacity { actual: 2, maximum: 1 }
            )
        )
    ));
    Ok(())
}

#[test]
fn output_budget_is_symmetric_with_decode_budget() -> TestResult {
    let maximum = 64;
    let context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(maximum),
    );
    let codec = checkpoint_codec(&context)?;
    let anchor = empty_anchor(&context)?;

    assert!(matches!(
        codec.encode(&anchor),
        Err(LocalLogCheckpointCodecError::OutputTooLarge {
            minimum,
            maximum: 64,
        }) if minimum > 64
    ));
    Ok(())
}

#[test]
fn encode_rechecks_runtime_context_and_trusted_binding() -> TestResult {
    let context = EditorContext::default();
    let anchor = empty_anchor(&context)?;
    let foreign_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(1_024),
    );
    let foreign_context_codec = checkpoint_codec(&foreign_context)?;
    let context_error = foreign_context_codec
        .encode(&anchor)
        .err()
        .ok_or_else(|| test_error("foreign-context codec encoded the anchor"))?;
    assert_eq!(context_error.code(), CodecErrorCode::ContextMismatch);
    assert!(matches!(context_error, LocalLogCheckpointCodecError::ContextConfigurationMismatch));

    let foreign_binding = LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new("session:foreign-encode")?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )?;
    let foreign_binding_codec = LocalLogCheckpointJsonCodec::new(context, foreign_binding);
    assert!(matches!(
        foreign_binding_codec.encode(&anchor),
        Err(LocalLogCheckpointCodecError::BindingMismatch {
            field: LocalLogCheckpointBindingField::SessionId,
            ..
        })
    ));
    Ok(())
}

#[test]
fn untrusted_diagnostics_are_bounded_and_failure_does_not_poison_codec() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let valid = minimal_value(&context, "checkpoint-json-reuse")?;
    let valid_json = serde_json::to_string(&valid)?;

    let mut hostile = valid.clone();
    let attacker_format = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
    hostile["format"] = json!(attacker_format.clone());
    let error = rejected_value(&codec, &hostile)?;
    match &error {
        LocalLogCheckpointCodecError::UnsupportedFormat { found, .. } => {
            assert!(found.is_truncated());
            assert_eq!(found.preview().len(), MAX_DIAGNOSTIC_PREVIEW_BYTES);
            assert_eq!(found.original_byte_len(), attacker_format.len());
        }
        other => {
            return Err(test_error(format!("hostile format routed incorrectly: {other}")).into());
        }
    }
    assert!(!format!("{error:?}").contains(&attacker_format));

    // Decode failures retain no mutable replay scratch state inside the reusable codec.
    let restored = codec.decode(&valid_json)?;
    let reencoded = codec.encode(&restored)?;
    assert_eq!(serde_json::from_str::<Value>(&reencoded)?, valid);
    assert_eq!(codec.expected_binding(), &binding()?);
    assert_eq!(codec.context(), &context);
    Ok(())
}
