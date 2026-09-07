//! Adversarial black-box contracts for bounded genesis local-log recovery.

mod support;

use std::error::Error as StdError;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventApplicationError,
        LocalLogEventApplicationErrorCode, LocalLogEventKind, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryError, LocalLogRecoveryErrorCode, LocalLogRecoveryLimits, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    schema::{DurableSchemaBinding, SchemaFingerprint},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{
        Commit, HistoryIntent, SelectionUpdate, Transaction, TransactionMetadata,
        TransactionOutcome,
    },
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const SESSION_ID: &str = "session:recovery-security";
const LOG_ID: &str = "log:genesis-security";

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn StdError>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn recovery() -> Result<LocalLogRecovery, Box<dyn StdError>> {
    Ok(LocalLogRecovery::new(LocalSessionId::try_new(SESSION_ID)?, LocalLogId::try_new(LOG_ID)?))
}

fn entry(
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn StdError>> {
    entry_with_membership(SESSION_ID, LOG_ID, sequence, replay_id, event)
}

fn entry_with_membership(
    session_id: &str,
    log_id: &str,
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn StdError>> {
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new(session_id)?,
        LocalLogId::try_new(log_id)?,
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn insert_transaction(
    state: &EditorState,
    text: &str,
    history: HistoryIntent,
) -> Result<Transaction, Box<dyn StdError>> {
    let start = TextOffset::try_new(0)?;
    let range = TextRange::try_new(path(&[0])?, start, start)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history)))
}

fn state_only_transaction(state: &EditorState) -> Result<Transaction, Box<dyn StdError>> {
    let point =
        Point::Children { parent_path: path(&[0])?, child_index: 0, affinity: Affinity::Before };
    let selection: Selection = RangeSelection::new(point.clone(), point).into();
    Ok(Transaction::new(state, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(selection)))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn StdError>> {
    outcome
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly remained unchanged").into())
}

fn apply(
    session: &mut EditorSession,
    transaction: &Transaction,
) -> Result<Commit, Box<dyn StdError>> {
    committed(session.apply_transaction(transaction)?)
}

fn commit_once(initial: &EditorState, inserted: &str) -> Result<Commit, Box<dyn StdError>> {
    let mut session = EditorSession::new(initial.clone());
    let transaction = insert_transaction(session.state(), inserted, HistoryIntent::Record)?;
    apply(&mut session, &transaction)
}

fn state_only_commit(initial: &EditorState) -> Result<Commit, Box<dyn StdError>> {
    let mut session = EditorSession::new(initial.clone());
    let transaction = state_only_transaction(session.state())?;
    apply(&mut session, &transaction)
}

fn two_sequential_commits(initial: &EditorState) -> Result<(Commit, Commit), Box<dyn StdError>> {
    let mut session = EditorSession::new(initial.clone());
    let first = insert_transaction(session.state(), "first-", HistoryIntent::Record)?;
    let first = apply(&mut session, &first)?;
    let second = insert_transaction(session.state(), "second-", HistoryIntent::Record)?;
    let second = apply(&mut session, &second)?;
    Ok((first, second))
}

fn history_commits(
    initial: &EditorState,
    inserted: &str,
) -> Result<(Commit, Commit, Commit), Box<dyn StdError>> {
    let mut session = EditorSession::new(initial.clone());
    let transaction = insert_transaction(session.state(), inserted, HistoryIntent::Record)?;
    let edit = apply(&mut session, &transaction)?;
    let undo =
        session.undo()?.ok_or_else(|| test_error("producer undo was unexpectedly unavailable"))?;
    let redo =
        session.redo()?.ok_or_else(|| test_error("producer redo was unexpectedly unavailable"))?;
    Ok((edit, undo, redo))
}

fn merged_history_entries(initial: &EditorState) -> Result<Vec<LocalLogEntry>, Box<dyn StdError>> {
    let group = QualifiedName::try_new("test/recovery-merged-operations")?;
    let mut producer = EditorSession::new(initial.clone());
    let first = insert_transaction(
        producer.state(),
        "first-",
        HistoryIntent::Merge { group: group.clone() },
    )?;
    let first = apply(&mut producer, &first)?;
    let second = insert_transaction(producer.state(), "second-", HistoryIntent::Merge { group })?;
    let second = apply(&mut producer, &second)?;
    let undo = producer
        .undo()?
        .ok_or_else(|| test_error("merged producer undo was unexpectedly unavailable"))?;
    assert_eq!(undo.forward_operations().len(), 2);
    Ok(vec![
        entry(1, "merged:first", LocalLogEvent::commit(first))?,
        entry(2, "merged:second", LocalLogEvent::commit(second))?,
        entry(3, "merged:undo", LocalLogEvent::try_undo(undo)?)?,
    ])
}

fn forged_short_undo_entries(
    initial: &EditorState,
) -> Result<Vec<LocalLogEntry>, Box<dyn StdError>> {
    let mut entries = merged_history_entries(initial)?;
    entries.truncate(2);
    let (_, forged_undo, _) = history_commits(initial, "forged-short-")?;
    assert_eq!(forged_undo.forward_operations().len(), 1);
    entries.push(entry(3, "merged:forged-short-undo", LocalLogEvent::try_undo(forged_undo)?)?);
    Ok(entries)
}

fn assert_application_error(
    error: &LocalLogRecoveryError,
    delivery_index: u64,
    kind: LocalLogEventKind,
    code: LocalLogEventApplicationErrorCode,
) -> Result<&LocalLogEventApplicationError, Box<dyn StdError>> {
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::EventApplication);
    assert_eq!(error.delivery_index(), Some(delivery_index));
    let LocalLogRecoveryError::EventApplication { source, .. } = error else {
        return Err(test_error(format!("expected event-application error, got {error:?}")).into());
    };
    assert_eq!(source.event_kind(), kind);
    assert_eq!(source.code(), code);
    Ok(source)
}

#[test]
fn zero_and_exact_resource_limit_edges_are_deterministic() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "limits-exact-edge")?;

    let empty = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(0, 0, 0))
        .recover(EditorSession::new(initial.clone()), Vec::new())?;
    assert_eq!(empty.observation_count(), 0);
    assert_eq!(empty.unique_event_count(), 0);
    assert_eq!(empty.applied_operation_count(), 0);

    let zero_operation = state_only_commit(&initial)?;
    assert!(zero_operation.forward_operations().is_empty());
    let zero_operation = recovery()?.with_limits(LocalLogRecoveryLimits::new(1, 1, 0)).recover(
        EditorSession::new(initial.clone()),
        vec![entry(1, "limits:zero-operation", LocalLogEvent::commit(zero_operation))?],
    )?;
    assert_eq!(zero_operation.observation_count(), 1);
    assert_eq!(zero_operation.unique_event_count(), 1);
    assert_eq!(zero_operation.applied_operation_count(), 0);

    let first_commit = commit_once(&initial, "x")?;
    let retried_commit = commit_once(&initial, "x")?;
    assert_eq!(first_commit, retried_commit);
    let exact = recovery()?.with_limits(LocalLogRecoveryLimits::new(2, 1, 1)).recover(
        EditorSession::new(initial),
        vec![
            entry(1, "limits:exact", LocalLogEvent::commit(first_commit))?,
            entry(1, "limits:exact", LocalLogEvent::commit(retried_commit))?,
        ],
    )?;
    assert_eq!(exact.observation_count(), 2);
    assert_eq!(exact.unique_event_count(), 1);
    assert_eq!(exact.exact_duplicate_count(), 1);
    assert_eq!(exact.applied_operation_count(), 1);
    assert_eq!(exact.entries().len(), 1);
    Ok(())
}

#[test]
fn recovery_rejects_a_control_event_from_another_schema_binding() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "schema-binding-mismatch")?;
    let expected = context.schema().durable_binding();
    let foreign_fingerprint: SchemaFingerprint =
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".parse()?;
    assert_ne!(foreign_fingerprint, expected.fingerprint());
    let actual = DurableSchemaBinding::new(expected.schema().clone(), foreign_fingerprint);
    let rejected = LocalLogEntry::new_with_schema_binding(
        actual.clone(),
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(LOG_ID)?,
        LocalLogSequence::FIRST,
        ReplayId::try_new("schema:mismatch")?,
        LocalLogEvent::close_history_group(),
    );

    let error = recovery()?
        .recover(EditorSession::new(initial), vec![rejected])
        .err()
        .ok_or_else(|| test_error("foreign schema binding unexpectedly entered recovery"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::SchemaBindingMismatch);
    assert_eq!(error.delivery_index(), Some(0));
    let LocalLogRecoveryError::SchemaBindingMismatch {
        delivery_index,
        expected: found_expected,
        actual: found_actual,
    } = error
    else {
        return Err(test_error("schema mismatch used the wrong error variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(*found_expected, expected);
    assert_eq!(*found_actual, actual);
    Ok(())
}

#[test]
fn first_excess_observation_unique_event_and_operation_report_exact_counters() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "limits-first-excess")?;

    let observation_error = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(0, 1, 1))
        .recover(
            EditorSession::new(initial.clone()),
            vec![entry(1, "limits:observation", LocalLogEvent::close_history_group())?],
        )
        .err()
        .ok_or_else(|| test_error("zero observation limit unexpectedly accepted one input"))?;
    assert_eq!(observation_error.code(), LocalLogRecoveryErrorCode::ObservationLimit);
    assert_eq!(observation_error.delivery_index(), None);
    let LocalLogRecoveryError::ObservationLimit { actual, maximum } = observation_error else {
        return Err(test_error("observation failure used the wrong variant").into());
    };
    assert_eq!((actual, maximum), (1, 0));

    let unique_error = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(1, 0, 1))
        .recover(
            EditorSession::new(initial.clone()),
            vec![entry(1, "limits:unique", LocalLogEvent::close_history_group())?],
        )
        .err()
        .ok_or_else(|| test_error("zero unique-event limit unexpectedly accepted an event"))?;
    assert_eq!(unique_error.code(), LocalLogRecoveryErrorCode::UniqueEventLimit);
    assert_eq!(unique_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::UniqueEventLimit { delivery_index, attempted, maximum } =
        unique_error
    else {
        return Err(test_error("unique-event failure used the wrong variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (0, 1, 0));

    let content_commit = commit_once(&initial, "x")?;
    let operation_error = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(1, 1, 0))
        .recover(
            EditorSession::new(initial),
            vec![entry(1, "limits:operation", LocalLogEvent::commit(content_commit))?],
        )
        .err()
        .ok_or_else(|| test_error("zero operation limit unexpectedly accepted one operation"))?;
    assert_eq!(operation_error.code(), LocalLogRecoveryErrorCode::AppliedOperationLimit);
    assert_eq!(operation_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::AppliedOperationLimit { delivery_index, attempted, maximum } =
        operation_error
    else {
        return Err(test_error("operation-limit failure used the wrong variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (0, 1, 0));

    let aggregate_initial = state(&context, "base", "limits-aggregate-operations")?;
    let (first, second) = two_sequential_commits(&aggregate_initial)?;
    let aggregate_error = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(2, 2, 1))
        .recover(
            EditorSession::new(aggregate_initial),
            vec![
                entry(1, "limits:aggregate-first", LocalLogEvent::commit(first))?,
                entry(2, "limits:aggregate-second", LocalLogEvent::commit(second))?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("aggregate operation excess was accepted"))?;
    let LocalLogRecoveryError::AppliedOperationLimit { delivery_index, attempted, maximum } =
        aggregate_error
    else {
        return Err(test_error("aggregate operation failure used the wrong variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (1, 2, 1));
    Ok(())
}

#[test]
fn merged_replay_operations_obey_the_exact_aggregate_budget() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "limits-merged-replay")?;
    let exact = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(3, 3, 4))
        .recover(EditorSession::new(initial.clone()), merged_history_entries(&initial)?)?;
    assert_eq!(exact.applied_operation_count(), 4);
    assert_eq!((exact.session().undo_depth(), exact.session().redo_depth()), (0, 1));

    let error = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(3, 3, 3))
        .recover(EditorSession::new(initial.clone()), merged_history_entries(&initial)?)
        .err()
        .ok_or_else(|| test_error("merged replay exceeded its operation budget but succeeded"))?;
    let LocalLogRecoveryError::AppliedOperationLimit { delivery_index, attempted, maximum } = error
    else {
        return Err(test_error("merged replay limit used the wrong error variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (2, 4, 3));

    let forged_budget_error = recovery()?
        .with_limits(LocalLogRecoveryLimits::new(3, 3, 3))
        .recover(EditorSession::new(initial.clone()), forged_short_undo_entries(&initial)?)
        .err()
        .ok_or_else(|| test_error("short forged replay bypassed the authoritative budget"))?;
    let LocalLogRecoveryError::AppliedOperationLimit { delivery_index, attempted, maximum } =
        forged_budget_error
    else {
        return Err(test_error("forged replay budget used the wrong error variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (2, 4, 3));

    let forged_proof_error = recovery()?
        .recover(EditorSession::new(initial.clone()), forged_short_undo_entries(&initial)?)
        .err()
        .ok_or_else(|| test_error("short forged replay proof was accepted"))?;
    assert_application_error(
        &forged_proof_error,
        2,
        LocalLogEventKind::Undo,
        LocalLogEventApplicationErrorCode::ReplayCommitMismatch,
    )?;
    Ok(())
}

#[test]
fn initial_retained_history_is_rejected_before_observations() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "nonempty-initial-history")?;
    let mut session = EditorSession::new(initial);
    let transaction = insert_transaction(session.state(), "x", HistoryIntent::Record)?;
    apply(&mut session, &transaction)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let error = recovery()?
        .recover(session, Vec::new())
        .err()
        .ok_or_else(|| test_error("nonempty initial history was accepted"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::NonEmptyInitialHistory);
    assert_eq!(error.delivery_index(), None);
    let LocalLogRecoveryError::NonEmptyInitialHistory { undo_depth, redo_depth } = error else {
        return Err(test_error("nonempty history failure used the wrong variant").into());
    };
    assert_eq!((undo_depth, redo_depth), (1, 0));
    Ok(())
}

#[test]
fn session_and_active_log_membership_fail_at_the_physical_index() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "membership-errors")?;

    let session_error = recovery()?
        .recover(
            EditorSession::new(initial.clone()),
            vec![entry_with_membership(
                "session:foreign",
                "log:foreign-too",
                1,
                "membership:session",
                LocalLogEvent::clear_history(),
            )?],
        )
        .err()
        .ok_or_else(|| test_error("foreign session was accepted"))?;
    assert_eq!(session_error.code(), LocalLogRecoveryErrorCode::SessionMismatch);
    assert_eq!(session_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::SessionMismatch { delivery_index, expected, actual } = session_error
    else {
        return Err(test_error("session mismatch used the wrong variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(expected.as_str(), SESSION_ID);
    assert_eq!(actual.as_str(), "session:foreign");

    let log_error = recovery()?
        .recover(
            EditorSession::new(initial),
            vec![entry_with_membership(
                SESSION_ID,
                "log:foreign",
                1,
                "membership:log",
                LocalLogEvent::clear_history(),
            )?],
        )
        .err()
        .ok_or_else(|| test_error("foreign active log was accepted"))?;
    assert_eq!(log_error.code(), LocalLogRecoveryErrorCode::ActiveLogMismatch);
    assert_eq!(log_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::ActiveLogMismatch { delivery_index, expected, actual } = log_error
    else {
        return Err(test_error("active-log mismatch used the wrong variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(expected.as_str(), LOG_ID);
    assert_eq!(actual.as_str(), "log:foreign");
    Ok(())
}

#[test]
fn gaps_reused_positions_and_backward_positions_are_order_errors() -> TestResult {
    let context = EditorContext::default();

    let gap_initial = state(&context, "base", "ordering-gap")?;
    let gap_commit = commit_once(&gap_initial, "x")?;
    let gap_error = recovery()?
        .recover(
            EditorSession::new(gap_initial),
            vec![entry(2, "ordering:gap", LocalLogEvent::commit(gap_commit))?],
        )
        .err()
        .ok_or_else(|| test_error("sequence gap was accepted"))?;
    assert_eq!(gap_error.code(), LocalLogRecoveryErrorCode::UnexpectedSequence);
    assert_eq!(gap_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::UnexpectedSequence { delivery_index, expected, actual } = gap_error
    else {
        return Err(test_error("gap failure used the wrong variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(expected.get(), 1);
    assert_eq!(actual.get(), 2);

    let reused_initial = state(&context, "base", "ordering-reused")?;
    let reused_commit = commit_once(&reused_initial, "x")?;
    let reused_error = recovery()?
        .recover(
            EditorSession::new(reused_initial),
            vec![
                entry(1, "ordering:first", LocalLogEvent::commit(reused_commit))?,
                entry(1, "ordering:distinct-replay", LocalLogEvent::clear_history())?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("reused sequence was accepted"))?;
    let LocalLogRecoveryError::UnexpectedSequence { delivery_index, expected, actual } =
        reused_error
    else {
        return Err(test_error("reused-position failure used the wrong variant").into());
    };
    assert_eq!((delivery_index, expected.get(), actual.get()), (1, 2, 1));

    let backward_initial = state(&context, "base", "ordering-backward")?;
    let (first, second) = two_sequential_commits(&backward_initial)?;
    let backward_error = recovery()?
        .recover(
            EditorSession::new(backward_initial),
            vec![
                entry(1, "ordering:backward-1", LocalLogEvent::commit(first))?,
                entry(2, "ordering:backward-2", LocalLogEvent::commit(second))?,
                entry(1, "ordering:backward-3", LocalLogEvent::clear_history())?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("backward sequence was accepted"))?;
    let LocalLogRecoveryError::UnexpectedSequence { delivery_index, expected, actual } =
        backward_error
    else {
        return Err(test_error("backward-position failure used the wrong variant").into());
    };
    assert_eq!((delivery_index, expected.get(), actual.get()), (2, 3, 1));
    Ok(())
}

#[test]
fn replay_id_conflict_precedes_changed_sequence_or_event_application() -> TestResult {
    let context = EditorContext::default();

    let sequence_initial = state(&context, "base", "replay-conflict-sequence")?;
    let first = commit_once(&sequence_initial, "x")?;
    let changed_sequence = commit_once(&sequence_initial, "x")?;
    assert_eq!(first, changed_sequence);
    let sequence_error = recovery()?
        .recover(
            EditorSession::new(sequence_initial),
            vec![
                entry(1, "replay:conflict", LocalLogEvent::commit(first))?,
                entry(99, "replay:conflict", LocalLogEvent::commit(changed_sequence))?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("changed replay sequence was accepted"))?;
    assert_eq!(sequence_error.code(), LocalLogRecoveryErrorCode::ReplayConflict);
    let LocalLogRecoveryError::ReplayConflict { first_delivery_index, delivery_index, replay_id } =
        sequence_error
    else {
        return Err(test_error("changed replay sequence used the wrong variant").into());
    };
    assert_eq!((first_delivery_index, delivery_index), (0, 1));
    assert_eq!(replay_id.as_str(), "replay:conflict");

    let event_initial = state(&context, "base", "replay-conflict-event")?;
    let first = commit_once(&event_initial, "x")?;
    let event_error = recovery()?
        .recover(
            EditorSession::new(event_initial),
            vec![
                entry(1, "replay:event-conflict", LocalLogEvent::commit(first))?,
                entry(2, "replay:event-conflict", LocalLogEvent::clear_history())?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("changed replay event was accepted"))?;
    assert_eq!(event_error.code(), LocalLogRecoveryErrorCode::ReplayConflict);
    let LocalLogRecoveryError::ReplayConflict { first_delivery_index, delivery_index, replay_id } =
        event_error
    else {
        return Err(test_error("changed replay event used the wrong variant").into());
    };
    assert_eq!((first_delivery_index, delivery_index), (0, 1));
    assert_eq!(replay_id.as_str(), "replay:event-conflict");

    let proof_initial = state(&context, "base", "replay-conflict-commit-proof")?;
    let first = commit_once(&proof_initial, "x")?;
    let changed_proof = commit_once(&proof_initial, "y")?;
    assert_ne!(first, changed_proof);
    let proof_error = recovery()?
        .recover(
            EditorSession::new(proof_initial),
            vec![
                entry(1, "replay:proof-conflict", LocalLogEvent::commit(first))?,
                entry(1, "replay:proof-conflict", LocalLogEvent::commit(changed_proof))?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("changed replay Commit V1 proof was accepted"))?;
    let LocalLogRecoveryError::ReplayConflict { first_delivery_index, delivery_index, replay_id } =
        proof_error
    else {
        return Err(test_error("changed replay proof used the wrong variant").into());
    };
    assert_eq!((first_delivery_index, delivery_index), (0, 1));
    assert_eq!(replay_id.as_str(), "replay:proof-conflict");
    Ok(())
}

#[test]
fn ordinary_commit_distinguishes_stale_snapshot_and_equal_snapshot_wrong_state() -> TestResult {
    const SECRET: &str = "DOCUMENT_SECRET_MUST_NOT_ESCAPE";

    let context = EditorContext::default();
    let authored = state(&context, "authored", "stale-authored-lineage")?;
    let stale_commit = commit_once(&authored, SECRET)?;
    let current = state(&context, "current", "stale-current-lineage")?;
    let stale_error = recovery()?
        .recover(
            EditorSession::new(current),
            vec![entry(1, "application:stale", LocalLogEvent::commit(stale_commit))?],
        )
        .err()
        .ok_or_else(|| test_error("stale ordinary commit was accepted"))?;
    let stale_source = assert_application_error(
        &stale_error,
        0,
        LocalLogEventKind::Commit,
        LocalLogEventApplicationErrorCode::CommitStaleSnapshot,
    )?;
    assert_eq!(stale_source.event_validation_code(), None);
    assert_eq!(stale_source.replay_transaction_code(), None);
    assert_eq!(stale_source.operation_index(), None);
    for diagnostic in [format!("{stale_error}"), format!("{stale_error:?}")] {
        assert!(!diagnostic.contains(SECRET));
        assert!(!diagnostic.contains("stale-authored-lineage"));
        assert!(!diagnostic.contains("stale-current-lineage"));
    }

    let authored = state(&context, "authored", "same-snapshot-lineage")?;
    let mismatch_commit = commit_once(&authored, SECRET)?;
    let unequal_current = state(&context, "different", "same-snapshot-lineage")?;
    assert_eq!(authored.snapshot(), unequal_current.snapshot());
    assert_ne!(authored, unequal_current);
    let mismatch_error = recovery()?
        .recover(
            EditorSession::new(unequal_current),
            vec![entry(1, "application:base-mismatch", LocalLogEvent::commit(mismatch_commit))?],
        )
        .err()
        .ok_or_else(|| test_error("equal-snapshot unequal commit base was accepted"))?;
    assert_application_error(
        &mismatch_error,
        0,
        LocalLogEventKind::Commit,
        LocalLogEventApplicationErrorCode::CommitBaseStateMismatch,
    )?;
    for diagnostic in [format!("{mismatch_error}"), format!("{mismatch_error:?}")] {
        assert!(!diagnostic.contains(SECRET));
        assert!(!diagnostic.contains("authored"));
        assert!(!diagnostic.contains("different"));
    }
    Ok(())
}

#[test]
fn valid_logged_undo_and_redo_fail_cleanly_when_the_branch_is_unavailable() -> TestResult {
    let context = EditorContext::default();

    let undo_initial = state(&context, "base", "unavailable-undo")?;
    let (_, undo, _) = history_commits(&undo_initial, "x")?;
    let undo_error = recovery()?
        .recover(
            EditorSession::new(undo_initial),
            vec![entry(1, "application:undo-unavailable", LocalLogEvent::try_undo(undo)?)?],
        )
        .err()
        .ok_or_else(|| test_error("undo without history was accepted"))?;
    let undo_source = assert_application_error(
        &undo_error,
        0,
        LocalLogEventKind::Undo,
        LocalLogEventApplicationErrorCode::ReplayUnavailable,
    )?;
    assert_eq!(undo_source.replay_transaction_code(), None);
    assert_eq!(undo_source.operation_index(), None);

    let redo_initial = state(&context, "base", "unavailable-redo")?;
    let (_, _, redo) = history_commits(&redo_initial, "x")?;
    let redo_error = recovery()?
        .recover(
            EditorSession::new(redo_initial),
            vec![entry(1, "application:redo-unavailable", LocalLogEvent::try_redo(redo)?)?],
        )
        .err()
        .ok_or_else(|| test_error("redo without history was accepted"))?;
    let redo_source = assert_application_error(
        &redo_error,
        0,
        LocalLogEventKind::Redo,
        LocalLogEventApplicationErrorCode::ReplayUnavailable,
    )?;
    assert_eq!(redo_source.replay_transaction_code(), None);
    assert_eq!(redo_source.operation_index(), None);
    Ok(())
}

#[test]
fn undo_and_redo_require_the_exact_locally_derived_commit() -> TestResult {
    let context = EditorContext::default();

    let undo_initial = state(&context, "base", "undo-commit-mismatch")?;
    let edit_a = commit_once(&undo_initial, "a")?;
    let (_, undo_b, _) = history_commits(&undo_initial, "b")?;
    let undo_error = recovery()?
        .recover(
            EditorSession::new(undo_initial),
            vec![
                entry(1, "mismatch:undo-edit", LocalLogEvent::commit(edit_a))?,
                entry(2, "mismatch:undo", LocalLogEvent::try_undo(undo_b)?)?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("mismatched logged undo was accepted"))?;
    let undo_source = assert_application_error(
        &undo_error,
        1,
        LocalLogEventKind::Undo,
        LocalLogEventApplicationErrorCode::ReplayCommitMismatch,
    )?;
    assert_eq!(undo_source.replay_transaction_code(), None);
    assert_eq!(undo_source.operation_index(), None);

    let redo_initial = state(&context, "base", "redo-commit-mismatch")?;
    let (edit_a, undo_a, _) = history_commits(&redo_initial, "a")?;
    let (_, _, redo_b) = history_commits(&redo_initial, "b")?;
    let redo_error = recovery()?
        .recover(
            EditorSession::new(redo_initial),
            vec![
                entry(1, "mismatch:redo-edit", LocalLogEvent::commit(edit_a))?,
                entry(2, "mismatch:redo-undo", LocalLogEvent::try_undo(undo_a)?)?,
                entry(3, "mismatch:redo", LocalLogEvent::try_redo(redo_b)?)?,
            ],
        )
        .err()
        .ok_or_else(|| test_error("mismatched logged redo was accepted"))?;
    let redo_source = assert_application_error(
        &redo_error,
        2,
        LocalLogEventKind::Redo,
        LocalLogEventApplicationErrorCode::ReplayCommitMismatch,
    )?;
    assert_eq!(redo_source.replay_transaction_code(), None);
    assert_eq!(redo_source.operation_index(), None);
    Ok(())
}

#[test]
fn close_and_clear_controls_must_change_history_state() -> TestResult {
    let context = EditorContext::default();

    for (lineage, replay_id, event, expected_kind) in [
        (
            "ineffective-close",
            "control:close",
            LocalLogEvent::close_history_group(),
            LocalLogEventKind::CloseHistoryGroup,
        ),
        (
            "ineffective-clear",
            "control:clear",
            LocalLogEvent::clear_history(),
            LocalLogEventKind::ClearHistory,
        ),
    ] {
        let initial = state(&context, "base", lineage)?;
        let error = recovery()?
            .recover(EditorSession::new(initial), vec![entry(1, replay_id, event)?])
            .err()
            .ok_or_else(|| test_error(format!("ineffective {expected_kind} was accepted")))?;
        let source = assert_application_error(
            &error,
            0,
            expected_kind,
            LocalLogEventApplicationErrorCode::IneffectiveControl,
        )?;
        assert_eq!(source.event_validation_code(), None);
        assert_eq!(source.replay_transaction_code(), None);
        assert_eq!(source.operation_index(), None);
    }
    Ok(())
}

#[test]
fn late_failure_returns_only_a_redacted_error_and_never_the_applied_prefix_session() -> TestResult {
    const SECRET: &str = "LATE_PREFIX_DOCUMENT_SECRET";

    let context = EditorContext::default();
    let initial = state(&context, "base", "late-failure-lineage")?;
    let commit = commit_once(&initial, SECRET)?;
    let result = recovery()?.recover(
        EditorSession::new(initial),
        vec![
            entry(1, "late:commit", LocalLogEvent::commit(commit))?,
            // A recorded commit does not open a merge group, so this late
            // control is intentionally ineffective after the private prefix.
            entry(2, "late:ineffective-close", LocalLogEvent::close_history_group())?,
        ],
    );
    let Err(error) = result else {
        return Err(test_error("late ineffective control unexpectedly published a session").into());
    };
    let application = assert_application_error(
        &error,
        1,
        LocalLogEventKind::CloseHistoryGroup,
        LocalLogEventApplicationErrorCode::IneffectiveControl,
    )?;
    assert_eq!(application.code().as_str(), "local_log_event_application.ineffective_control");
    assert_eq!(error.code().as_str(), "local_log_recovery.event_application");

    let nested = StdError::source(&error)
        .ok_or_else(|| test_error("event-application error lost its direct source"))?;
    assert_eq!(nested.to_string(), application.to_string());
    assert!(nested.source().is_none());
    for diagnostic in
        [format!("{error}"), format!("{error:?}"), nested.to_string(), format!("{application:?}")]
    {
        assert!(!diagnostic.contains(SECRET));
        assert!(!diagnostic.contains("late-failure-lineage"));
        assert!(!diagnostic.contains("Commit"));
        assert!(!diagnostic.contains("EditorSession"));
        assert!(!diagnostic.contains("Document"));
    }
    Ok(())
}
