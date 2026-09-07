use std::error::Error;

use serde_json::{Value, json};

use crate::{
    codec::{
        COMMIT_V2_FORMAT_VERSION, CodecErrorCode, CommitJsonCodec, CommitJsonCodecV2,
        CommitV2CodecError, EDITOR_STATE_V2_FORMAT_VERSION, EditorStateCodecError,
        EditorStateJsonCodec, EditorStateJsonCodecV2, EditorStateV2CodecError,
        SESSION_CHECKPOINT_V2_FORMAT_VERSION, SessionCheckpointCodecError,
        SessionCheckpointJsonCodec, SessionCheckpointJsonCodecV2, SessionCheckpointLimits,
        SessionCheckpointV2CodecError,
    },
    document::{Document, ElementNode, FormatSet, NodeRef, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, SelectionUpdate, Transaction, TransactionMetadata},
};

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const STATE_V2: &str = concat!(
    r#"{"format":"breditor/editor-state","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","snapshot":{"lineage":"runtime-v2-golden","revision":"0"},"document":{"format":"breditor/document","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]},{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}},"selection":null,"pendingFormats":null}"#,
);
type TestResult = Result<(), Box<dyn Error>>;

fn empty_paragraph() -> Result<NodeRef, Box<dyn Error>> {
    ElementNode::try_new(
        QualifiedName::from_known_static("breditor/paragraph"),
        None,
        PropertyMap::default(),
        Vec::new(),
    )
    .map(NodeRef::element)
    .map_err(Into::into)
}

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    let root = ElementNode::try_new(
        QualifiedName::from_known_static("breditor/document"),
        None,
        PropertyMap::default(),
        vec![empty_paragraph()?, empty_paragraph()?],
    )
    .map(NodeRef::element)?;
    let document = Document::try_new(context.schema(), root, context.limits())?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn collapsed_selection() -> Result<Selection, Box<dyn Error>> {
    let point = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0])?,
        child_index: 0,
        affinity: Affinity::Before,
    };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn state_only_commit(
    context: &EditorContext,
    before: &EditorState,
) -> Result<Commit, Box<dyn Error>> {
    Transaction::new(before, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(collapsed_selection()?)))
        .apply(context, before)?
        .into_commit()
        .ok_or_else(|| "state-only transaction unexpectedly remained unchanged".into())
}

fn insert_transaction(state: &EditorState) -> Result<Transaction, Box<dyn Error>> {
    let offset = TextOffset::try_new(0)?;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new("x", FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn assert_same_state_semantics(left: &EditorState, right: &EditorState) {
    assert_eq!(left.snapshot(), right.snapshot());
    assert_eq!(left.document(), right.document());
    assert_eq!(left.selection(), right.selection());
    assert_eq!(left.pending_formats(), right.pending_formats());
}

fn replace_outer_fingerprint(json: &str, replacement: Value) -> Result<String, Box<dyn Error>> {
    let mut value: Value = serde_json::from_str(json)?;
    value["schemaFingerprint"] = replacement;
    serde_json::to_string(&value).map_err(Into::into)
}

fn rejected_state(
    codec: &EditorStateJsonCodecV2,
    json: &str,
) -> Result<EditorStateV2CodecError, Box<dyn Error>> {
    match codec.decode(json) {
        Ok(_) => Err("invalid Editor State V2 unexpectedly decoded".into()),
        Err(error) => Ok(error),
    }
}

fn rejected_commit(
    codec: &CommitJsonCodecV2,
    json: &str,
) -> Result<CommitV2CodecError, Box<dyn Error>> {
    match codec.decode(json) {
        Ok(_) => Err("invalid Commit V2 unexpectedly decoded".into()),
        Err(error) => Ok(error),
    }
}

fn rejected_session(
    codec: &SessionCheckpointJsonCodecV2,
    json: &str,
) -> Result<SessionCheckpointV2CodecError, Box<dyn Error>> {
    match codec.decode(json) {
        Ok(_) => Err("invalid Session Checkpoint V2 unexpectedly decoded".into()),
        Err(error) => Ok(error),
    }
}

#[test]
fn state_commit_and_session_v2_emit_exact_base_prefixes_and_generations() -> TestResult {
    assert_eq!(EDITOR_STATE_V2_FORMAT_VERSION, 2);
    assert_eq!(COMMIT_V2_FORMAT_VERSION, 2);
    assert_eq!(SESSION_CHECKPOINT_V2_FORMAT_VERSION, 2);

    let context = EditorContext::default();
    let before = state(&context, "runtime-v2-golden")?;
    let state_codec = EditorStateJsonCodecV2::new(context.clone());
    assert_eq!(state_codec.encode(&before)?, STATE_V2);
    assert_eq!(state_codec.encode(&state_codec.decode(STATE_V2)?)?, STATE_V2);

    let commit = state_only_commit(&context, &before)?;
    let commit_codec = CommitJsonCodecV2::new(context.clone());
    let commit_json = commit_codec.encode(&commit)?;
    let expected_commit = format!(
        r#"{{"format":"breditor/commit","formatVersion":2,"schema":{{"name":"breditor/base","version":1}},"schemaFingerprint":"{BASE_FINGERPRINT}","before":{STATE_V2},"forwardOperations":[],"resultSelection":{{"kind":"range","anchor":{{"kind":"children","parentPath":[0],"childIndex":0,"affinity":"before"}},"focus":{{"kind":"children","parentPath":[0],"childIndex":0,"affinity":"before"}}}},"resultPendingFormats":null,"metadata":{{"action":null,"history":{{"kind":"record"}}}}}}"#
    );
    assert_eq!(commit_json, expected_commit);
    assert_eq!(commit_codec.encode(&commit_codec.decode(&commit_json)?)?, commit_json);

    let session = EditorSession::new(before);
    let session_codec = SessionCheckpointJsonCodecV2::new(context);
    let session_json = session_codec.encode(&session)?;
    let expected_session = format!(
        r#"{{"format":"breditor/session-checkpoint","formatVersion":2,"schema":{{"name":"breditor/base","version":1}},"schemaFingerprint":"{BASE_FINGERPRINT}","historyBase":{STATE_V2},"currentRevision":"0","historyCapacity":100,"cursor":0,"entries":[],"openMergeGroup":null}}"#
    );
    assert_eq!(session_json, expected_session);
    assert_eq!(session_codec.encode(&session_codec.decode(&session_json)?)?, session_json);
    Ok(())
}

#[test]
fn non_base_state_state_only_commit_and_empty_session_round_trip_only_in_v2() -> TestResult {
    let base_context = EditorContext::default();
    let base_state = state(&base_context, "runtime-v1-base-gate")?;
    let base_commit = state_only_commit(&base_context, &base_state)?;
    let base_session = EditorSession::new(base_state.clone());
    let state_v1_json = EditorStateJsonCodec::new(base_context.clone()).encode(&base_state)?;
    let commit_v1_json = CommitJsonCodec::new(base_context.clone()).encode(&base_commit)?;
    let session_v1_json = SessionCheckpointJsonCodec::new(base_context).encode(&base_session)?;

    let context = EditorContext::new(
        CompiledSchema::test_semantic_variant_same_id(),
        DocumentLimits::default(),
    );
    let initial = state(&context, "runtime-v2-variant")?;
    let commit = state_only_commit(&context, &initial)?;
    let session = EditorSession::new(initial.clone());

    assert!(matches!(
        EditorStateJsonCodec::new(context.clone()).encode(&initial),
        Err(EditorStateCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        CommitJsonCodec::new(context.clone()).encode(&commit),
        Err(crate::codec::CommitCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        SessionCheckpointJsonCodec::new(context.clone()).encode(&session),
        Err(SessionCheckpointCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        EditorStateJsonCodec::new(context.clone()).decode(&state_v1_json),
        Err(EditorStateCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        CommitJsonCodec::new(context.clone()).decode(&commit_v1_json),
        Err(crate::codec::CommitCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        SessionCheckpointJsonCodec::new(context.clone()).decode(&session_v1_json),
        Err(SessionCheckpointCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        EditorStateJsonCodec::new(context.clone()).decode("not-json"),
        Err(EditorStateCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        CommitJsonCodec::new(context.clone()).decode("not-json"),
        Err(crate::codec::CommitCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        SessionCheckpointJsonCodec::new(context.clone()).decode("not-json"),
        Err(SessionCheckpointCodecError::ContextConfigurationMismatch)
    ));

    let state_codec = EditorStateJsonCodecV2::new(context.clone());
    let state_json = state_codec.encode(&initial)?;
    assert_same_state_semantics(&state_codec.decode(&state_json)?, &initial);

    let commit_codec = CommitJsonCodecV2::new(context.clone());
    let commit_json = commit_codec.encode(&commit)?;
    let decoded_commit = commit_codec.decode(&commit_json)?;
    assert_same_state_semantics(decoded_commit.before(), commit.before());
    assert_same_state_semantics(decoded_commit.after(), commit.after());

    let session_codec = SessionCheckpointJsonCodecV2::new(context);
    let session_json = session_codec.encode(&session)?;
    let decoded_session = session_codec.decode(&session_json)?;
    assert_same_state_semantics(decoded_session.state(), session.state());
    assert_eq!(decoded_session.undo_depth(), 0);
    assert_eq!(decoded_session.redo_depth(), 0);
    Ok(())
}

#[test]
fn every_v2_outer_binding_is_strict_and_nested_generations_cannot_mix() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "runtime-v2-tamper")?;
    let state_codec = EditorStateJsonCodecV2::new(context.clone());
    let state_json = state_codec.encode(&initial)?;
    let commit_codec = CommitJsonCodecV2::new(context.clone());
    let commit_json = commit_codec.encode(&state_only_commit(&context, &initial)?)?;
    let session_codec = SessionCheckpointJsonCodecV2::new(context);
    let session_json = session_codec.encode(&EditorSession::new(initial))?;

    let malformed = "sha256:68Aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
    assert_eq!(
        rejected_state(&state_codec, &replace_outer_fingerprint(&state_json, json!(malformed))?,)?
            .code(),
        CodecErrorCode::InvalidSchemaFingerprint
    );
    assert_eq!(
        rejected_commit(
            &commit_codec,
            &replace_outer_fingerprint(&commit_json, json!(malformed))?,
        )?
        .code(),
        CodecErrorCode::InvalidSchemaFingerprint
    );
    assert_eq!(
        rejected_session(
            &session_codec,
            &replace_outer_fingerprint(&session_json, json!(malformed))?,
        )?
        .code(),
        CodecErrorCode::InvalidSchemaFingerprint
    );

    let mut wrong_selector_state: Value = serde_json::from_str(&state_json)?;
    wrong_selector_state["schema"]["name"] = json!("example/schema");
    wrong_selector_state["schemaFingerprint"] = json!(malformed);
    assert!(matches!(
        state_codec.decode(&serde_json::to_string(&wrong_selector_state)?),
        Err(EditorStateV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. }))
    ));
    let mut wrong_selector_commit: Value = serde_json::from_str(&commit_json)?;
    wrong_selector_commit["schema"]["name"] = json!("example/schema");
    wrong_selector_commit["schemaFingerprint"] = json!(malformed);
    assert!(matches!(
        commit_codec.decode(&serde_json::to_string(&wrong_selector_commit)?),
        Err(CommitV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. }))
    ));
    let mut wrong_selector_session: Value = serde_json::from_str(&session_json)?;
    wrong_selector_session["schema"]["name"] = json!("example/schema");
    wrong_selector_session["schemaFingerprint"] = json!(malformed);
    assert!(matches!(
        session_codec.decode(&serde_json::to_string(&wrong_selector_session)?),
        Err(SessionCheckpointV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaIdMismatch { .. }
        ))
    ));

    let wrong = json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(matches!(
        state_codec.decode(&replace_outer_fingerprint(&state_json, wrong.clone())?),
        Err(EditorStateV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        ))
    ));
    assert!(matches!(
        commit_codec.decode(&replace_outer_fingerprint(&commit_json, wrong.clone())?),
        Err(CommitV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        ))
    ));
    assert!(matches!(
        session_codec.decode(&replace_outer_fingerprint(&session_json, wrong)?),
        Err(SessionCheckpointV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        ))
    ));

    Ok(())
}

#[test]
fn every_v2_nested_generation_and_fingerprint_field_is_required() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "runtime-v2-mixed")?;
    let state_codec = EditorStateJsonCodecV2::new(context.clone());
    let state_json = state_codec.encode(&initial)?;
    let commit_codec = CommitJsonCodecV2::new(context.clone());
    let commit_json = commit_codec.encode(&state_only_commit(&context, &initial)?)?;
    let session_codec = SessionCheckpointJsonCodecV2::new(context);
    let session_json = session_codec.encode(&EditorSession::new(initial))?;

    let mut mixed_state: Value = serde_json::from_str(&state_json)?;
    mixed_state["document"]["formatVersion"] = json!(1);
    assert!(matches!(
        state_codec.decode(&serde_json::to_string(&mixed_state)?),
        Err(EditorStateV2CodecError::InvalidDocument(_))
    ));
    let mut mixed_commit: Value = serde_json::from_str(&commit_json)?;
    mixed_commit["before"]["formatVersion"] = json!(1);
    assert!(matches!(
        commit_codec.decode(&serde_json::to_string(&mixed_commit)?),
        Err(CommitV2CodecError::InvalidBeforeState(_))
    ));
    let mut mixed_session: Value = serde_json::from_str(&session_json)?;
    mixed_session["historyBase"]["formatVersion"] = json!(1);
    assert!(matches!(
        session_codec.decode(&serde_json::to_string(&mixed_session)?),
        Err(SessionCheckpointV2CodecError::InvalidHistoryBase(_))
    ));

    let field = format!(",\"schemaFingerprint\":\"{BASE_FINGERPRINT}\"");
    let missing_state = state_json.replacen(&field, "", 1);
    let missing_commit = commit_json.replacen(&field, "", 1);
    let missing_session = session_json.replacen(&field, "", 1);
    assert_eq!(rejected_state(&state_codec, &missing_state)?.code(), CodecErrorCode::InvalidJson);
    assert_eq!(
        rejected_commit(&commit_codec, &missing_commit)?.code(),
        CodecErrorCode::InvalidJson
    );
    assert_eq!(
        rejected_session(&session_codec, &missing_session)?.code(),
        CodecErrorCode::InvalidJson
    );
    Ok(())
}

#[test]
fn independent_equal_proofs_revalidate_and_session_replay_failures_are_non_destructive()
-> TestResult {
    let source_context = EditorContext::default();
    let source_state = state(&source_context, "runtime-v2-independent")?;
    let state_json = EditorStateJsonCodecV2::new(source_context.clone()).encode(&source_state)?;
    let source_commit = state_only_commit(&source_context, &source_state)?;
    let commit_json = CommitJsonCodecV2::new(source_context.clone()).encode(&source_commit)?;

    let mut source_session = EditorSession::new(source_state);
    let transaction = insert_transaction(source_session.state())?;
    source_session.apply_transaction(&transaction)?;
    let session_json = SessionCheckpointJsonCodecV2::new(source_context).encode(&source_session)?;

    let target_context = EditorContext::default();
    let target_state = EditorStateJsonCodecV2::new(target_context.clone()).decode(&state_json)?;
    assert_eq!(target_state.context(), &target_context);
    let target_commit = CommitJsonCodecV2::new(target_context.clone()).decode(&commit_json)?;
    assert_eq!(target_commit.before().context(), &target_context);
    let mut target_session =
        SessionCheckpointJsonCodecV2::new(target_context).decode(&session_json)?;
    assert_eq!(target_session.undo_depth(), 1);
    assert!(target_session.undo()?.is_some());
    assert!(target_session.redo()?.is_some());

    let state_before = source_session.state().clone();
    let status_before = source_session.history_status();
    let limited = SessionCheckpointJsonCodecV2::new(source_session.state().context().clone())
        .with_limits(SessionCheckpointLimits::default().with_max_aggregate_forward_operations(0));
    let Err(error) = limited.encode(&source_session) else {
        return Err("over-limit Session Checkpoint V2 unexpectedly encoded".into());
    };
    assert_eq!(error.code(), CodecErrorCode::ResourceLimit);
    assert_eq!(source_session.state(), &state_before);
    assert_eq!(source_session.history_status(), status_before);
    Ok(())
}
