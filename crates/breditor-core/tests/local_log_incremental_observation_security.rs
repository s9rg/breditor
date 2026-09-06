//! Adversarial contracts for recoverable one-observation admission.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{LocalLogEntryJsonCodec, SessionCheckpointJsonCodec},
    local_log::{
        ContinuedLocalLog, LocalLogCheckpointAnchor, LocalLogCompactionLimits, LocalLogEntry,
        LocalLogEvent, LocalLogId, LocalLogObservationOutcome, LocalLogRecovery,
        LocalLogRecoveryError, LocalLogRecoveryErrorCode, LocalLogRecoveryLimits, LocalLogSequence,
        LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::HistoryIntent,
};
use support::{
    TestResult,
    local_log::{apply, entry, insertion, state},
    test_error,
};

const PRIVATE_TEXT: &str = "private-incremental-payload";

struct PrefixFixture {
    context: EditorContext,
    session_id: LocalSessionId,
    g0: LocalLogId,
    g1: LocalLogId,
    anchor: LocalLogCheckpointAnchor,
    producer: EditorSession,
}

fn commit_from(
    context: &EditorContext,
    state: &EditorState,
    text: &str,
) -> Result<breditor_core::transaction::Commit, Box<dyn Error>> {
    insertion(state, 0, text, HistoryIntent::Record)?
        .apply(context, state)?
        .into_commit()
        .ok_or_else(|| test_error("captured insertion was unexpectedly unchanged").into())
}

fn fixture(compaction_limit: u64) -> Result<PrefixFixture, Box<dyn Error>> {
    let context = EditorContext::default();
    let initial = state(&context, "", "incremental-security")?;
    let session_id = LocalSessionId::try_new("session:incremental-security")?;
    let g0 = LocalLogId::try_new("log:incremental-security:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-security:g1")?;
    let mut producer = EditorSession::new(initial.clone());
    let prefix_transaction = insertion(producer.state(), 0, "P", HistoryIntent::Record)?;
    let prefix_log_commit = prefix_transaction
        .apply(&context, producer.state())?
        .into_commit()
        .ok_or_else(|| test_error("prefix insertion was unexpectedly unchanged"))?;
    let _ = apply(&mut producer, &prefix_transaction)?;
    let recovered = LocalLogRecovery::new(session_id.clone(), g0.clone()).recover(
        EditorSession::new(initial),
        vec![entry(
            &session_id,
            &g0,
            1,
            "request:prefix",
            LocalLogEvent::commit(prefix_log_commit),
        )?],
    )?;
    let anchor = recovered
        .try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(compaction_limit))?;
    Ok(PrefixFixture { context, session_id, g0, g1, anchor, producer })
}

fn reject(
    owner: ContinuedLocalLog,
    observation: LocalLogEntry,
    expected: LocalLogRecoveryErrorCode,
) -> Result<(ContinuedLocalLog, LocalLogEntry, LocalLogRecoveryError), Box<dyn Error>> {
    let failure = owner
        .try_observe(observation)
        .err()
        .ok_or_else(|| test_error(format!("expected observation failure {expected:?}")))?;
    assert_eq!(failure.code(), expected);
    Ok(failure.into_parts())
}

fn duplicate_entry(
    context: &EditorContext,
    entry: &LocalLogEntry,
) -> Result<(LocalLogEntry, LocalLogEntry), Box<dyn Error>> {
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let json = codec.encode(entry)?;
    Ok((codec.decode(&json)?, codec.decode(&json)?))
}

#[test]
fn membership_replay_sequence_and_unique_precedence_return_unchanged_owner_and_entry() -> TestResult
{
    let PrefixFixture { context, session_id, g0, g1, anchor, mut producer } = fixture(3)?;
    let limits = LocalLogRecoveryLimits::new(8, 1, 8);
    let session_codec = SessionCheckpointJsonCodec::new(context.clone());
    let before = session_codec.encode(anchor.session())?;
    let mut owner = anchor.begin_successor(limits);

    let foreign_session = LocalSessionId::try_new("session:foreign")?;
    let wrong_membership = entry(
        &foreign_session,
        &g0,
        99,
        "request:prefix",
        LocalLogEvent::commit(commit_from(&context, producer.state(), "A")?),
    )?;
    let (next, rejected, error) =
        reject(owner, wrong_membership, LocalLogRecoveryErrorCode::SessionMismatch)?;
    assert_eq!(error.delivery_index(), Some(0));
    assert_eq!(rejected.session_id(), &foreign_session);
    owner = next;

    let wrong_log = entry(
        &session_id,
        &g0,
        99,
        "request:prefix",
        LocalLogEvent::commit(commit_from(&context, producer.state(), "A")?),
    )?;
    let (next, _, error) = reject(owner, wrong_log, LocalLogRecoveryErrorCode::ActiveLogMismatch)?;
    assert_eq!(error.delivery_index(), Some(0));
    owner = next;

    let compacted = entry(
        &session_id,
        &g1,
        99,
        "request:prefix",
        LocalLogEvent::commit(commit_from(&context, producer.state(), "A")?),
    )?;
    let (next, _, error) = reject(owner, compacted, LocalLogRecoveryErrorCode::CompactedReplayId)?;
    assert_eq!(error.delivery_index(), Some(0));
    owner = next;

    let wrong_sequence = entry(
        &session_id,
        &g1,
        3,
        "request:first-active",
        LocalLogEvent::commit(commit_from(&context, producer.state(), "A")?),
    )?;
    let (next, rejected, error) =
        reject(owner, wrong_sequence, LocalLogRecoveryErrorCode::UnexpectedSequence)?;
    assert_eq!(rejected.sequence(), LocalLogSequence::try_new(3)?);
    assert_eq!(error.delivery_index(), Some(0));
    owner = next;

    assert_eq!(session_codec.encode(owner.session())?, before);
    assert_eq!(
        (
            owner.observation_count(),
            owner.unique_event_count(),
            owner.exact_duplicate_count(),
            owner.applied_operation_count(),
        ),
        (0, 0, 0, 0)
    );
    assert_eq!(owner.covered_through(), Some(LocalLogSequence::FIRST));

    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let first_entry =
        entry(&session_id, &g1, 2, "request:first-active", LocalLogEvent::commit(first))?;
    let (next, outcome) = owner.try_observe(first_entry)?;
    assert_eq!(
        outcome,
        LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::try_new(2)?,
        }
    );
    owner = next;

    let conflict =
        entry(&session_id, &g1, 99, "request:first-active", LocalLogEvent::clear_history())?;
    let (next, _, error) = reject(owner, conflict, LocalLogRecoveryErrorCode::ReplayConflict)?;
    let LocalLogRecoveryError::ReplayConflict { first_delivery_index, delivery_index, .. } = error
    else {
        return Err(test_error("active conflict used the wrong error variant").into());
    };
    assert_eq!((first_delivery_index, delivery_index), (0, 1));
    owner = next;

    let second = entry(
        &session_id,
        &g1,
        3,
        "request:second-active",
        LocalLogEvent::commit(commit_from(&context, producer.state(), "B")?),
    )?;
    let (owner, rejected, error) =
        reject(owner, second, LocalLogRecoveryErrorCode::UniqueEventLimit)?;
    assert_eq!(rejected.replay_id().as_str(), "request:second-active");
    assert_eq!(error.delivery_index(), Some(1));
    assert_eq!(owner.observation_count(), 1);
    assert_eq!(owner.recovery_limits(), limits);
    assert_eq!(session_codec.encode(owner.session())?, session_codec.encode(&producer)?);
    Ok(())
}

#[test]
fn duplicates_keep_exact_first_physical_index_and_charge_only_observation_budget() -> TestResult {
    let PrefixFixture { context, session_id, g0: _, g1, anchor, mut producer } = fixture(3)?;
    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let first_entry =
        entry(&session_id, &g1, 2, "request:first-active", LocalLogEvent::commit(first))?;
    let (first_entry, first_retry) = duplicate_entry(&context, &first_entry)?;
    let second_transaction = insertion(producer.state(), 0, "B", HistoryIntent::Record)?;
    let second = apply(&mut producer, &second_transaction)?;
    let second_entry =
        entry(&session_id, &g1, 3, "request:second-active", LocalLogEvent::commit(second))?;
    let mut owner = anchor.begin_successor(LocalLogRecoveryLimits::new(4, 2, 2));

    let (next, _) = owner.try_observe(first_entry)?;
    owner = next;
    let history_before_duplicate = owner.session().history_status();
    let (next, outcome) = owner.try_observe(first_retry)?;
    assert_eq!(outcome.first_delivery_index(), Some(0));
    assert!(!outcome.was_applied());
    assert_eq!(next.session().history_status(), history_before_duplicate);
    owner = next;
    let (next, outcome) = owner.try_observe(second_entry)?;
    assert_eq!(outcome.delivery_index(), 2);
    owner = next;

    assert_eq!(
        (
            owner.observation_count(),
            owner.unique_event_count(),
            owner.exact_duplicate_count(),
            owner.applied_operation_count(),
        ),
        (3, 2, 1, 2)
    );
    let conflict =
        entry(&session_id, &g1, 99, "request:second-active", LocalLogEvent::clear_history())?;
    let (owner, _, error) = reject(owner, conflict, LocalLogRecoveryErrorCode::ReplayConflict)?;
    let LocalLogRecoveryError::ReplayConflict { first_delivery_index, delivery_index, .. } = error
    else {
        return Err(test_error("interspersed conflict used the wrong error variant").into());
    };
    assert_eq!((first_delivery_index, delivery_index), (2, 3));
    assert_eq!(owner.observation_count(), 3);
    Ok(())
}

#[test]
fn observation_operation_and_application_failures_are_atomic_and_redacted() -> TestResult {
    let PrefixFixture { g0, anchor, .. } = fixture(3)?;

    let foreign = entry(
        &LocalSessionId::try_new("session:foreign-observation-limit")?,
        &g0,
        99,
        "request:foreign",
        LocalLogEvent::clear_history(),
    )?;
    let owner = anchor.begin_successor(LocalLogRecoveryLimits::new(0, 0, 0));
    let (owner, rejected, error) =
        reject(owner, foreign, LocalLogRecoveryErrorCode::ObservationLimit)?;
    assert!(matches!(error, LocalLogRecoveryError::ObservationLimit { actual: 1, maximum: 0 }));
    assert_eq!(rejected.session_id().as_str(), "session:foreign-observation-limit");
    assert_eq!(owner.observation_count(), 0);

    // A fresh owner reaches operation admission only after all earlier checks.
    let PrefixFixture {
        context: operation_context,
        session_id: operation_session_id,
        g1: operation_log,
        anchor,
        producer: operation_producer,
        ..
    } = fixture(3)?;
    let operation_limited = entry(
        &operation_session_id,
        &operation_log,
        2,
        "request:operation-limited",
        LocalLogEvent::commit(commit_from(
            &operation_context,
            operation_producer.state(),
            PRIVATE_TEXT,
        )?),
    )?;
    let owner = anchor.begin_successor(LocalLogRecoveryLimits::new(1, 1, 0));
    let operation_session_codec = SessionCheckpointJsonCodec::new(operation_context.clone());
    let before = operation_session_codec.encode(owner.session())?;
    let failure = owner
        .try_observe(operation_limited)
        .err()
        .ok_or_else(|| test_error("operation-limited observation unexpectedly applied"))?;
    assert_eq!(failure.code(), LocalLogRecoveryErrorCode::AppliedOperationLimit);
    let rendered = format!("{failure:?} {failure}");
    assert!(!rendered.contains(PRIVATE_TEXT));
    assert!(!rendered.contains("ContinuedLocalLog"));
    assert!(!rendered.contains("LocalLogEntry"));
    let (owner, rejected, error) = failure.into_parts();
    assert_eq!(rejected.replay_id().as_str(), "request:operation-limited");
    assert_eq!(error.delivery_index(), Some(0));
    assert_eq!(operation_session_codec.encode(owner.session())?, before);
    assert_eq!(owner.observation_count(), 0);

    // A stale commit under a fresh sufficient policy passes resource checks but
    // application still returns the exact owner and proof without mutation.
    let PrefixFixture {
        context: stale_context,
        session_id: stale_session_id,
        g1: stale_log,
        anchor: stale_anchor,
        ..
    } = fixture(3)?;
    let stale_owner = stale_anchor.begin_successor(LocalLogRecoveryLimits::new(1, 1, 1));
    let stale_session_codec = SessionCheckpointJsonCodec::new(stale_context.clone());
    let stale_before = stale_session_codec.encode(stale_owner.session())?;
    let stale_history_status = stale_owner.session().history_status();
    let stale_state = state(&stale_context, "stale", "incremental-stale")?;
    let stale = entry(
        &stale_session_id,
        &stale_log,
        2,
        "request:stale",
        LocalLogEvent::commit(commit_from(&stale_context, &stale_state, "X")?),
    )?;
    let stale_entry_codec = LocalLogEntryJsonCodec::new(stale_context.clone());
    let stale_json = stale_entry_codec.encode(&stale)?;
    let (stale_owner, rejected, error) =
        reject(stale_owner, stale, LocalLogRecoveryErrorCode::EventApplication)?;
    assert_eq!(rejected.replay_id().as_str(), "request:stale");
    assert_eq!(stale_entry_codec.encode(&rejected)?, stale_json);
    assert_eq!(error.delivery_index(), Some(0));
    assert_eq!(stale_session_codec.encode(stale_owner.session())?, stale_before);
    assert_eq!(stale_owner.session().history_status(), stale_history_status);
    assert_eq!(stale_owner.observation_count(), 0);

    let corrected = entry(
        &stale_session_id,
        &stale_log,
        2,
        "request:stale",
        LocalLogEvent::commit(commit_from(&stale_context, stale_owner.session().state(), "X")?),
    )?;
    let (stale_owner, outcome) = stale_owner.try_observe(corrected)?;
    assert!(outcome.was_applied());
    assert_eq!(stale_owner.observation_count(), 1);
    Ok(())
}

#[test]
fn returned_future_entry_can_be_resubmitted_after_the_gap_is_filled() -> TestResult {
    let PrefixFixture { context, session_id, g1, anchor, mut producer, .. } = fixture(3)?;
    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let second_transaction = insertion(producer.state(), 1, "B", HistoryIntent::Record)?;
    let second = apply(&mut producer, &second_transaction)?;
    let first_entry =
        entry(&session_id, &g1, 2, "request:gap-first", LocalLogEvent::commit(first))?;
    let second_entry =
        entry(&session_id, &g1, 3, "request:gap-second", LocalLogEvent::commit(second))?;
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let second_json = codec.encode(&second_entry)?;
    let owner = anchor.begin_successor(LocalLogRecoveryLimits::new(2, 2, 2));

    let (owner, returned_second, error) =
        reject(owner, second_entry, LocalLogRecoveryErrorCode::UnexpectedSequence)?;
    assert_eq!(error.delivery_index(), Some(0));
    assert_eq!(codec.encode(&returned_second)?, second_json);
    assert_eq!(owner.observation_count(), 0);

    let (owner, first_outcome) = owner.try_observe(first_entry)?;
    assert_eq!(first_outcome.delivery_index(), 0);
    let (owner, second_outcome) = owner.try_observe(returned_second)?;
    assert_eq!(second_outcome.delivery_index(), 1);
    assert_eq!(second_outcome.sequence(), LocalLogSequence::try_new(3)?);
    assert_eq!(
        (
            owner.observation_count(),
            owner.unique_event_count(),
            owner.exact_duplicate_count(),
            owner.applied_operation_count(),
        ),
        (2, 2, 0, 2)
    );
    assert_eq!(
        SessionCheckpointJsonCodec::new(context).encode(owner.session())?,
        SessionCheckpointJsonCodec::new(producer.state().context().clone()).encode(&producer)?
    );
    Ok(())
}

#[test]
fn cumulative_observation_and_operation_limits_win_without_consuming_the_next_slot() -> TestResult {
    let PrefixFixture { context, session_id, g1, anchor, mut producer, .. } = fixture(3)?;
    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let first_entry =
        entry(&session_id, &g1, 2, "request:observation-cap", LocalLogEvent::commit(first))?;
    let (first_entry, first_retry) = duplicate_entry(&context, &first_entry)?;
    let retry_json = LocalLogEntryJsonCodec::new(context.clone()).encode(&first_retry)?;
    let (owner, _) =
        anchor.begin_successor(LocalLogRecoveryLimits::new(1, 1, 1)).try_observe(first_entry)?;
    let history_at_observation_cap = owner.session().history_status();

    let (owner, returned_retry, error) =
        reject(owner, first_retry, LocalLogRecoveryErrorCode::ObservationLimit)?;
    assert!(matches!(error, LocalLogRecoveryError::ObservationLimit { actual: 2, maximum: 1 }));
    assert_eq!(LocalLogEntryJsonCodec::new(context.clone()).encode(&returned_retry)?, retry_json);
    assert_eq!(owner.session().history_status(), history_at_observation_cap);
    assert_eq!((owner.observation_count(), owner.exact_duplicate_count()), (1, 0));
    let (owner, _returned_retry, repeated_error) =
        reject(owner, returned_retry, LocalLogRecoveryErrorCode::ObservationLimit)?;
    assert!(matches!(
        repeated_error,
        LocalLogRecoveryError::ObservationLimit { actual: 2, maximum: 1 }
    ));
    assert_eq!((owner.observation_count(), owner.exact_duplicate_count()), (1, 0));

    let PrefixFixture {
        context: operation_context,
        session_id: operation_session_id,
        g1: operation_log,
        anchor: operation_anchor,
        mut producer,
        ..
    } = fixture(3)?;
    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let second_transaction = insertion(producer.state(), 1, "B", HistoryIntent::Record)?;
    let second = apply(&mut producer, &second_transaction)?;
    let first_entry = entry(
        &operation_session_id,
        &operation_log,
        2,
        "request:operation-cap-first",
        LocalLogEvent::commit(first),
    )?;
    let second_entry = entry(
        &operation_session_id,
        &operation_log,
        3,
        "request:operation-cap-second",
        LocalLogEvent::commit(second),
    )?;
    let operation_codec = LocalLogEntryJsonCodec::new(operation_context);
    let second_json = operation_codec.encode(&second_entry)?;
    let (owner, _) = operation_anchor
        .begin_successor(LocalLogRecoveryLimits::new(2, 2, 1))
        .try_observe(first_entry)?;
    let history_at_operation_cap = owner.session().history_status();
    let (owner, returned_second, error) =
        reject(owner, second_entry, LocalLogRecoveryErrorCode::AppliedOperationLimit)?;
    assert!(matches!(
        error,
        LocalLogRecoveryError::AppliedOperationLimit {
            delivery_index: 1,
            attempted: 2,
            maximum: 1,
        }
    ));
    assert_eq!(operation_codec.encode(&returned_second)?, second_json);
    assert_eq!(owner.session().history_status(), history_at_operation_cap);
    assert_eq!(
        (
            owner.observation_count(),
            owner.unique_event_count(),
            owner.exact_duplicate_count(),
            owner.applied_operation_count(),
        ),
        (1, 1, 0, 1)
    );
    Ok(())
}

#[test]
fn failed_lifetime_seal_returns_an_appendable_owner_before_explicit_reauthorization() -> TestResult
{
    let context = EditorContext::default();
    let initial = state(&context, "", "incremental-seal")?;
    let session_id = LocalSessionId::try_new("session:incremental-seal")?;
    let g0 = LocalLogId::try_new("log:incremental-seal:g0")?;
    let g1 = LocalLogId::try_new("log:incremental-seal:g1")?;
    let g2 = LocalLogId::try_new("log:incremental-seal:g2")?;
    let recovered = LocalLogRecovery::new(session_id.clone(), g0)
        .recover(EditorSession::new(initial.clone()), Vec::new())?;
    let anchor =
        recovered.try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(1))?;
    let mut producer = EditorSession::new(initial);
    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first = apply(&mut producer, &first_transaction)?;
    let second_transaction = insertion(producer.state(), 1, "B", HistoryIntent::Record)?;
    let second = apply(&mut producer, &second_transaction)?;
    let first_entry = entry(&session_id, &g1, 1, "request:first", LocalLogEvent::commit(first))?;
    let second_entry = entry(&session_id, &g1, 2, "request:second", LocalLogEvent::commit(second))?;
    let codec = LocalLogEntryJsonCodec::new(context);
    let second_json = codec.encode(&second_entry)?;
    let mut owner = anchor.begin_successor(LocalLogRecoveryLimits::new(3, 2, 2));
    let (next, _) = owner.try_observe(first_entry)?;
    owner = next;
    let (next, _) = owner.try_observe(second_entry)?;
    owner = next;

    let failure = owner
        .try_into_checkpoint_anchor(g2.clone())
        .err()
        .ok_or_else(|| test_error("over-limit incremental owner unexpectedly compacted"))?;
    let owner = failure.into_owner();
    assert_eq!(owner.observation_count(), 2);
    let (owner, outcome) = owner.try_observe(codec.decode(&second_json)?)?;
    assert_eq!(outcome.first_delivery_index(), Some(1));
    assert_eq!((owner.observation_count(), owner.exact_duplicate_count()), (3, 1));

    let anchor =
        owner.try_into_checkpoint_anchor_with_limits(g2, LocalLogCompactionLimits::new(2))?;
    assert_eq!(anchor.compacted_replay_count(), 2);
    Ok(())
}
