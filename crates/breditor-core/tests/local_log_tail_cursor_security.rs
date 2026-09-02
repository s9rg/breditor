//! Adversarial contracts for active-tail cursor atomicity and precedence.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        LOCAL_LOG_FRAME_HEADER_BYTES, LocalLogFrameCodecError, LocalLogFrameErrorCode,
        LocalLogFrameLimits, LocalLogTailCursor, LocalLogTailError, LocalLogTailErrorCode,
        LocalLogTailFailure, LocalLogTailStatus, SessionCheckpointJsonCodec,
    },
    local_log::{
        LocalLogEvent, LocalLogId, LocalLogObservationOutcome, LocalLogRecoveryError,
        LocalLogRecoveryErrorCode, LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId,
    },
    schema::DocumentLimits,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::HistoryIntent,
};
use support::{
    TestResult,
    local_log::{apply, entry, insertion, state},
    local_log_tail::{empty_anchor, frame_codec, raw_frame},
    test_error,
};

struct Fixture {
    context: EditorContext,
    initial: EditorState,
    session_id: LocalSessionId,
    checkpoint_log: LocalLogId,
    active_log: LocalLogId,
    frame: Vec<u8>,
}

impl Fixture {
    fn new(text: &str, sequence: u64) -> Result<Self, Box<dyn Error>> {
        let context = EditorContext::default();
        let initial = state(&context, "", "tail-cursor-security")?;
        let session_id = LocalSessionId::try_new("session:tail-cursor-security")?;
        let checkpoint_log = LocalLogId::try_new("log:tail-cursor-security:g0")?;
        let active_log = LocalLogId::try_new("log:tail-cursor-security:g1")?;
        let mut producer = EditorSession::new(initial.clone());
        let transaction = insertion(producer.state(), 0, text, HistoryIntent::Record)?;
        let commit = apply(&mut producer, &transaction)?;
        let replay_id = format!("request:tail-security:{sequence}");
        let observation =
            entry(&session_id, &active_log, sequence, &replay_id, LocalLogEvent::commit(commit))?;
        let frame = frame_codec(context.clone(), &session_id, &active_log).encode(&observation)?;
        Ok(Self { context, initial, session_id, checkpoint_log, active_log, frame })
    }

    fn cursor(
        &self,
        frame_limits: LocalLogFrameLimits,
    ) -> Result<LocalLogTailCursor, Box<dyn Error>> {
        self.cursor_with_recovery(LocalLogRecoveryLimits::new(8, 8, 8), frame_limits)
    }

    fn cursor_with_recovery(
        &self,
        recovery_limits: LocalLogRecoveryLimits,
        frame_limits: LocalLogFrameLimits,
    ) -> Result<LocalLogTailCursor, Box<dyn Error>> {
        Ok(empty_anchor(
            self.initial.clone(),
            &self.session_id,
            &self.checkpoint_log,
            &self.active_log,
            8,
        )?
        .begin_successor_tail(recovery_limits, frame_limits))
    }
}

fn failure(
    result: Result<breditor_core::codec::LocalLogTailStep, LocalLogTailFailure>,
) -> Result<LocalLogTailFailure, Box<dyn Error>> {
    result.err().ok_or_else(|| test_error("expected active-tail cursor failure").into())
}

#[test]
fn input_origin_precedes_byte_inspection_and_every_prefix_preserves_the_cursor() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let empty_mismatch =
        failure(fixture.cursor(LocalLogFrameLimits::default())?.try_observe_frame(1, &[]))?;
    assert_eq!(empty_mismatch.code(), LocalLogTailErrorCode::InputOriginMismatch);
    assert!(matches!(
        empty_mismatch.error(),
        LocalLogTailError::InputOriginMismatch { expected: 0, actual: 1 }
    ));
    assert_eq!(empty_mismatch.cursor().accepted_byte_offset(), 0);
    assert_eq!(empty_mismatch.cursor().owner().observation_count(), 0);
    assert!(empty_mismatch.rejected_entry().is_none());

    let mismatch = failure(
        fixture
            .cursor(LocalLogFrameLimits::default())?
            .try_observe_frame(1, b"not even frame magic"),
    )?;
    assert_eq!(mismatch.code(), LocalLogTailErrorCode::InputOriginMismatch);
    assert!(matches!(
        mismatch.error(),
        LocalLogTailError::InputOriginMismatch { expected: 0, actual: 1 }
    ));
    assert_eq!(mismatch.cursor().accepted_byte_offset(), 0);
    assert_eq!(mismatch.cursor().owner().observation_count(), 0);
    assert!(mismatch.rejected_entry().is_none());

    let empty = fixture.cursor(LocalLogFrameLimits::default())?.try_observe_frame(0, &[])?;
    assert!(empty.status().is_end_of_input());
    assert_eq!(empty.cursor().accepted_byte_offset(), 0);

    for cut in 1..fixture.frame.len() {
        let step = fixture
            .cursor(LocalLogFrameLimits::default())?
            .try_observe_frame(0, &fixture.frame[..cut])?;
        assert!(step.status().truncation().is_some(), "cut {cut} was not truncated");
        assert_eq!(step.cursor().accepted_byte_offset(), 0);
        assert_eq!(step.cursor().owner().observation_count(), 0);
    }
    Ok(())
}

#[test]
fn scan_decode_and_admission_failures_return_the_unchanged_owner_and_offset() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let mut corrupted = fixture.frame.clone();
    corrupted[LOCAL_LOG_FRAME_HEADER_BYTES] ^= 0x01;
    let scan =
        failure(fixture.cursor(LocalLogFrameLimits::default())?.try_observe_frame(0, &corrupted))?;
    assert_eq!(scan.code(), LocalLogTailErrorCode::FrameScan);
    assert_eq!(
        scan.error().frame_scan_error().map(LocalLogFrameCodecError::code),
        Some(LocalLogFrameErrorCode::PayloadChecksumMismatch)
    );
    assert_eq!(scan.cursor().accepted_byte_offset(), 0);
    assert_eq!(scan.cursor().owner().observation_count(), 0);
    assert!(scan.rejected_entry().is_none());

    let foreign_session = LocalSessionId::try_new("session:tail-cursor-foreign")?;
    let foreign_entry = entry(
        &foreign_session,
        &fixture.active_log,
        1,
        "request:tail-foreign",
        LocalLogEvent::clear_history(),
    )?;
    let foreign_frame = frame_codec(fixture.context.clone(), &foreign_session, &fixture.active_log)
        .encode(&foreign_entry)?;
    let decode = failure(
        fixture.cursor(LocalLogFrameLimits::default())?.try_observe_frame(0, &foreign_frame),
    )?;
    assert_eq!(decode.code(), LocalLogTailErrorCode::FrameDecode);
    assert_eq!(
        decode.error().frame_decode_error().map(LocalLogFrameCodecError::code),
        Some(LocalLogFrameErrorCode::SessionMismatch)
    );
    assert_eq!(decode.cursor().accepted_byte_offset(), 0);
    assert_eq!(decode.cursor().owner().observation_count(), 0);
    assert!(decode.rejected_entry().is_none());

    let future = Fixture::new("SECRET_CURSOR_DOCUMENT_PAYLOAD", 2)?;
    let admission = failure(
        future.cursor(LocalLogFrameLimits::default())?.try_observe_frame(0, &future.frame),
    )?;
    assert_eq!(admission.code(), LocalLogTailErrorCode::Admission);
    assert_eq!(
        admission
            .error()
            .admission_error()
            .map(breditor_core::local_log::LocalLogRecoveryError::code),
        Some(LocalLogRecoveryErrorCode::UnexpectedSequence)
    );
    assert_eq!(admission.cursor().accepted_byte_offset(), 0);
    assert_eq!(admission.cursor().owner().observation_count(), 0);
    assert_eq!(admission.rejected_entry().map(|entry| entry.sequence().get()), Some(2));
    let debug = format!("{admission:?}");
    assert!(!debug.contains("SECRET_CURSOR_DOCUMENT_PAYLOAD"));
    assert!(!debug.contains("LocalLogEntry"));
    let display = admission.to_string();
    assert!(!display.contains("SECRET_CURSOR_DOCUMENT_PAYLOAD"));
    assert!(!display.contains("LocalLogEntry"));
    let (cursor, rejected_entry, error) = admission.into_parts();
    assert_eq!(cursor.accepted_byte_offset(), 0);
    assert_eq!(rejected_entry.map(|entry| entry.sequence().get()), Some(2));
    assert_eq!(error.code(), LocalLogTailErrorCode::Admission);
    Ok(())
}

#[test]
fn frame_policy_and_offset_overflow_fail_before_decode_or_admission() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let payload_bytes = fixture
        .frame
        .len()
        .checked_sub(LOCAL_LOG_FRAME_HEADER_BYTES)
        .ok_or_else(|| test_error("encoded frame was shorter than its fixed header"))?;
    let too_small = LocalLogFrameLimits::new(
        u64::try_from(payload_bytes)?
            .checked_sub(1)
            .ok_or_else(|| test_error("test frame unexpectedly had an empty payload"))?,
    );
    let limited = failure(fixture.cursor(too_small)?.try_observe_frame(0, &fixture.frame))?;
    assert_eq!(limited.code(), LocalLogTailErrorCode::FrameScan);
    assert_eq!(
        limited.error().frame_scan_error().map(LocalLogFrameCodecError::code),
        Some(LocalLogFrameErrorCode::PayloadTooLarge)
    );
    assert_eq!(limited.cursor().owner().observation_count(), 0);

    let cursor = fixture.cursor(LocalLogFrameLimits::default())?;
    let (owner, _, limits) = cursor.into_parts();
    let frame_bytes = u64::try_from(fixture.frame.len())?;
    let near_end = u64::MAX
        .checked_sub(frame_bytes)
        .and_then(|value| value.checked_add(1))
        .ok_or_else(|| test_error("could not construct near-overflow cursor offset"))?;
    let cursor = LocalLogTailCursor::from_trusted_parts(owner, near_end, limits);
    let overflow = failure(cursor.try_observe_frame(near_end, &fixture.frame))?;
    assert_eq!(overflow.code(), LocalLogTailErrorCode::AcceptedOffsetOverflow);
    assert!(matches!(
        overflow.error(),
        LocalLogTailError::AcceptedOffsetOverflow { accepted_bytes, consumed_bytes }
            if *accepted_bytes == near_end && *consumed_bytes == frame_bytes
    ));
    assert_eq!(overflow.cursor().accepted_byte_offset(), near_end);
    assert_eq!(overflow.cursor().owner().observation_count(), 0);
    assert!(overflow.rejected_entry().is_none());

    // Offset accounting precedes semantic decoding: even a checksum-valid frame
    // with an invalid entry payload must fail at the offset boundary first.
    let invalid_frame = raw_frame(b"{}")?;
    let cursor = fixture.cursor(LocalLogFrameLimits::default())?;
    let (owner, _, limits) = cursor.into_parts();
    let invalid_frame_bytes = u64::try_from(invalid_frame.len())?;
    let near_end = u64::MAX
        .checked_sub(invalid_frame_bytes)
        .and_then(|value| value.checked_add(1))
        .ok_or_else(|| test_error("could not construct invalid-frame overflow offset"))?;
    let cursor = LocalLogTailCursor::from_trusted_parts(owner, near_end, limits);
    let overflow = failure(cursor.try_observe_frame(near_end, &invalid_frame))?;
    assert_eq!(overflow.code(), LocalLogTailErrorCode::AcceptedOffsetOverflow);
    assert_eq!(overflow.cursor().accepted_byte_offset(), near_end);
    assert!(overflow.error().frame_decode_error().is_none());
    assert!(overflow.rejected_entry().is_none());
    Ok(())
}

#[test]
fn accepted_step_reports_only_the_first_frame_and_has_payload_free_debug() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let step = {
        let mut temporary_input = fixture.frame.clone();
        temporary_input.extend_from_slice(b"SECRET_UNINSPECTED_SUFFIX");
        fixture.cursor(LocalLogFrameLimits::default())?.try_observe_frame(0, &temporary_input)?
    };
    assert_eq!(step.status().frame_bytes(), Some(fixture.frame.len()));
    assert_eq!(step.status().accepted_range(), Some((0, u64::try_from(fixture.frame.len())?)));
    assert_eq!(step.cursor().owner().observation_count(), 1);
    let debug = format!("{step:?}");
    assert!(!debug.contains("SECRET_UNINSPECTED_SUFFIX"));
    assert!(matches!(step.status(), LocalLogTailStatus::Accepted { .. }));

    let (cursor, _) = step.into_parts();
    let suffix_failure = failure(
        cursor.try_observe_frame(u64::try_from(fixture.frame.len())?, b"SECRET_UNINSPECTED_SUFFIX"),
    )?;
    assert_eq!(suffix_failure.code(), LocalLogTailErrorCode::FrameScan);
    assert_eq!(suffix_failure.cursor().accepted_byte_offset(), u64::try_from(fixture.frame.len())?);
    assert_eq!(suffix_failure.cursor().owner().observation_count(), 1);
    Ok(())
}

#[test]
fn returned_truncation_and_scan_failure_cursors_can_accept_the_same_complete_frame() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let cut = fixture
        .frame
        .len()
        .checked_sub(1)
        .ok_or_else(|| test_error("test frame unexpectedly had no bytes"))?;
    let truncated = fixture
        .cursor(LocalLogFrameLimits::default())?
        .try_observe_frame(0, &fixture.frame[..cut])?;
    assert!(truncated.status().truncation().is_some());
    let (cursor, _) = truncated.into_parts();
    let accepted = cursor.try_observe_frame(0, &fixture.frame)?;
    assert_eq!(accepted.status().frame_bytes(), Some(fixture.frame.len()));
    assert_eq!(accepted.cursor().owner().observation_count(), 1);

    let mut corrupted = fixture.frame.clone();
    corrupted[LOCAL_LOG_FRAME_HEADER_BYTES] ^= 0x01;
    let scan_failure =
        failure(fixture.cursor(LocalLogFrameLimits::default())?.try_observe_frame(0, &corrupted))?;
    let (cursor, rejected_entry, error) = scan_failure.into_parts();
    assert!(rejected_entry.is_none());
    assert_eq!(error.code(), LocalLogTailErrorCode::FrameScan);
    let accepted = cursor.try_observe_frame(0, &fixture.frame)?;
    assert_eq!(accepted.status().frame_bytes(), Some(fixture.frame.len()));
    assert_eq!(accepted.cursor().owner().observation_count(), 1);
    Ok(())
}

#[test]
fn foreign_active_log_is_a_decode_failure_before_semantic_admission() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let foreign_log = LocalLogId::try_new("log:tail-cursor-security:foreign")?;
    let foreign_entry = entry(
        &fixture.session_id,
        &foreign_log,
        1,
        "request:tail-foreign-log",
        LocalLogEvent::clear_history(),
    )?;
    let foreign_frame = frame_codec(fixture.context.clone(), &fixture.session_id, &foreign_log)
        .encode(&foreign_entry)?;

    let decode = failure(
        fixture
            .cursor_with_recovery(
                LocalLogRecoveryLimits::new(0, 0, 0),
                LocalLogFrameLimits::default(),
            )?
            .try_observe_frame(0, &foreign_frame),
    )?;
    assert_eq!(decode.code(), LocalLogTailErrorCode::FrameDecode);
    assert_eq!(
        decode.error().frame_decode_error().map(LocalLogFrameCodecError::code),
        Some(LocalLogFrameErrorCode::ActiveLogMismatch)
    );
    assert_eq!(decode.cursor().accepted_byte_offset(), 0);
    assert_eq!(decode.cursor().owner().observation_count(), 0);
    assert!(decode.rejected_entry().is_none());
    Ok(())
}

#[test]
fn exact_u64_maximum_offset_is_accepted_and_remains_a_clean_empty_boundary() -> TestResult {
    let fixture = Fixture::new("A", 1)?;
    let cursor = fixture.cursor(LocalLogFrameLimits::default())?;
    let (owner, _, limits) = cursor.into_parts();
    let frame_bytes = u64::try_from(fixture.frame.len())?;
    let frame_start = u64::MAX
        .checked_sub(frame_bytes)
        .ok_or_else(|| test_error("test frame exceeded the durable offset domain"))?;
    let cursor = LocalLogTailCursor::from_trusted_parts(owner, frame_start, limits);

    let accepted = cursor.try_observe_frame(frame_start, &fixture.frame)?;
    assert_eq!(accepted.status().accepted_range(), Some((frame_start, u64::MAX)));
    assert_eq!(
        accepted.status().observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        })
    );
    assert_eq!(accepted.cursor().accepted_byte_offset(), u64::MAX);
    let (cursor, _) = accepted.into_parts();
    let end = cursor.try_observe_frame(u64::MAX, &[])?;
    assert!(end.status().is_end_of_input());
    assert_eq!(end.cursor().accepted_byte_offset(), u64::MAX);
    let (cursor, _) = end.into_parts();
    let overflow = failure(cursor.try_observe_frame(u64::MAX, &fixture.frame))?;
    assert_eq!(overflow.code(), LocalLogTailErrorCode::AcceptedOffsetOverflow);
    assert_eq!(overflow.cursor().accepted_byte_offset(), u64::MAX);
    assert_eq!(overflow.cursor().owner().observation_count(), 1);
    assert!(overflow.rejected_entry().is_none());
    Ok(())
}

#[test]
fn nonzero_offset_admission_failure_retains_the_accepted_prefix_and_retries_identically()
-> TestResult {
    let first = Fixture::new("A", 1)?;
    let second = Fixture::new("B", 2)?;
    let frame_limits = LocalLogFrameLimits::new(u64::MAX);
    let first_end = u64::try_from(first.frame.len())?;
    let cases = [
        (LocalLogRecoveryLimits::new(1, 2, 2), LocalLogRecoveryErrorCode::ObservationLimit),
        (LocalLogRecoveryLimits::new(2, 1, 2), LocalLogRecoveryErrorCode::UniqueEventLimit),
        (LocalLogRecoveryLimits::new(2, 2, 1), LocalLogRecoveryErrorCode::AppliedOperationLimit),
    ];

    for (recovery_limits, expected_error_code) in cases {
        let cursor = first.cursor_with_recovery(recovery_limits, frame_limits)?;
        let accepted = cursor.try_observe_frame(0, &first.frame)?;
        let (cursor, _) = accepted.into_parts();
        let session_before = SessionCheckpointJsonCodec::new(first.context.clone())
            .encode(cursor.owner().session())?;
        assert_eq!(cursor.accepted_byte_offset(), first_end);
        assert_eq!(cursor.owner().observation_count(), 1);

        let rejected = failure(cursor.try_observe_frame(first_end, &second.frame))?;
        assert_eq!(rejected.code(), LocalLogTailErrorCode::Admission);
        assert_eq!(
            rejected.error().admission_error().map(LocalLogRecoveryError::code),
            Some(expected_error_code)
        );
        assert!(matches!(
            (expected_error_code, rejected.error().admission_error()),
            (
                LocalLogRecoveryErrorCode::ObservationLimit,
                Some(LocalLogRecoveryError::ObservationLimit { actual: 2, maximum: 1 })
            ) | (
                LocalLogRecoveryErrorCode::UniqueEventLimit,
                Some(LocalLogRecoveryError::UniqueEventLimit {
                    delivery_index: 1,
                    attempted: 2,
                    maximum: 1,
                })
            ) | (
                LocalLogRecoveryErrorCode::AppliedOperationLimit,
                Some(LocalLogRecoveryError::AppliedOperationLimit {
                    delivery_index: 1,
                    attempted: 2,
                    maximum: 1,
                })
            )
        ));
        assert_eq!(rejected.cursor().accepted_byte_offset(), first_end);
        assert_eq!(rejected.cursor().frame_limits(), frame_limits);
        assert_eq!(
            (
                rejected.cursor().owner().observation_count(),
                rejected.cursor().owner().unique_event_count(),
                rejected.cursor().owner().exact_duplicate_count(),
                rejected.cursor().owner().applied_operation_count(),
            ),
            (1, 1, 0, 1)
        );
        assert_eq!(
            SessionCheckpointJsonCodec::new(first.context.clone())
                .encode(rejected.cursor().owner().session())?,
            session_before
        );
        assert_eq!(rejected.rejected_entry().map(|entry| entry.sequence().get()), Some(2));

        let (cursor, rejected_entry, error) = rejected.into_parts();
        assert_eq!(rejected_entry.map(|entry| entry.sequence().get()), Some(2));
        assert_eq!(error.code(), LocalLogTailErrorCode::Admission);
        let retry = failure(cursor.try_observe_frame(first_end, &second.frame))?;
        assert_eq!(
            retry.error().admission_error().map(LocalLogRecoveryError::code),
            Some(expected_error_code)
        );
        assert_eq!(retry.cursor().accepted_byte_offset(), first_end);
        assert_eq!(retry.cursor().frame_limits(), frame_limits);
        assert_eq!(
            (
                retry.cursor().owner().observation_count(),
                retry.cursor().owner().unique_event_count(),
                retry.cursor().owner().exact_duplicate_count(),
                retry.cursor().owner().applied_operation_count(),
            ),
            (1, 1, 0, 1)
        );
        assert_eq!(retry.rejected_entry().map(|entry| entry.sequence().get()), Some(2));
        assert_eq!(
            SessionCheckpointJsonCodec::new(first.context.clone())
                .encode(retry.cursor().owner().session())?,
            session_before
        );
    }
    Ok(())
}

#[test]
fn cursor_scanning_uses_the_owner_context_json_ceiling() -> TestResult {
    let producer_context = EditorContext::default();
    let producer_initial = state(&producer_context, "", "tail-cursor-context-limit")?;
    let session_id = LocalSessionId::try_new("session:tail-cursor-context-limit")?;
    let checkpoint_log = LocalLogId::try_new("log:tail-cursor-context-limit:g0")?;
    let active_log = LocalLogId::try_new("log:tail-cursor-context-limit:g1")?;
    let observation = entry(
        &session_id,
        &active_log,
        1,
        "request:tail-context-limit",
        LocalLogEvent::clear_history(),
    )?;
    let frame =
        frame_codec(producer_context.clone(), &session_id, &active_log).encode(&observation)?;
    let payload_bytes = frame
        .len()
        .checked_sub(LOCAL_LOG_FRAME_HEADER_BYTES)
        .ok_or_else(|| test_error("encoded frame was shorter than its header"))?;
    let context_maximum = payload_bytes
        .checked_sub(1)
        .ok_or_else(|| test_error("control-event payload was unexpectedly empty"))?;
    let limited_context = EditorContext::new(
        producer_context.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(context_maximum),
    );
    let limited_initial = EditorState::try_new(
        &limited_context,
        LineageId::try_new("tail-cursor-context-limit")?,
        producer_initial.document().clone(),
        None,
        None,
    )?;
    let cursor = empty_anchor(limited_initial, &session_id, &checkpoint_log, &active_log, 1)?
        .begin_successor_tail(
            LocalLogRecoveryLimits::new(1, 1, 0),
            LocalLogFrameLimits::new(u64::MAX),
        );

    let rejected = failure(cursor.try_observe_frame(0, &frame))?;
    assert_eq!(rejected.code(), LocalLogTailErrorCode::FrameScan);
    assert!(matches!(
        rejected.error().frame_scan_error(),
        Some(LocalLogFrameCodecError::PayloadTooLarge { actual, maximum })
            if *actual == u64::try_from(payload_bytes)?
                && *maximum == u64::try_from(context_maximum)?
    ));
    assert_eq!(rejected.cursor().frame_limits(), LocalLogFrameLimits::new(u64::MAX));
    assert_eq!(rejected.cursor().accepted_byte_offset(), 0);
    assert_eq!(rejected.cursor().owner().observation_count(), 0);
    Ok(())
}
