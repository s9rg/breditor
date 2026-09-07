//! Public V2 local-log-checkpoint wire, binding, nesting, and limit contracts.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, LOCAL_LOG_CHECKPOINT_FORMAT,
        LOCAL_LOG_CHECKPOINT_FORMAT_VERSION, LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION,
        LocalLogCheckpointBindingField, LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec,
        LocalLogCheckpointJsonCodecV2, LocalLogCheckpointLimits, LocalLogCheckpointResourceLimit,
        LocalLogCheckpointV2CodecError, SESSION_CHECKPOINT_V2_FORMAT_VERSION,
        SessionCheckpointJsonCodecV2, SessionCheckpointV2CodecError,
    },
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits,
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogRecovery, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::Transaction,
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error};

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const SESSION_ID: &str = "session:checkpoint-v2";
const CHECKPOINT_LOG_ID: &str = "log:checkpoint-v2-prefix";
const SUCCESSOR_LOG_ID: &str = "log:checkpoint-v2-successor";

fn state(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[])]))?;
    EditorState::try_new(
        context,
        LineageId::try_new("local-log-checkpoint-v2")?,
        document,
        None,
        None,
    )
    .map_err(Into::into)
}

fn binding() -> Result<LocalLogCheckpointBinding, Box<dyn Error>> {
    Ok(LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )?)
}

fn checkpoint_anchor(
    context: &EditorContext,
    replay_count: u64,
) -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    if replay_count > 2 {
        return Err(test_error("checkpoint fixture supports at most two entries").into());
    }
    let initial = state(context)?;
    let mut prefix = Vec::new();
    if replay_count >= 1 {
        let range = TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?;
        let replacement: TextFragment = TextRun::try_new("x", FormatSet::default())?.into();
        let splice = TextSplice::capture(context, initial.document(), range, replacement)?;
        let commit = Transaction::new(&initial, vec![splice.into()])
            .apply(context, &initial)?
            .into_commit()
            .ok_or_else(|| test_error("checkpoint fixture edit was unchanged"))?;
        prefix.push(LocalLogEntry::new(
            LocalSessionId::try_new(SESSION_ID)?,
            LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
            LocalLogSequence::FIRST,
            ReplayId::try_new("replay:checkpoint-v2-1")?,
            LocalLogEvent::commit(commit),
        ));
    }
    if replay_count == 2 {
        prefix.push(LocalLogEntry::new(
            LocalSessionId::try_new(SESSION_ID)?,
            LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
            LocalLogSequence::try_new(2)?,
            ReplayId::try_new("replay:checkpoint-v2-2")?,
            LocalLogEvent::clear_history(),
        ));
    }
    Ok(LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    )
    .recover(EditorSession::new(initial), prefix)?
    .try_into_checkpoint_anchor(
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
        LocalLogCompactionLimits::default(),
    )?)
}

fn checkpoint_codec(
    context: &EditorContext,
) -> Result<LocalLogCheckpointJsonCodecV2, Box<dyn Error>> {
    Ok(LocalLogCheckpointJsonCodecV2::new(context.clone(), binding()?))
}

fn rejected(
    codec: &LocalLogCheckpointJsonCodecV2,
    json: &str,
) -> Result<LocalLogCheckpointV2CodecError, Box<dyn Error>> {
    codec
        .decode(json)
        .err()
        .ok_or_else(|| test_error("hostile Local Log Checkpoint V2 unexpectedly decoded").into())
}

#[test]
fn canonical_empty_outer_shape_is_exact_and_byte_stable() -> TestResult {
    assert_eq!(LOCAL_LOG_CHECKPOINT_FORMAT, "breditor/local-log-checkpoint");
    assert_eq!(LOCAL_LOG_CHECKPOINT_FORMAT_VERSION, 1);
    assert_eq!(LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION, 2);
    assert_eq!(SESSION_CHECKPOINT_V2_FORMAT_VERSION, 2);

    let context = EditorContext::default();
    let anchor = checkpoint_anchor(&context, 0)?;
    let nested = SessionCheckpointJsonCodecV2::new(context.clone()).encode(anchor.session())?;
    let codec = checkpoint_codec(&context)?;
    let encoded = codec.encode(&anchor)?;
    let expected = format!(
        concat!(
            r#"{{"format":"breditor/local-log-checkpoint","formatVersion":2,"#,
            r#""schema":{{"name":"breditor/base","version":1}},"#,
            r#""schemaFingerprint":"{}","#,
            r#""sessionId":"{}","checkpointLogId":"{}","#,
            r#""successorLogId":"{}","coveredThrough":null,"#,
            r#""replayTombstones":[],"sessionCheckpoint":{}}}"#,
        ),
        BASE_FINGERPRINT, SESSION_ID, CHECKPOINT_LOG_ID, SUCCESSOR_LOG_ID, nested,
    );
    assert_eq!(encoded, expected);
    assert_eq!(codec.encode(&anchor)?, encoded);

    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value.as_object().map(Map::len), Some(10));
    assert_eq!(value["sessionCheckpoint"]["formatVersion"], 2);
    assert_eq!(value["sessionCheckpoint"]["schemaFingerprint"], BASE_FINGERPRINT);

    let restored = codec.decode(&encoded)?;
    assert_eq!(restored.schema_binding(), anchor.schema_binding());
    assert_eq!(restored.checkpoint_covered_through(), None);
    assert_eq!(restored.compacted_replay_count(), 0);
    assert_eq!(codec.encode(&restored)?, encoded);
    Ok(())
}

#[test]
fn outer_and_nested_v1_v2_generations_never_mix() -> TestResult {
    let context = EditorContext::default();
    let anchor = checkpoint_anchor(&context, 0)?;
    let v2 = checkpoint_codec(&context)?;
    let v2_json = v2.encode(&anchor)?;
    let v1 = LocalLogCheckpointJsonCodec::new(context, binding()?);
    assert!(matches!(
        v1.decode(&v2_json),
        Err(LocalLogCheckpointCodecError::UnsupportedFormatVersion { found: 2, supported: 1 })
    ));

    let v1_json = v1.encode(&anchor)?;
    assert!(matches!(
        rejected(&v2, &v1_json)?,
        LocalLogCheckpointV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 }
    ));

    let mut mixed: Value = serde_json::from_str(&v2_json)?;
    mixed["sessionCheckpoint"]["formatVersion"] = json!(1);
    assert!(matches!(
        rejected(&v2, &serde_json::to_string(&mixed)?)?,
        LocalLogCheckpointV2CodecError::InvalidSessionCheckpoint(source)
            if matches!(*source, SessionCheckpointV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 })
    ));

    let mut nested_mismatch: Value = serde_json::from_str(&v2_json)?;
    nested_mismatch["sessionCheckpoint"]["schemaFingerprint"] =
        json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(matches!(
        rejected(&v2, &serde_json::to_string(&nested_mismatch)?)?,
        LocalLogCheckpointV2CodecError::InvalidSessionCheckpoint(source)
            if matches!(*source, SessionCheckpointV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
    ));
    Ok(())
}

#[test]
fn strict_binding_shape_syntax_precedence_and_expected_scope_fail_closed() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let baseline = codec.encode(&checkpoint_anchor(&context, 0)?)?;
    let value: Value = serde_json::from_str(&baseline)?;

    for field in ["schema", "schemaFingerprint"] {
        let mut missing = value.clone();
        missing
            .as_object_mut()
            .ok_or_else(|| test_error("fixture is not an object"))?
            .remove(field);
        assert!(matches!(
            rejected(&codec, &serde_json::to_string(&missing)?)?,
            LocalLogCheckpointV2CodecError::InvalidJson(_)
        ));
    }

    let mut unknown = value.clone();
    unknown
        .as_object_mut()
        .ok_or_else(|| test_error("fixture is not an object"))?
        .insert("authority".to_owned(), json!(true));
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&unknown)?)?,
        LocalLogCheckpointV2CodecError::InvalidJson(_)
    ));

    let fingerprint_field = format!(r#""schemaFingerprint":"{BASE_FINGERPRINT}""#);
    let duplicate = baseline.replacen(
        &fingerprint_field,
        &format!("{fingerprint_field},{fingerprint_field}"),
        1,
    );
    assert!(matches!(
        rejected(&codec, &duplicate)?,
        LocalLogCheckpointV2CodecError::InvalidJson(_)
    ));

    for malformed in [
        &BASE_FINGERPRINT[..BASE_FINGERPRINT.len() - 1],
        "sha256:68Aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
        "sha256:68gecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
        "sha512:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
    ] {
        let mut hostile = value.clone();
        hostile["schemaFingerprint"] = json!(malformed);
        let input = serde_json::to_string(&hostile)?;
        let preserved = input.clone();
        assert!(matches!(
            rejected(&codec, &input)?,
            LocalLogCheckpointV2CodecError::InvalidSchemaFingerprint(_)
        ));
        assert_eq!(input, preserved, "decode must leave caller-owned input unchanged");
    }

    let mut mismatch = value.clone();
    mismatch["schemaFingerprint"] =
        json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&mismatch)?)?,
        LocalLogCheckpointV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        )
    ));

    let mut wrong_id_bad_fingerprint = value.clone();
    wrong_id_bad_fingerprint["schema"]["name"] = json!("other/schema");
    wrong_id_bad_fingerprint["schemaFingerprint"] = json!("malformed");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&wrong_id_bad_fingerprint)?)?,
        LocalLogCheckpointV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));

    let other_expected = LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new("session:other")?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )?;
    let other_codec = LocalLogCheckpointJsonCodecV2::new(context, other_expected);
    assert!(matches!(
        rejected(&other_codec, &baseline)?,
        LocalLogCheckpointV2CodecError::InvalidCheckpoint(source)
            if matches!(*source, LocalLogCheckpointCodecError::BindingMismatch {
                field: LocalLogCheckpointBindingField::SessionId
            })
    ));
    Ok(())
}

#[test]
fn tombstone_and_outer_byte_limits_are_exact() -> TestResult {
    let context = EditorContext::default();
    let anchor = checkpoint_anchor(&context, 2)?;
    let codec = checkpoint_codec(&context)?;
    let encoded = codec.encode(&anchor)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["coveredThrough"], "2");
    assert_eq!(
        value["replayTombstones"],
        json!(["replay:checkpoint-v2-1", "replay:checkpoint-v2-2"])
    );
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);

    let limited = codec
        .clone()
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(1));
    assert!(matches!(
        limited.encode(&anchor),
        Err(LocalLogCheckpointV2CodecError::InvalidCheckpoint(source))
            if matches!(*source, LocalLogCheckpointCodecError::ResourceLimit(
                LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
            ))
    ));
    assert!(matches!(
        limited.decode(&encoded),
        Err(LocalLogCheckpointV2CodecError::InvalidCheckpoint(source))
            if matches!(*source, LocalLogCheckpointCodecError::ResourceLimit(
                LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
            ))
    ));

    let exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    );
    let exact_anchor = checkpoint_anchor(&exact_context, 2)?;
    let exact_codec = checkpoint_codec(&exact_context)?;
    assert_eq!(exact_codec.encode(&exact_anchor)?.len(), encoded.len());
    exact_codec.decode(&encoded)?;

    let short_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    );
    let short_anchor = checkpoint_anchor(&short_context, 2)?;
    let short_codec = checkpoint_codec(&short_context)?;
    assert!(matches!(
        short_codec.decode(&encoded),
        Err(LocalLogCheckpointV2CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(
        short_codec.encode(&short_anchor),
        Err(LocalLogCheckpointV2CodecError::OutputTooLarge { .. })
    ));
    assert_eq!(
        LocalLogCheckpointV2CodecError::OutputTooLarge { minimum: 2, maximum: 1 }.code(),
        CodecErrorCode::OutputTooLarge
    );
    Ok(())
}
