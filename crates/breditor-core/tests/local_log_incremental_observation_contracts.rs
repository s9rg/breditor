//! Black-box contracts for checkpoint-linked one-observation admission.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits, LocalLogEntryJsonCodec,
        SessionCheckpointJsonCodec,
    },
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits,
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogObservationOutcome, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId, ReplayId,
    },
    session::{EditorSession, HistoryReplayError},
    state::{EditorContext, EditorState},
    transaction::{Commit, HistoryIntent},
};
use support::{
    TestResult,
    local_log::{apply, entry, insertion, state},
    test_error,
};

fn empty_anchor(
    initial: EditorState,
    session_id: &LocalSessionId,
    checkpoint_log: &LocalLogId,
    active_log: &LocalLogId,
    compaction_limit: u64,
) -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    let recovered = LocalLogRecovery::new(session_id.clone(), checkpoint_log.clone())
        .recover(EditorSession::new(initial), Vec::new())?;
    recovered
        .try_into_checkpoint_anchor(
            active_log.clone(),
            LocalLogCompactionLimits::new(compaction_limit),
        )
        .map_err(Into::into)
}

fn history_commit(
    result: Result<Option<Commit>, HistoryReplayError>,
) -> Result<Commit, Box<dyn Error>> {
    result?.ok_or_else(|| test_error("history replay was unexpectedly unavailable").into())
}

fn encoded_commit_trace(
    context: &EditorContext,
    initial: &EditorState,
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
) -> Result<(EditorSession, Vec<String>), Box<dyn Error>> {
    let mut producer = EditorSession::new(initial.clone());
    let codec = LocalLogEntryJsonCodec::new(context.clone());

    let first_before = producer.state().clone();
    let first_transaction = insertion(&first_before, 0, "A", HistoryIntent::Record)?;
    let first_retry = first_transaction
        .apply(context, &first_before)?
        .into_commit()
        .ok_or_else(|| test_error("first retry was unexpectedly unchanged"))?;
    let first = apply(&mut producer, &first_transaction)?;
    let second_transaction = insertion(producer.state(), 1, "B", HistoryIntent::Record)?;
    let second = apply(&mut producer, &second_transaction)?;

    let entries = [
        entry(session_id, log_id, 1, "request:first", LocalLogEvent::commit(first))?,
        entry(session_id, log_id, 1, "request:first", LocalLogEvent::commit(first_retry))?,
        entry(session_id, log_id, 2, "request:second", LocalLogEvent::commit(second))?,
    ];
    let encoded = entries.iter().map(|entry| codec.encode(entry)).collect::<Result<_, _>>()?;
    Ok((producer, encoded))
}

fn decode_entries(
    codec: &LocalLogEntryJsonCodec,
    encoded: &[String],
) -> Result<Vec<LocalLogEntry>, Box<dyn Error>> {
    encoded.iter().map(|json| codec.decode(json).map_err(Into::into)).collect()
}

#[test]
fn begin_successor_preserves_anchor_and_empty_compaction_remains_valid() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "", "incremental-empty")?;
    let session_id = LocalSessionId::try_new("session:incremental-empty")?;
    let g0 = LocalLogId::try_new("log:incremental-empty:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-empty:g1")?;
    let g2 = LocalLogId::try_new("log:incremental-empty:g2")?;
    let limits = LocalLogRecoveryLimits::new(0, 0, 0);
    let active = empty_anchor(initial.clone(), &session_id, &g0, &g1, 0)?.begin_successor(limits);

    assert_eq!(active.session_id(), &session_id);
    assert_eq!(active.checkpoint_log_id(), &g0);
    assert_eq!(active.active_log_id(), &g1);
    assert_eq!(active.recovery_limits(), limits);
    assert_eq!(active.compaction_limits(), LocalLogCompactionLimits::new(0));
    assert_eq!(active.session().state(), &initial);
    assert_eq!(active.active_entries(), []);
    assert_eq!(
        (
            active.observation_count(),
            active.unique_event_count(),
            active.exact_duplicate_count(),
            active.applied_operation_count(),
        ),
        (0, 0, 0, 0)
    );
    assert_eq!(active.covered_through(), None);

    let anchor = active.try_into_checkpoint_anchor(g2.clone())?;
    assert_eq!(anchor.checkpoint_log_id(), &g1);
    assert_eq!(anchor.successor_log_id(), &g2);
    assert_eq!(anchor.checkpoint_covered_through(), None);
    assert_eq!(anchor.compacted_replay_count(), 0);
    Ok(())
}

#[test]
fn incremental_observations_match_batch_and_seal_to_identical_checkpoint_bytes() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "", "incremental-equivalence")?;
    let session_id = LocalSessionId::try_new("session:incremental-equivalence")?;
    let g0 = LocalLogId::try_new("log:incremental-equivalence:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-equivalence:g1")?;
    let g2 = LocalLogId::try_new("log:incremental-equivalence:g2")?;
    let entry_codec = LocalLogEntryJsonCodec::new(context.clone());
    let (producer, encoded) = encoded_commit_trace(&context, &initial, &session_id, &g1)?;
    let limits = LocalLogRecoveryLimits::new(3, 2, 2);

    let batch = empty_anchor(initial.clone(), &session_id, &g0, &g1, 2)?
        .recover_successor(decode_entries(&entry_codec, &encoded)?, limits)?;
    let mut incremental = empty_anchor(initial, &session_id, &g0, &g1, 2)?.begin_successor(limits);
    let mut outcomes = Vec::new();
    for observation in decode_entries(&entry_codec, &encoded)? {
        let (next, outcome) = incremental.try_observe(observation)?;
        incremental = next;
        outcomes.push(outcome);
    }

    assert_eq!(
        outcomes,
        vec![
            LocalLogObservationOutcome::Applied {
                delivery_index: 0,
                sequence: LocalLogSequence::FIRST,
            },
            LocalLogObservationOutcome::ExactDuplicate {
                delivery_index: 1,
                first_delivery_index: 0,
                sequence: LocalLogSequence::FIRST,
            },
            LocalLogObservationOutcome::Applied {
                delivery_index: 2,
                sequence: LocalLogSequence::try_new(2)?,
            },
        ]
    );
    assert_eq!(incremental.active_entries(), batch.active_entries());
    assert_eq!(
        (
            incremental.observation_count(),
            incremental.unique_event_count(),
            incremental.exact_duplicate_count(),
            incremental.applied_operation_count(),
        ),
        (3, 2, 1, 2)
    );
    let session_codec = SessionCheckpointJsonCodec::new(context.clone());
    assert_eq!(
        session_codec.encode(incremental.session())?,
        session_codec.encode(batch.session())?
    );
    assert_eq!(session_codec.encode(incremental.session())?, session_codec.encode(&producer)?);

    let incremental_anchor = incremental.try_into_checkpoint_anchor(g2.clone())?;
    let batch_anchor = batch.try_into_checkpoint_anchor(g2.clone())?;
    let checkpoint_codec = LocalLogCheckpointJsonCodec::new(
        context,
        LocalLogCheckpointBinding::try_new(session_id, g1, g2)?,
    )
    .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(2));
    assert_eq!(
        checkpoint_codec.encode(&incremental_anchor)?,
        checkpoint_codec.encode(&batch_anchor)?
    );
    Ok(())
}

#[test]
fn a_batch_returned_owner_can_continue_one_observation_at_a_time() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "", "incremental-after-batch")?;
    let session_id = LocalSessionId::try_new("session:incremental-after-batch")?;
    let g0 = LocalLogId::try_new("log:incremental-after-batch:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-after-batch:g1")?;
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let (producer, encoded) = encoded_commit_trace(&context, &initial, &session_id, &g1)?;
    let limits = LocalLogRecoveryLimits::new(3, 2, 2);
    let mut decoded = decode_entries(&codec, &encoded)?;
    let first = decoded.remove(0);
    let mut active =
        empty_anchor(initial, &session_id, &g0, &g1, 2)?.recover_successor(vec![first], limits)?;

    assert_eq!(active.recovery_limits(), limits);
    assert_eq!((active.observation_count(), active.unique_event_count()), (1, 1));
    let (next, duplicate) = active.try_observe(decoded.remove(0))?;
    assert_eq!(duplicate.delivery_index(), 1);
    assert_eq!(duplicate.first_delivery_index(), Some(0));
    active = next;
    let (active, applied) = active.try_observe(decoded.remove(0))?;
    assert_eq!(applied.delivery_index(), 2);
    assert_eq!(applied.sequence(), LocalLogSequence::try_new(2)?);
    assert_eq!(
        (
            active.observation_count(),
            active.unique_event_count(),
            active.exact_duplicate_count(),
            active.applied_operation_count(),
        ),
        (3, 2, 1, 2)
    );
    assert_eq!(
        SessionCheckpointJsonCodec::new(context).encode(active.session())?,
        SessionCheckpointJsonCodec::new(producer.state().context().clone()).encode(&producer)?
    );
    Ok(())
}

#[test]
fn a_decoded_checkpoint_can_admit_incrementally_and_reencode_after_seal() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "", "incremental-after-decode")?;
    let session_id = LocalSessionId::try_new("session:incremental-after-decode")?;
    let g0 = LocalLogId::try_new("log:incremental-after-decode:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-after-decode:g1")?;
    let g2 = LocalLogId::try_new("log:incremental-after-decode:g2")?;
    let checkpoint_codec = LocalLogCheckpointJsonCodec::new(
        context.clone(),
        LocalLogCheckpointBinding::try_new(session_id.clone(), g0.clone(), g1.clone())?,
    );
    let encoded =
        checkpoint_codec.encode(&empty_anchor(initial.clone(), &session_id, &g0, &g1, 1)?)?;
    let restored = checkpoint_codec.decode(&encoded)?;

    let mut producer = EditorSession::new(initial);
    let transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let commit = apply(&mut producer, &transaction)?;
    let observation =
        entry(&session_id, &g1, 1, "request:after-decode", LocalLogEvent::commit(commit))?;
    let (active, outcome) =
        restored.begin_successor(LocalLogRecoveryLimits::new(1, 1, 1)).try_observe(observation)?;
    assert!(outcome.was_applied());
    let sealed = active.try_into_checkpoint_anchor(g2.clone())?;

    let next_codec = LocalLogCheckpointJsonCodec::new(
        context.clone(),
        LocalLogCheckpointBinding::try_new(session_id, g1, g2)?,
    );
    let next_encoded = next_codec.encode(&sealed)?;
    let next_restored = next_codec.decode(&next_encoded)?;
    assert_eq!(next_codec.encode(&next_restored)?, next_encoded);
    assert_eq!(next_restored.compacted_replay_count(), 1);
    assert_eq!(
        SessionCheckpointJsonCodec::new(context).encode(next_restored.session())?,
        SessionCheckpointJsonCodec::new(producer.state().context().clone()).encode(&producer)?
    );
    Ok(())
}

#[test]
fn undo_redo_merge_close_and_clear_apply_one_observation_at_a_time() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "x", "incremental-history")?;
    let session_id = LocalSessionId::try_new("session:incremental-history")?;
    let g0 = LocalLogId::try_new("log:incremental-history:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-history:g1")?;
    let group = QualifiedName::try_new("breditor/incremental-history")?;

    let mut producer = EditorSession::new(initial.clone());
    let first_transaction = insertion(producer.state(), 1, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let recovered = LocalLogRecovery::new(session_id.clone(), g0.clone()).recover(
        EditorSession::new(initial),
        vec![entry(&session_id, &g0, 1, "request:prefix", LocalLogEvent::commit(first))?],
    )?;
    let anchor =
        recovered.try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(6))?;

    let undo = history_commit(producer.undo())?;
    let redo = history_commit(producer.redo())?;
    let merge_transaction = insertion(producer.state(), 2, "B", HistoryIntent::Merge { group })?;
    let merge = apply(&mut producer, &merge_transaction)?;
    producer.close_history_group();
    producer.clear_history();
    let observations = vec![
        entry(&session_id, &g1, 2, "request:undo", LocalLogEvent::try_undo(undo)?)?,
        entry(&session_id, &g1, 3, "request:redo", LocalLogEvent::try_redo(redo)?)?,
        entry(&session_id, &g1, 4, "request:merge", LocalLogEvent::commit(merge))?,
        entry(&session_id, &g1, 5, "request:close", LocalLogEvent::close_history_group())?,
        entry(&session_id, &g1, 6, "request:clear", LocalLogEvent::clear_history())?,
    ];
    let mut active = anchor.begin_successor(LocalLogRecoveryLimits::new(5, 5, 3));
    for (delivery_index, observation) in observations.into_iter().enumerate() {
        let (next, outcome) = active.try_observe(observation)?;
        assert!(outcome.was_applied());
        assert_eq!(outcome.delivery_index(), u64::try_from(delivery_index)?);
        active = next;
    }

    let codec = SessionCheckpointJsonCodec::new(context);
    assert_eq!(codec.encode(active.session())?, codec.encode(&producer)?);
    assert_eq!((active.session().undo_depth(), active.session().redo_depth()), (0, 0));
    assert_eq!(active.applied_operation_count(), 3);
    assert_eq!(active.recovery_limits(), LocalLogRecoveryLimits::new(5, 5, 3));
    assert_eq!(
        active.compacted_sequence_for_replay_id(&ReplayId::try_new("request:prefix")?),
        Some(LocalLogSequence::FIRST)
    );
    Ok(())
}
