//! Public V2 local-log-entry wire, binding, and nesting contracts.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        COMMIT_V2_FORMAT_VERSION, CodecErrorCode, CommitV2CodecError, DocumentJsonCodec,
        LOCAL_LOG_ENTRY_FORMAT, LOCAL_LOG_ENTRY_FORMAT_VERSION, LOCAL_LOG_ENTRY_V2_FORMAT_VERSION,
        LocalLogCommitEventKind, LocalLogEntryJsonCodec, LocalLogEntryJsonCodecV2,
        LocalLogEntryV2CodecError,
    },
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError, SchemaFingerprintParseError},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const GOLDEN_CONTROL: &str = concat!(
    r#"{"format":"breditor/local-log-entry","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","#,
    r#""sessionId":"session:stable-A","logId":"log:generation-B","sequence":"1","replayId":"request:close-1","event":{"kind":"closeHistoryGroup"}}"#,
);

fn entry(event: LocalLogEvent) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new("session:stable-A")?,
        LocalLogId::try_new("log:generation-B")?,
        LocalLogSequence::FIRST,
        ReplayId::try_new("request:close-1")?,
        event,
    ))
}

fn state(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node("a", false)])]))?;
    EditorState::try_new(context, LineageId::try_new("local-log-entry-v2")?, document, None, None)
        .map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome
        .into_commit()
        .ok_or_else(|| test_error("fixture transaction unexpectedly remained unchanged").into())
}

fn edit_commit(context: &EditorContext) -> Result<Commit, Box<dyn Error>> {
    let before = state(context)?;
    let offset = TextOffset::try_new(1)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new("b", FormatSet::default())?.into();
    let splice = TextSplice::capture(context, before.document(), range, replacement)?;
    committed(Transaction::new(&before, vec![splice.into()]).apply(context, &before)?)
}

fn rejected(
    codec: &LocalLogEntryJsonCodecV2,
    json: &str,
) -> Result<LocalLogEntryV2CodecError, Box<dyn Error>> {
    codec
        .decode(json)
        .err()
        .ok_or_else(|| test_error("hostile Local Log Entry V2 unexpectedly decoded").into())
}

#[test]
fn canonical_control_shape_is_exact_and_generations_do_not_mix() -> TestResult {
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT, "breditor/local-log-entry");
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT_VERSION, 1);
    assert_eq!(LOCAL_LOG_ENTRY_V2_FORMAT_VERSION, 2);

    let context = EditorContext::default();
    let v2 = LocalLogEntryJsonCodecV2::new(context.clone());
    let original = entry(LocalLogEvent::close_history_group())?;
    let encoded = v2.encode(&original)?;
    assert_eq!(encoded, GOLDEN_CONTROL);
    assert_eq!(v2.encode(&v2.decode(&encoded)?)?, encoded);

    let v1 = LocalLogEntryJsonCodec::new(context);
    assert!(matches!(
        v1.decode(&encoded),
        Err(breditor_core::codec::LocalLogEntryCodecError::UnsupportedFormatVersion {
            found: 2,
            supported: 1
        })
    ));
    let v1_json = v1.encode(&original)?;
    assert!(matches!(
        rejected(&v2, &v1_json)?,
        LocalLogEntryV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 }
    ));
    Ok(())
}

#[test]
fn strict_shape_fingerprint_syntax_and_admission_order_fail_closed() -> TestResult {
    let codec = LocalLogEntryJsonCodecV2::new(EditorContext::default());
    let baseline: Value = serde_json::from_str(GOLDEN_CONTROL)?;
    assert_eq!(baseline.as_object().map(Map::len), Some(9));

    for field in ["schema", "schemaFingerprint"] {
        let mut missing = baseline.clone();
        missing
            .as_object_mut()
            .ok_or_else(|| test_error("fixture is not an object"))?
            .remove(field);
        assert!(matches!(
            rejected(&codec, &serde_json::to_string(&missing)?)?,
            LocalLogEntryV2CodecError::InvalidJson(_)
        ));
    }

    let mut unknown = baseline.clone();
    unknown
        .as_object_mut()
        .ok_or_else(|| test_error("fixture is not an object"))?
        .insert("authorization".to_owned(), json!("smuggled"));
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&unknown)?)?,
        LocalLogEntryV2CodecError::InvalidJson(_)
    ));

    let fingerprint_field = format!(r#""schemaFingerprint":"{BASE_FINGERPRINT}""#);
    let duplicate = GOLDEN_CONTROL.replacen(
        &fingerprint_field,
        &format!("{fingerprint_field},{fingerprint_field}"),
        1,
    );
    assert!(matches!(rejected(&codec, &duplicate)?, LocalLogEntryV2CodecError::InvalidJson(_)));

    for (malformed, expected) in [
        (
            &BASE_FINGERPRINT[..BASE_FINGERPRINT.len() - 1],
            SchemaFingerprintParseError::InvalidLength { actual: 70, expected: 71 },
        ),
        (
            "sha256:68Aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
            SchemaFingerprintParseError::InvalidHexDigit { index: 9 },
        ),
        (
            "sha256:68gecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
            SchemaFingerprintParseError::InvalidHexDigit { index: 9 },
        ),
        (
            "sha512:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
            SchemaFingerprintParseError::InvalidPrefix,
        ),
    ] {
        let mut hostile = baseline.clone();
        hostile["schemaFingerprint"] = json!(malformed);
        let input = serde_json::to_string(&hostile)?;
        let preserved = input.clone();
        match rejected(&codec, &input)? {
            LocalLogEntryV2CodecError::InvalidSchemaFingerprint(found) => {
                assert_eq!(found, expected);
            }
            other => {
                return Err(test_error(format!("unexpected fingerprint error: {other}")).into());
            }
        }
        assert_eq!(input, preserved, "decode must not consume or rewrite its input");
    }

    let mut wrong_fingerprint = baseline.clone();
    wrong_fingerprint["schemaFingerprint"] =
        json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&wrong_fingerprint)?)?,
        LocalLogEntryV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        )
    ));

    let mut wrong_id_and_bad_fingerprint = baseline;
    wrong_id_and_bad_fingerprint["schema"]["name"] = json!("other/schema");
    wrong_id_and_bad_fingerprint["schemaFingerprint"] = json!("malformed");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&wrong_id_and_bad_fingerprint)?)?,
        LocalLogEntryV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));
    Ok(())
}

#[test]
fn every_event_branch_round_trips_and_commit_events_embed_only_commit_v2() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodecV2::new(context.clone());
    let edit = edit_commit(&context)?;
    let undo = committed(edit.undo_transaction(edit.after())?.apply(&context, edit.after())?)?;
    let redo = committed(edit.redo_transaction(undo.after())?.apply(&context, undo.after())?)?;
    let events = [
        LocalLogEvent::commit(edit),
        LocalLogEvent::try_undo(undo)?,
        LocalLogEvent::try_redo(redo)?,
        LocalLogEvent::close_history_group(),
        LocalLogEvent::clear_history(),
    ];

    for event in events {
        let expected_kind = event.kind();
        let original = entry(event)?;
        let encoded = codec.encode(&original)?;
        let decoded = codec.decode(&encoded)?;
        assert_eq!(decoded, original);
        assert_eq!(decoded.event_kind(), expected_kind);
        let value: Value = serde_json::from_str(&encoded)?;
        if matches!(
            expected_kind,
            LocalLogEventKind::Commit | LocalLogEventKind::Undo | LocalLogEventKind::Redo
        ) {
            assert_eq!(value["event"]["commit"]["formatVersion"], COMMIT_V2_FORMAT_VERSION);
            assert_eq!(value["event"]["commit"]["schemaFingerprint"], BASE_FINGERPRINT);
        } else {
            assert!(value["event"].get("commit").is_none());
        }
    }

    let mut mixed: Value = serde_json::from_str(
        &codec.encode(&entry(LocalLogEvent::commit(edit_commit(&context)?))?)?,
    )?;
    mixed["event"]["commit"]["formatVersion"] = json!(1);
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&mixed)?)?,
        LocalLogEntryV2CodecError::InvalidCommit {
            event_kind: LocalLogCommitEventKind::Commit,
            source
        } if matches!(*source, CommitV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 })
    ));

    let mut nested_mismatch: Value = serde_json::from_str(
        &codec.encode(&entry(LocalLogEvent::commit(edit_commit(&context)?))?)?,
    )?;
    nested_mismatch["event"]["commit"]["schemaFingerprint"] =
        json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&nested_mismatch)?)?,
        LocalLogEntryV2CodecError::InvalidCommit { source, .. }
            if matches!(*source, CommitV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
    ));
    Ok(())
}

#[test]
fn shared_json_limit_is_exact_for_input_and_output() -> TestResult {
    let baseline =
        LocalLogEntryJsonCodecV2::new(EditorContext::default()).decode(GOLDEN_CONTROL)?;
    let exact = LocalLogEntryJsonCodecV2::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(GOLDEN_CONTROL.len()),
    ));
    assert_eq!(exact.encode(&baseline)?, GOLDEN_CONTROL);
    assert_eq!(exact.decode(GOLDEN_CONTROL)?, baseline);

    let short = LocalLogEntryJsonCodecV2::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(GOLDEN_CONTROL.len() - 1),
    ));
    assert!(matches!(
        short.decode(GOLDEN_CONTROL),
        Err(LocalLogEntryV2CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(
        short.encode(&baseline),
        Err(LocalLogEntryV2CodecError::OutputTooLarge { .. })
    ));
    assert_eq!(
        LocalLogEntryV2CodecError::OutputTooLarge { minimum: 2, maximum: 1 }.code(),
        CodecErrorCode::OutputTooLarge
    );
    Ok(())
}
