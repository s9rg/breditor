//! Black-box round-trip and continuation contracts for durable local-log checkpoints.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        DocumentJsonCodec, LOCAL_LOG_CHECKPOINT_FORMAT, LOCAL_LOG_CHECKPOINT_FORMAT_VERSION,
        LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits,
        LocalLogCheckpointResourceLimit, LocalLogCheckpointTopologyError,
        SessionCheckpointJsonCodec,
    },
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointBinding, LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryError, LocalLogRecoveryErrorCode, LocalLogRecoveryLimits, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::{EditorSession, HistoryReplayError},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use serde_json::{Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const SESSION_ID: &str = "session:local-log-checkpoint-json";
const CHECKPOINT_LOG_ID: &str = "log:local-log-checkpoint-json-prefix";
const SUCCESSOR_LOG_ID: &str = "log:local-log-checkpoint-json-successor";

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insert_transaction(
    state: &EditorState,
    offset: u64,
    text: &str,
    history: HistoryIntent,
) -> Result<Transaction, Box<dyn Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history)))
}

fn apply(session: &mut EditorSession, transaction: &Transaction) -> Result<Commit, Box<dyn Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly remained unchanged").into())
}

fn history_commit(
    result: Result<Option<Commit>, HistoryReplayError>,
) -> Result<Commit, Box<dyn Error>> {
    result?.ok_or_else(|| test_error("history replay was unexpectedly unavailable").into())
}

fn binding() -> Result<LocalLogCheckpointBinding, Box<dyn Error>> {
    Ok(LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )?)
}

fn checkpoint_codec(
    context: &EditorContext,
) -> Result<LocalLogCheckpointJsonCodec, Box<dyn Error>> {
    Ok(LocalLogCheckpointJsonCodec::new(context.clone(), binding()?))
}

fn entry(
    log_id: &str,
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(log_id)?,
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn recover_anchor(
    initial: EditorState,
    prefix: Vec<LocalLogEntry>,
) -> Result<breditor_core::local_log::LocalLogCheckpointAnchor, Box<dyn Error>> {
    Ok(LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    )
    .recover(EditorSession::new(initial), prefix)?
    .try_into_checkpoint_anchor(LocalLogId::try_new(SUCCESSOR_LOG_ID)?)?)
}

fn assert_sessions_equal(left: &EditorSession, right: &EditorSession) {
    assert_eq!(left.state(), right.state());
    assert_eq!(left.history_capacity(), right.history_capacity());
    assert_eq!(left.undo_depth(), right.undo_depth());
    assert_eq!(left.redo_depth(), right.redo_depth());
    assert_eq!(left.can_undo(), right.can_undo());
    assert_eq!(left.can_redo(), right.can_redo());
}

fn assert_nonempty_checkpoint_policy(
    context: &EditorContext,
    codec: &LocalLogCheckpointJsonCodec,
    anchor: &breditor_core::local_log::LocalLogCheckpointAnchor,
    record: &Value,
) -> TestResult {
    let limited_codec = checkpoint_codec(context)?
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(1));
    assert!(matches!(
        limited_codec.encode(anchor),
        Err(LocalLogCheckpointCodecError::ResourceLimit(
            LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
        ))
    ));

    let mut false_empty = record.clone();
    false_empty["coveredThrough"] = Value::Null;
    false_empty["replayTombstones"] = json!([]);
    assert!(matches!(
        codec.decode(&serde_json::to_string(&false_empty)?),
        Err(LocalLogCheckpointCodecError::InvalidTopology(
            LocalLogCheckpointTopologyError::NonGenesisEmptyHistory
        ))
    ));
    Ok(())
}

#[test]
fn empty_checkpoint_has_exact_canonical_outer_json_and_stable_bytes() -> TestResult {
    assert_eq!(LOCAL_LOG_CHECKPOINT_FORMAT, "breditor/local-log-checkpoint");
    assert_eq!(LOCAL_LOG_CHECKPOINT_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let initial = state(&context, "", "local-log-checkpoint-json-canonical")?;
    let anchor = recover_anchor(initial, Vec::new())?;
    let nested = SessionCheckpointJsonCodec::new(context.clone()).encode(anchor.session())?;
    let codec = checkpoint_codec(&context)?;

    let encoded = codec.encode(&anchor)?;
    let expected = format!(
        concat!(
            r#"{{"format":"breditor/local-log-checkpoint","formatVersion":1,"#,
            r#""sessionId":"session:local-log-checkpoint-json","#,
            r#""checkpointLogId":"log:local-log-checkpoint-json-prefix","#,
            r#""successorLogId":"log:local-log-checkpoint-json-successor","#,
            r#""coveredThrough":null,"replayTombstones":[],"sessionCheckpoint":{}}}"#,
        ),
        nested,
    );
    assert_eq!(encoded, expected);
    assert_eq!(codec.encode(&anchor)?, encoded);

    let restored = codec.decode(&encoded)?;
    assert_eq!(restored.checkpoint_covered_through(), None);
    assert_eq!(restored.next_sequence(), Some(LocalLogSequence::FIRST));
    assert_eq!(restored.compacted_replay_count(), 0);
    assert_sessions_equal(anchor.session(), restored.session());
    assert_eq!(codec.encode(&restored)?, encoded);
    Ok(())
}

#[test]
fn ordered_tombstones_and_open_merge_history_survive_before_successor_recovery() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "local-log-checkpoint-json-open-merge")?;
    let mut producer = EditorSession::new(initial.clone());
    let group = QualifiedName::try_new("test/local-log-checkpoint-json-typing")?;

    let first = insert_transaction(
        producer.state(),
        1,
        "b",
        HistoryIntent::Merge { group: group.clone() },
    )?;
    let first_commit = apply(&mut producer, &first)?;
    let second = insert_transaction(
        producer.state(),
        2,
        "c",
        HistoryIntent::Merge { group: group.clone() },
    )?;
    let second_commit = apply(&mut producer, &second)?;
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (1, 0));

    let prefix = vec![
        entry(CHECKPOINT_LOG_ID, 1, "replay:zulu-first", LocalLogEvent::commit(first_commit))?,
        entry(CHECKPOINT_LOG_ID, 2, "replay:alpha-second", LocalLogEvent::commit(second_commit))?,
    ];
    let anchor = recover_anchor(initial, prefix)?;
    let codec = checkpoint_codec(&context)?;
    let encoded = codec.encode(&anchor)?;
    let record: Value = serde_json::from_str(&encoded)?;

    assert_eq!(
        record["replayTombstones"],
        json!(["replay:zulu-first", "replay:alpha-second"]),
        "wire order must be original sequence order, not replay-ID map order",
    );
    assert_eq!(record["coveredThrough"], "2");
    assert_eq!(record["sessionCheckpoint"]["openMergeGroup"], group.as_str());
    assert_eq!(codec.encode(&anchor)?, encoded);
    assert_nonempty_checkpoint_policy(&context, &codec, &anchor, &record)?;

    let restored = codec.decode(&encoded)?;
    assert_eq!(codec.encode(&restored)?, encoded);
    assert_eq!(restored.next_sequence(), Some(LocalLogSequence::try_new(3)?));
    assert_eq!(restored.compacted_replay_count(), 2);
    assert_eq!(
        restored.compacted_sequence_for_replay_id(&ReplayId::try_new("replay:zulu-first")?),
        Some(LocalLogSequence::FIRST),
    );
    assert_eq!(
        restored.compacted_sequence_for_replay_id(&ReplayId::try_new("replay:alpha-second")?),
        Some(LocalLogSequence::try_new(2)?),
    );
    assert_sessions_equal(&producer, restored.session());

    let rejection_anchor = codec.decode(&encoded)?;
    let error = rejection_anchor
        .recover_successor(
            vec![entry(
                SUCCESSOR_LOG_ID,
                3,
                "replay:zulu-first",
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("decoded anchor accepted a compacted replay ID"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::CompactedReplayId);
    let LocalLogRecoveryError::CompactedReplayId { delivery_index, replay_id, checkpoint_sequence } =
        error
    else {
        return Err(test_error("compacted replay rejection used the wrong error variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(replay_id.as_str(), "replay:zulu-first");
    assert_eq!(checkpoint_sequence, LocalLogSequence::FIRST);

    let continuation =
        insert_transaction(producer.state(), 3, "d", HistoryIntent::Merge { group })?;
    let continuation_commit = apply(&mut producer, &continuation)?;
    let continued = restored.recover_successor(
        vec![entry(
            SUCCESSOR_LOG_ID,
            3,
            "replay:successor-third",
            LocalLogEvent::commit(continuation_commit),
        )?],
        LocalLogRecoveryLimits::default(),
    )?;
    assert_eq!(continued.covered_through(), Some(LocalLogSequence::try_new(3)?));
    assert_eq!(continued.next_sequence(), Some(LocalLogSequence::try_new(4)?));
    assert_eq!(continued.compacted_replay_count(), 2);
    assert_eq!(continued.active_entries().len(), 1);
    assert_eq!((continued.session().undo_depth(), continued.session().redo_depth()), (1, 0));
    assert_sessions_equal(&producer, continued.session());

    let mut restored_session = continued.into_session();
    let producer_undo = history_commit(producer.undo())?;
    let restored_undo = history_commit(restored_session.undo())?;
    assert_eq!(producer_undo, restored_undo);
    assert_eq!(producer_undo.forward_operations().len(), 3);
    assert_sessions_equal(&producer, &restored_session);
    Ok(())
}

#[test]
fn mid_redo_history_round_trips_and_can_replay_in_the_successor_generation() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "local-log-checkpoint-json-redo")?;
    let mut producer = EditorSession::new(initial.clone());

    let first = insert_transaction(producer.state(), 1, "b", HistoryIntent::Record)?;
    let first_commit = apply(&mut producer, &first)?;
    let second = insert_transaction(producer.state(), 2, "c", HistoryIntent::Record)?;
    let second_commit = apply(&mut producer, &second)?;
    let undo_commit = history_commit(producer.undo())?;
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (1, 1));

    let prefix = vec![
        entry(CHECKPOINT_LOG_ID, 1, "replay:redo-first", LocalLogEvent::commit(first_commit))?,
        entry(CHECKPOINT_LOG_ID, 2, "replay:redo-second", LocalLogEvent::commit(second_commit))?,
        entry(CHECKPOINT_LOG_ID, 3, "replay:redo-undo", LocalLogEvent::try_undo(undo_commit)?)?,
    ];
    let anchor = recover_anchor(initial, prefix)?;
    let codec = checkpoint_codec(&context)?;
    let encoded = codec.encode(&anchor)?;
    let restored = codec.decode(&encoded)?;
    assert_eq!(codec.encode(&restored)?, encoded);
    assert_eq!((restored.session().undo_depth(), restored.session().redo_depth()), (1, 1));
    assert_sessions_equal(&producer, restored.session());

    let redo_commit = history_commit(producer.redo())?;
    let continued = restored.recover_successor(
        vec![entry(
            SUCCESSOR_LOG_ID,
            4,
            "replay:successor-redo",
            LocalLogEvent::try_redo(redo_commit)?,
        )?],
        LocalLogRecoveryLimits::default(),
    )?;
    assert_eq!(continued.checkpoint_covered_through(), Some(LocalLogSequence::try_new(3)?));
    assert_eq!(continued.covered_through(), Some(LocalLogSequence::try_new(4)?));
    assert_eq!(continued.next_sequence(), Some(LocalLogSequence::try_new(5)?));
    assert_eq!((continued.session().undo_depth(), continued.session().redo_depth()), (2, 0));
    assert_sessions_equal(&producer, continued.session());
    Ok(())
}
