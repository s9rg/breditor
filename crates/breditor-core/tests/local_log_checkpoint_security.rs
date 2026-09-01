//! Adversarial black-box contracts for checkpoint-linked successor recovery.

mod support;

use std::error::Error as StdError;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCompactionError, LocalLogCompactionErrorCode,
        LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent, LocalLogEventApplicationErrorCode,
        LocalLogEventKind, LocalLogId, LocalLogRecovery, LocalLogRecoveryError,
        LocalLogRecoveryErrorCode, LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId,
        RecoveredLocalLog, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const SESSION_ID: &str = "session:checkpoint-security";
const CHECKPOINT_LOG_ID: &str = "log:checkpoint-generation";
const SUCCESSOR_LOG_ID: &str = "log:successor-generation";
const PREFIX_REPLAY_ID: &str = "replay:compacted-prefix";

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

fn insert_transaction(state: &EditorState, text: &str) -> Result<Transaction, Box<dyn StdError>> {
    let start = TextOffset::try_new(0)?;
    let range = TextRange::try_new(path(&[0])?, start, start)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn apply_insert(session: &mut EditorSession, text: &str) -> Result<Commit, Box<dyn StdError>> {
    let transaction = insert_transaction(session.state(), text)?;
    session
        .apply_transaction(&transaction)?
        .into_commit()
        .ok_or_else(|| test_error("insertion unexpectedly remained unchanged").into())
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

fn checkpoint_entry(event: LocalLogEvent) -> Result<LocalLogEntry, Box<dyn StdError>> {
    entry_with_membership(SESSION_ID, CHECKPOINT_LOG_ID, 1, PREFIX_REPLAY_ID, event)
}

fn successor_entry(
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn StdError>> {
    entry_with_membership(SESSION_ID, SUCCESSOR_LOG_ID, sequence, replay_id, event)
}

fn recovered_fixture(
    context: &EditorContext,
    lineage: &str,
    tail_insertions: &[&str],
) -> Result<(RecoveredLocalLog, Vec<Commit>), Box<dyn StdError>> {
    let initial = state(context, "base", lineage)?;
    let mut producer = EditorSession::new(initial.clone());
    let prefix = apply_insert(&mut producer, "prefix-")?;
    let mut tail_commits = Vec::with_capacity(tail_insertions.len());
    for inserted in tail_insertions {
        tail_commits.push(apply_insert(&mut producer, inserted)?);
    }

    let recovered = LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    )
    .recover(EditorSession::new(initial), vec![checkpoint_entry(LocalLogEvent::commit(prefix))?])?;
    Ok((recovered, tail_commits))
}

fn anchor_fixture(
    context: &EditorContext,
    lineage: &str,
    tail_insertions: &[&str],
) -> Result<(LocalLogCheckpointAnchor, Vec<Commit>), Box<dyn StdError>> {
    let (recovered, tail_commits) = recovered_fixture(context, lineage, tail_insertions)?;
    let anchor = recovered.try_into_checkpoint_anchor(
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
        LocalLogCompactionLimits::default(),
    )?;
    Ok((anchor, tail_commits))
}

fn one_tail_commit(commits: Vec<Commit>) -> Result<Commit, Box<dyn StdError>> {
    let mut commits = commits.into_iter();
    let commit =
        commits.next().ok_or_else(|| test_error("fixture omitted its requested tail commit"))?;
    if commits.next().is_some() {
        return Err(test_error("fixture produced more than one tail commit").into());
    }
    Ok(commit)
}

#[test]
fn checkpoint_generation_must_advance_before_an_anchor_is_published() -> TestResult {
    let context = EditorContext::default();
    let (recovered, tail) = recovered_fixture(&context, "same-generation", &[])?;
    assert!(tail.is_empty());

    let error = recovered
        .try_into_checkpoint_anchor(
            LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
            LocalLogCompactionLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("checkpoint accepted its sealed generation as successor"))?;
    assert_eq!(error.code(), LocalLogCompactionErrorCode::GenerationNotAdvanced);
    let (recovered, error) = error.into_parts();
    assert_eq!(recovered.active_log_id().as_str(), CHECKPOINT_LOG_ID);
    let LocalLogCompactionError::GenerationNotAdvanced { checkpoint_log_id, successor_log_id } =
        error
    else {
        return Err(test_error("same-generation failure used the wrong variant").into());
    };
    assert_eq!(checkpoint_log_id.as_str(), CHECKPOINT_LOG_ID);
    assert_eq!(successor_log_id.as_str(), CHECKPOINT_LOG_ID);
    Ok(())
}

#[test]
fn successor_membership_precedes_compacted_replay_sequence_and_application_checks() -> TestResult {
    let context = EditorContext::default();

    let (anchor, tail) = anchor_fixture(&context, "foreign-session-precedence", &[])?;
    assert!(tail.is_empty());
    let session_error = anchor
        .recover_successor(
            vec![entry_with_membership(
                "session:foreign",
                "log:foreign",
                99,
                PREFIX_REPLAY_ID,
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("foreign successor session was accepted"))?;
    assert_eq!(session_error.code(), LocalLogRecoveryErrorCode::SessionMismatch);
    assert_eq!(session_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::SessionMismatch { expected, actual, .. } = session_error else {
        return Err(test_error("foreign successor session used the wrong variant").into());
    };
    assert_eq!(expected.as_str(), SESSION_ID);
    assert_eq!(actual.as_str(), "session:foreign");

    let (anchor, tail) = anchor_fixture(&context, "foreign-log-precedence", &[])?;
    assert!(tail.is_empty());
    let log_error = anchor
        .recover_successor(
            vec![entry_with_membership(
                SESSION_ID,
                "log:foreign",
                99,
                PREFIX_REPLAY_ID,
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("foreign successor generation was accepted"))?;
    assert_eq!(log_error.code(), LocalLogRecoveryErrorCode::ActiveLogMismatch);
    assert_eq!(log_error.delivery_index(), Some(0));
    let LocalLogRecoveryError::ActiveLogMismatch { expected, actual, .. } = log_error else {
        return Err(test_error("foreign successor generation used the wrong variant").into());
    };
    assert_eq!(expected.as_str(), SUCCESSOR_LOG_ID);
    assert_eq!(actual.as_str(), "log:foreign");
    Ok(())
}

#[test]
fn compacted_replay_is_rejected_before_sequence_or_event_application() -> TestResult {
    let context = EditorContext::default();
    let (anchor, tail) = anchor_fixture(&context, "compacted-replay-precedence", &[])?;
    assert!(tail.is_empty());

    // This entry is both out of sequence and an ineffective control. The
    // compact tombstone must fail closed before either later check can run.
    let error = anchor
        .recover_successor(
            vec![successor_entry(99, PREFIX_REPLAY_ID, LocalLogEvent::close_history_group())?],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("compacted replay identity was accepted"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::CompactedReplayId);
    assert_eq!(error.delivery_index(), Some(0));
    let LocalLogRecoveryError::CompactedReplayId { delivery_index, replay_id, checkpoint_sequence } =
        error
    else {
        return Err(test_error("compacted replay failure used the wrong variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(replay_id.as_str(), PREFIX_REPLAY_ID);
    assert_eq!(checkpoint_sequence, LocalLogSequence::FIRST);
    Ok(())
}

#[test]
fn conflicting_tail_replay_precedes_its_changed_sequence_and_payload_application() -> TestResult {
    let context = EditorContext::default();
    let (anchor, commits) =
        anchor_fixture(&context, "active-tail-replay-conflict", &["first-", "second-"])?;
    let mut commits = commits.into_iter();
    let first =
        commits.next().ok_or_else(|| test_error("fixture omitted the first tail commit"))?;
    let second =
        commits.next().ok_or_else(|| test_error("fixture omitted the second tail commit"))?;
    assert!(commits.next().is_none());

    let error = anchor
        .recover_successor(
            vec![
                successor_entry(2, "replay:tail-conflict", LocalLogEvent::commit(first))?,
                successor_entry(99, "replay:tail-conflict", LocalLogEvent::commit(second))?,
            ],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("conflicting successor replay binding was accepted"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::ReplayConflict);
    assert_eq!(error.delivery_index(), Some(1));
    let LocalLogRecoveryError::ReplayConflict { first_delivery_index, delivery_index, replay_id } =
        error
    else {
        return Err(test_error("tail replay conflict used the wrong variant").into());
    };
    assert_eq!((first_delivery_index, delivery_index), (0, 1));
    assert_eq!(replay_id.as_str(), "replay:tail-conflict");
    Ok(())
}

#[test]
fn successor_sequence_is_session_global_and_rejects_gaps_or_reused_prefix_positions() -> TestResult
{
    let context = EditorContext::default();

    let (anchor, commits) = anchor_fixture(&context, "successor-sequence-gap", &["gap-"])?;
    let gap = one_tail_commit(commits)?;
    let gap_error = anchor
        .recover_successor(
            vec![successor_entry(3, "replay:gap", LocalLogEvent::commit(gap))?],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("successor sequence gap was accepted"))?;
    let LocalLogRecoveryError::UnexpectedSequence { delivery_index, expected, actual } = gap_error
    else {
        return Err(test_error("successor gap used the wrong variant").into());
    };
    assert_eq!((delivery_index, expected.get(), actual.get()), (0, 2, 3));

    let (anchor, commits) = anchor_fixture(&context, "successor-sequence-reuse", &["reuse-"])?;
    let reused = one_tail_commit(commits)?;
    let reused_error = anchor
        .recover_successor(
            vec![successor_entry(1, "replay:new-at-old-position", LocalLogEvent::commit(reused))?],
            LocalLogRecoveryLimits::default(),
        )
        .err()
        .ok_or_else(|| test_error("successor reused a compacted prefix position"))?;
    let LocalLogRecoveryError::UnexpectedSequence { delivery_index, expected, actual } =
        reused_error
    else {
        return Err(test_error("reused prefix position used the wrong variant").into());
    };
    assert_eq!((delivery_index, expected.get(), actual.get()), (0, 2, 1));
    Ok(())
}

#[test]
fn successor_limits_are_batch_local_and_fail_at_the_first_excess() -> TestResult {
    let context = EditorContext::default();

    let (anchor, tail) = anchor_fixture(&context, "limits-empty-tail", &[])?;
    assert!(tail.is_empty());
    let empty = anchor.recover_successor(Vec::new(), LocalLogRecoveryLimits::new(0, 0, 0))?;
    assert_eq!(empty.compacted_replay_count(), 1);
    assert_eq!(empty.observation_count(), 0);
    assert_eq!(empty.unique_event_count(), 0);
    assert_eq!(empty.applied_operation_count(), 0);
    assert_eq!(empty.covered_through(), Some(LocalLogSequence::FIRST));
    assert_eq!(empty.next_sequence(), Some(LocalLogSequence::try_new(2)?));

    let (anchor, tail) = anchor_fixture(&context, "limits-observation", &[])?;
    assert!(tail.is_empty());
    let observation_error = anchor
        .recover_successor(
            vec![entry_with_membership(
                "session:foreign",
                "log:foreign",
                99,
                PREFIX_REPLAY_ID,
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::new(0, 0, 0),
        )
        .err()
        .ok_or_else(|| test_error("successor observation limit was not enforced"))?;
    assert_eq!(observation_error.code(), LocalLogRecoveryErrorCode::ObservationLimit);
    assert_eq!(observation_error.delivery_index(), None);
    let LocalLogRecoveryError::ObservationLimit { actual, maximum } = observation_error else {
        return Err(test_error("successor observation limit used the wrong variant").into());
    };
    assert_eq!((actual, maximum), (1, 0));

    let (anchor, commits) = anchor_fixture(&context, "limits-unique", &["unique-"])?;
    let unique_commit = one_tail_commit(commits)?;
    let unique_error = anchor
        .recover_successor(
            vec![successor_entry(2, "replay:unique-limit", LocalLogEvent::commit(unique_commit))?],
            LocalLogRecoveryLimits::new(1, 0, 1),
        )
        .err()
        .ok_or_else(|| test_error("successor unique-event limit was not enforced"))?;
    let LocalLogRecoveryError::UniqueEventLimit { delivery_index, attempted, maximum } =
        unique_error
    else {
        return Err(test_error("successor unique-event limit used the wrong variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (0, 1, 0));

    let (anchor, commits) = anchor_fixture(&context, "limits-operations", &["operation-"])?;
    let operation_commit = one_tail_commit(commits)?;
    let operation_error = anchor
        .recover_successor(
            vec![successor_entry(
                2,
                "replay:operation-limit",
                LocalLogEvent::commit(operation_commit),
            )?],
            LocalLogRecoveryLimits::new(1, 1, 0),
        )
        .err()
        .ok_or_else(|| test_error("successor operation limit was not enforced"))?;
    let LocalLogRecoveryError::AppliedOperationLimit { delivery_index, attempted, maximum } =
        operation_error
    else {
        return Err(test_error("successor operation limit used the wrong variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (0, 1, 0));
    Ok(())
}

#[test]
fn late_successor_failure_returns_only_a_redacted_error_and_no_applied_session() -> TestResult {
    const SECRET: &str = "SUCCESSOR_STAGED_DOCUMENT_SECRET";
    const LINEAGE: &str = "late-successor-failure-lineage";

    let context = EditorContext::default();
    let (anchor, commits) = anchor_fixture(&context, LINEAGE, &[SECRET])?;
    let tail_commit = one_tail_commit(commits)?;

    // Keep an immutable view of the last published checkpoint. If applying
    // the private successor prefix ever mutates structurally shared state in
    // place, this externally held state will expose the corruption.
    let published_checkpoint = anchor.session().state().clone();
    let document_codec =
        DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
    let published_document = document_codec.encode(published_checkpoint.document())?;
    assert!(!published_document.contains(SECRET));

    let result = anchor.recover_successor(
        vec![
            successor_entry(2, "replay:late-prefix", LocalLogEvent::commit(tail_commit))?,
            // A recorded commit does not open a merge group. This failure is
            // reached only after the first successor event was privately
            // applied, and therefore exercises all-or-nothing publication.
            successor_entry(
                3,
                "replay:late-ineffective-close",
                LocalLogEvent::close_history_group(),
            )?,
        ],
        LocalLogRecoveryLimits::default(),
    );
    let Err(error) = result else {
        return Err(test_error("late successor failure published a continued session").into());
    };
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::EventApplication);
    assert_eq!(error.delivery_index(), Some(1));
    let LocalLogRecoveryError::EventApplication { source, .. } = &error else {
        return Err(test_error("late successor failure used the wrong variant").into());
    };
    assert_eq!(source.event_kind(), LocalLogEventKind::CloseHistoryGroup);
    assert_eq!(source.code(), LocalLogEventApplicationErrorCode::IneffectiveControl);

    assert_eq!(document_codec.encode(published_checkpoint.document())?, published_document);
    let nested = StdError::source(&error)
        .ok_or_else(|| test_error("late successor error lost its direct source"))?;
    assert_eq!(nested.to_string(), source.to_string());
    assert!(nested.source().is_none());
    for diagnostic in
        [format!("{error}"), format!("{error:?}"), nested.to_string(), format!("{source:?}")]
    {
        assert!(!diagnostic.contains(SECRET));
        assert!(!diagnostic.contains(LINEAGE));
        assert!(!diagnostic.contains("Commit"));
        assert!(!diagnostic.contains("EditorSession"));
        assert!(!diagnostic.contains("Document"));
    }
    Ok(())
}
