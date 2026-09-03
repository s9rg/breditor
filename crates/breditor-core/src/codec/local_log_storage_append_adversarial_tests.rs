//! Adversarial contracts for token-bound speculative storage-append planning.
//!
//! The public plan must not expose its retained frame bytes:
//!
//! ```compile_fail
//! fn expose(plan: &breditor_core::codec::LocalLogStorageAppendPlan) -> &[u8] {
//!     plan.frame()
//! }
//! ```
//!
//! Its private constructor cannot be used to forge a plan:
//!
//! ```compile_fail
//! fn forge(
//!     token: breditor_core::codec::LocalLogStorageMutationToken,
//!     cursor: breditor_core::codec::LocalLogTailCursor,
//!     frame: std::sync::Arc<[u8]>,
//!     start: breditor_core::local_log::LocalLogStorageChunkStart,
//!     observation: breditor_core::local_log::LocalLogObservationOutcome,
//! ) {
//!     let _ = breditor_core::codec::LocalLogStorageAppendPlan::new(
//!         token,
//!         cursor,
//!         frame,
//!         start,
//!         1,
//!         observation,
//!     );
//! }
//! ```

use std::error::Error;

use crate::{
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES, LocalLogCompactionLimits, LocalLogEntry,
        LocalLogEvent, LocalLogId, LocalLogObservationOutcome, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogSequence, LocalLogStorageChunkStart,
        LocalLogStorageChunkStartParseError, LocalLogStorageChunkStartParseErrorCode,
        LocalLogStorageFenceId, LocalLogStorageWriterEpoch, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    session::EditorSession,
    transaction::{HistoryIntent, Transaction, TransactionMetadata},
};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogFrameErrorCode, LocalLogFrameLimits,
    LocalLogStorageAppendPlan, LocalLogStorageAppendPreparationError,
    LocalLogStorageAppendPreparationErrorCode, LocalLogStorageMutationFenceBinding,
    LocalLogStorageMutationToken, LocalLogStorageSelectionKind,
    LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
    LocalLogStorageWriterFenceAcquisitionTerminalOutcome, LocalLogTailCursor,
    LocalLogTailErrorCode, local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const CURRENT_WRITER_FENCE: &str = "fence:append-current";
const ACQUIRED_WRITER_FENCE: &str = "fence:append-acquired";
const PRIVATE_FRAME_PAYLOAD: &str = "APPEND-PRIVATE-PAYLOAD-SENTINEL";

fn acquire_token(fixture: &SelectedRotationFixture) -> TestResult<LocalLogStorageMutationToken> {
    let binding = LocalLogStorageMutationFenceBinding::from_selected(
        &fixture.selected,
        LocalLogStorageWriterEpoch::try_new(41)?,
        LocalLogStorageFenceId::try_new(CURRENT_WRITER_FENCE)?,
    );
    let mut owner = binding
        .try_prepare_writer_fence_acquisition(LocalLogStorageFenceId::try_new(
            ACQUIRED_WRITER_FENCE,
        )?)?
        .begin_acquisition();
    let request_id = owner.adapter_request()?.request_id().clone();
    let completed = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
        &request_id,
    );
    let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(token) =
        owner.observe_terminal_attestation(completed)?
    else {
        return Err("matching acquisition completion did not issue a token".into());
    };
    Ok(token)
}

fn selected_cursor(
    fixture: &SelectedRotationFixture,
    limits: LocalLogRecoveryLimits,
) -> TestResult<LocalLogTailCursor> {
    let checkpoint_binding = crate::local_log::LocalLogCheckpointBinding::try_new(
        fixture.selected.session_id().clone(),
        fixture.selected.checkpoint_log_id().clone(),
        fixture.selected.active_log_id().clone(),
    )?;
    let anchor = LocalLogCheckpointJsonCodec::new(fixture.context.clone(), checkpoint_binding)
        .decode(fixture.selected.checkpoint_json())?;
    Ok(anchor.begin_successor_tail(limits, fixture.selected.active_frame().limits()))
}

fn independent_cursor(
    fixture: &SelectedRotationFixture,
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    active_log_id: LocalLogId,
    frame_limits: LocalLogFrameLimits,
    accepted_byte_offset: u64,
) -> TestResult<LocalLogTailCursor> {
    let selected = selected_cursor(fixture, LocalLogRecoveryLimits::default())?;
    let initial = selected.owner().session().state().clone();
    let anchor = LocalLogRecovery::new(session_id, checkpoint_log_id)
        .recover(EditorSession::new(initial), Vec::new())?
        .try_into_checkpoint_anchor(active_log_id, LocalLogCompactionLimits::default())?;
    let fresh = anchor.begin_successor_tail(LocalLogRecoveryLimits::default(), frame_limits);
    let (owner, _, retained_limits) = fresh.into_parts();
    Ok(LocalLogTailCursor::from_trusted_parts(owner, accepted_byte_offset, retained_limits))
}

fn insertion_entry(
    cursor: &LocalLogTailCursor,
    replay_id: &str,
    text: impl Into<String>,
) -> TestResult<LocalLogEntry> {
    let state = cursor.owner().session().state();
    let offset = TextOffset::ZERO;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    let transaction = Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let commit = transaction
        .apply(state.context(), state)?
        .into_commit()
        .ok_or("append test insertion was unexpectedly unchanged")?;
    let sequence = cursor.owner().next_sequence().ok_or("append test sequence exhausted")?;
    Ok(LocalLogEntry::new(
        cursor.owner().session_id().clone(),
        cursor.owner().active_log_id().clone(),
        sequence,
        ReplayId::try_new(replay_id)?,
        LocalLogEvent::commit(commit),
    ))
}

fn assert_failure_retains_inputs(
    failure: &super::LocalLogStorageAppendPreparationFailure,
    request_id: &crate::local_log::LocalLogStorageWriterFenceAcquisitionRequestId,
    expected_current_json: *const u8,
    expected_predecessor_json: Option<*const u8>,
    expected_offset: u64,
    expected_observations: u64,
) {
    assert_eq!(failure.token().request_id(), request_id);
    assert_eq!(failure.token().binding().current_selection_json().as_ptr(), expected_current_json);
    assert_eq!(
        failure.token().binding().predecessor_selection_json().map(str::as_ptr),
        expected_predecessor_json
    );
    assert_eq!(failure.cursor().accepted_byte_offset(), expected_offset);
    assert_eq!(failure.cursor().owner().observation_count(), expected_observations);
}

#[test]
fn root_and_rotation_prepare_one_exact_adjacent_redacted_frame() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let token = acquire_token(&fixture)?;
        let request_id = token.request_id().clone();
        let current_json = token.binding().current_selection_json().as_ptr();
        let predecessor_json = token.binding().predecessor_selection_json().map(str::as_ptr);
        let cursor = selected_cursor(&fixture, LocalLogRecoveryLimits::default())?;
        let entry = insertion_entry(&cursor, "replay:append:first", PRIVATE_FRAME_PAYLOAD)?;
        let expected_frame = super::LocalLogFrameCodec::new(
            fixture.context.clone(),
            super::LocalLogFrameBinding::new(
                fixture.selected.session_id().clone(),
                fixture.selected.active_log_id().clone(),
            ),
        )
        .with_limits(fixture.selected.active_frame().limits())
        .encode(&entry)?;
        assert!(String::from_utf8_lossy(&expected_frame).contains(PRIVATE_FRAME_PAYLOAD));

        let plan = token.try_prepare_append(cursor, &entry)?;

        assert_eq!(plan.chunk_start(), LocalLogStorageChunkStart::ZERO);
        assert_eq!(plan.chunk_start().get(), 0);
        assert_eq!(plan.frame_bytes(), expected_frame.len());
        assert_eq!(plan.frame_end(), u64::try_from(plan.frame_bytes())?);
        assert_eq!(plan.speculative_cursor().accepted_byte_offset(), plan.frame_end());
        assert_eq!(plan.speculative_cursor().owner().observation_count(), 1);
        assert_eq!(plan.speculative_cursor().owner().unique_event_count(), 1);
        assert_eq!(
            plan.observation_outcome(),
            LocalLogObservationOutcome::Applied {
                delivery_index: 0,
                sequence: LocalLogSequence::FIRST,
            }
        );
        assert_eq!(plan.token().request_id(), &request_id);
        assert_eq!(plan.expected_binding().current_selection_json().as_ptr(), current_json);
        assert_eq!(
            plan.expected_binding().predecessor_selection_json().map(str::as_ptr),
            predecessor_json
        );
        let debug = format!("{plan:?}");
        assert!(debug.contains("LocalLogStorageAppendPlan"));
        assert!(debug.contains("frame_bytes"));
        assert!(!debug.contains(PRIVATE_FRAME_PAYLOAD));
        assert!(!debug.contains(fixture.selected.checkpoint_json()));
    }
    Ok(())
}

#[test]
fn mismatch_precedence_is_session_checkpoint_active_then_frame_policy() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let expected_session = fixture.selected.session_id().clone();
    let expected_checkpoint = fixture.selected.checkpoint_log_id().clone();
    let expected_active = fixture.selected.active_log_id().clone();
    let expected_frame = fixture.selected.active_frame().limits();
    let wrong_session = LocalSessionId::try_new("session:append-wrong")?;
    let wrong_checkpoint = LocalLogId::try_new("log:append-wrong-checkpoint")?;
    let wrong_active = LocalLogId::try_new("log:append-wrong-active")?;
    let wrong_frame = LocalLogFrameLimits::new(expected_frame.max_payload_bytes() - 1);

    let cases = [
        (
            independent_cursor(
                &fixture,
                wrong_session,
                wrong_checkpoint.clone(),
                wrong_active.clone(),
                wrong_frame,
                0,
            )?,
            LocalLogStorageAppendPreparationErrorCode::SessionMismatch,
        ),
        (
            independent_cursor(
                &fixture,
                expected_session.clone(),
                wrong_checkpoint,
                wrong_active.clone(),
                wrong_frame,
                0,
            )?,
            LocalLogStorageAppendPreparationErrorCode::CheckpointLogMismatch,
        ),
        (
            independent_cursor(
                &fixture,
                expected_session.clone(),
                expected_checkpoint.clone(),
                wrong_active,
                wrong_frame,
                0,
            )?,
            LocalLogStorageAppendPreparationErrorCode::ActiveLogMismatch,
        ),
        (
            independent_cursor(
                &fixture,
                expected_session,
                expected_checkpoint,
                expected_active,
                wrong_frame,
                0,
            )?,
            LocalLogStorageAppendPreparationErrorCode::FramePolicyMismatch,
        ),
    ];

    for (cursor, expected_code) in cases {
        let token = acquire_token(&fixture)?;
        let request_id = token.request_id().clone();
        let current_json = token.binding().current_selection_json().as_ptr();
        let predecessor_json = token.binding().predecessor_selection_json().map(str::as_ptr);
        let entry = insertion_entry(&cursor, "replay:append:mismatch", "M")?;
        let failure = token
            .try_prepare_append(cursor, &entry)
            .err()
            .ok_or("mismatched token and cursor unexpectedly prepared")?;

        assert_eq!(failure.code(), expected_code);
        assert_failure_retains_inputs(&failure, &request_id, current_json, predecessor_json, 0, 0);
        let (token, cursor, error) = failure.into_parts();
        assert_eq!(error.code(), expected_code);
        assert_eq!(token.request_id(), &request_id);
        assert_eq!(cursor.accepted_byte_offset(), 0);
    }
    Ok(())
}

#[test]
fn frame_encode_failure_returns_the_exact_token_and_unchanged_cursor() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let token = acquire_token(&fixture)?;
    let request_id = token.request_id().clone();
    let current_json = token.binding().current_selection_json().as_ptr();
    let predecessor_json = token.binding().predecessor_selection_json().map(str::as_ptr);
    let cursor = selected_cursor(&fixture, LocalLogRecoveryLimits::default())?;
    let state_before = cursor.owner().session().state().clone();
    let entry = insertion_entry(&cursor, "replay:append:oversized", "x".repeat(6_000))?;

    let failure = token
        .try_prepare_append(cursor, &entry)
        .err()
        .ok_or("oversized append frame unexpectedly prepared")?;
    assert_eq!(failure.code(), LocalLogStorageAppendPreparationErrorCode::FrameEncode);
    assert_eq!(failure.error().frame_error_code(), Some(LocalLogFrameErrorCode::PayloadTooLarge));
    assert_eq!(failure.error().tail_error_code(), None);
    assert_failure_retains_inputs(&failure, &request_id, current_json, predecessor_json, 0, 0);
    assert_eq!(failure.cursor().owner().session().state(), &state_before);
    let private_run = "x".repeat(128);
    assert!(!format!("{failure:?} {failure}").contains(private_run.as_str()));
    Ok(())
}

#[test]
fn admission_and_offset_failures_return_exact_unchanged_inputs() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;

    let token = acquire_token(&fixture)?;
    let request_id = token.request_id().clone();
    let current_json = token.binding().current_selection_json().as_ptr();
    let cursor = selected_cursor(&fixture, LocalLogRecoveryLimits::default())?;
    let wrong_sequence = LocalLogEntry::new(
        cursor.owner().session_id().clone(),
        cursor.owner().active_log_id().clone(),
        LocalLogSequence::try_new(2)?,
        ReplayId::try_new("replay:append:gap")?,
        LocalLogEvent::clear_history(),
    );
    let failure = token
        .try_prepare_append(cursor, &wrong_sequence)
        .err()
        .ok_or("nonadjacent sequence unexpectedly prepared")?;
    assert_eq!(failure.code(), LocalLogStorageAppendPreparationErrorCode::TailTransition);
    assert_eq!(failure.error().frame_error_code(), None);
    assert_eq!(failure.error().tail_error_code(), Some(LocalLogTailErrorCode::Admission));
    assert_failure_retains_inputs(&failure, &request_id, current_json, None, 0, 0);
    let (token, cursor) = failure.into_inputs();
    assert_eq!(token.request_id(), &request_id);
    assert_eq!(cursor.owner().next_sequence(), Some(LocalLogSequence::FIRST));

    let token = acquire_token(&fixture)?;
    let request_id = token.request_id().clone();
    let current_json = token.binding().current_selection_json().as_ptr();
    let cursor = independent_cursor(
        &fixture,
        fixture.selected.session_id().clone(),
        fixture.selected.checkpoint_log_id().clone(),
        fixture.selected.active_log_id().clone(),
        fixture.selected.active_frame().limits(),
        u64::MAX,
    )?;
    let entry = insertion_entry(&cursor, "replay:append:max-offset", "Z")?;
    let failure = token
        .try_prepare_append(cursor, &entry)
        .err()
        .ok_or("append beyond the maximum byte offset unexpectedly prepared")?;
    assert_eq!(failure.code(), LocalLogStorageAppendPreparationErrorCode::TailTransition);
    assert_eq!(
        failure.error().tail_error_code(),
        Some(LocalLogTailErrorCode::AcceptedOffsetOverflow)
    );
    assert_failure_retains_inputs(&failure, &request_id, current_json, None, u64::MAX, 0);
    Ok(())
}

#[test]
fn exact_duplicate_is_a_second_adjacent_physical_append_without_reapplication() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let cursor = selected_cursor(&fixture, LocalLogRecoveryLimits::default())?;
    let entry = insertion_entry(&cursor, "replay:append:duplicate", "D")?;
    let entry_json = super::LocalLogEntryJsonCodec::new(fixture.context.clone()).encode(&entry)?;
    let duplicate =
        super::LocalLogEntryJsonCodec::new(fixture.context.clone()).decode(&entry_json)?;
    let first_frame = super::LocalLogFrameCodec::new(
        fixture.context.clone(),
        super::LocalLogFrameBinding::new(
            fixture.selected.session_id().clone(),
            fixture.selected.active_log_id().clone(),
        ),
    )
    .with_limits(fixture.selected.active_frame().limits())
    .encode(&entry)?;
    let first = cursor.try_observe_frame(0, &first_frame)?;
    let (cursor, status) = first.into_parts();
    let first_end = status.accepted_range().ok_or("first append did not advance")?.1;
    let token = acquire_token(&fixture)?;

    let plan = token.try_prepare_append(cursor, &duplicate)?;

    assert_eq!(plan.chunk_start().get(), first_end);
    assert_eq!(
        plan.frame_end(),
        first_end
            .checked_add(u64::try_from(plan.frame_bytes())?)
            .ok_or("test frame end overflow")?
    );
    assert_eq!(
        plan.observation_outcome(),
        LocalLogObservationOutcome::ExactDuplicate {
            delivery_index: 1,
            first_delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        }
    );
    assert_eq!(plan.speculative_cursor().owner().observation_count(), 2);
    assert_eq!(plan.speculative_cursor().owner().unique_event_count(), 1);
    assert_eq!(plan.speculative_cursor().owner().exact_duplicate_count(), 1);
    Ok(())
}

#[test]
fn chunk_start_text_is_fixed_width_canonical_and_lexically_ordered() -> TestResult {
    let values = [0, 1, 9, 10, 999, u64::MAX - 1, u64::MAX];
    let rendered = values
        .into_iter()
        .map(|value| LocalLogStorageChunkStart::new(value).to_string())
        .collect::<Vec<_>>();
    assert!(rendered.iter().all(|value| {
        value.len() == LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES
            && value.bytes().all(|byte| byte.is_ascii_digit())
    }));
    assert!(rendered.windows(2).all(|pair| pair[0] < pair[1]));
    for (expected, text) in values.into_iter().zip(&rendered) {
        assert_eq!(text.parse::<LocalLogStorageChunkStart>()?.get(), expected);
        assert_eq!(LocalLogStorageChunkStart::try_from(text.clone())?.get(), expected);
    }

    for (text, expected_code) in [
        ("0", LocalLogStorageChunkStartParseErrorCode::InvalidLength),
        ("0000000000000000000x", LocalLogStorageChunkStartParseErrorCode::InvalidDigit),
        ("18446744073709551616", LocalLogStorageChunkStartParseErrorCode::Overflow),
    ] {
        let error = text
            .parse::<LocalLogStorageChunkStart>()
            .err()
            .ok_or("invalid chunk-start text unexpectedly parsed")?;
        assert_eq!(error.code(), expected_code);
        if text.len() == LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES {
            assert!(!format!("{error:?} {error}").contains(text));
        }
    }
    assert!(matches!(
        "0000000000000000000é".parse::<LocalLogStorageChunkStart>(),
        Err(LocalLogStorageChunkStartParseError::InvalidLength {
            actual_bytes: 21,
            expected_bytes: LOCAL_LOG_STORAGE_CHUNK_START_DECIMAL_BYTES,
        })
    ));
    Ok(())
}

#[test]
fn append_preparation_codes_and_chunk_parse_codes_are_stable() {
    for (code, spelling) in [
        (
            LocalLogStorageAppendPreparationErrorCode::SessionMismatch,
            "local_log_storage_append_preparation.session_mismatch",
        ),
        (
            LocalLogStorageAppendPreparationErrorCode::CheckpointLogMismatch,
            "local_log_storage_append_preparation.checkpoint_log_mismatch",
        ),
        (
            LocalLogStorageAppendPreparationErrorCode::ActiveLogMismatch,
            "local_log_storage_append_preparation.active_log_mismatch",
        ),
        (
            LocalLogStorageAppendPreparationErrorCode::FramePolicyMismatch,
            "local_log_storage_append_preparation.frame_policy_mismatch",
        ),
        (
            LocalLogStorageAppendPreparationErrorCode::FrameEncode,
            "local_log_storage_append_preparation.frame_encode",
        ),
        (
            LocalLogStorageAppendPreparationErrorCode::TailTransition,
            "local_log_storage_append_preparation.tail_transition",
        ),
    ] {
        assert_eq!(code.as_str(), spelling);
    }

    for (code, spelling) in [
        (
            LocalLogStorageChunkStartParseErrorCode::InvalidLength,
            "local_log_storage_chunk_start_parse.invalid_length",
        ),
        (
            LocalLogStorageChunkStartParseErrorCode::InvalidDigit,
            "local_log_storage_chunk_start_parse.invalid_digit",
        ),
        (
            LocalLogStorageChunkStartParseErrorCode::Overflow,
            "local_log_storage_chunk_start_parse.overflow",
        ),
    ] {
        assert_eq!(code.as_str(), spelling);
    }

    let errors = [
        (
            LocalLogStorageAppendPreparationError::SessionMismatch,
            LocalLogStorageAppendPreparationErrorCode::SessionMismatch,
        ),
        (
            LocalLogStorageAppendPreparationError::CheckpointLogMismatch,
            LocalLogStorageAppendPreparationErrorCode::CheckpointLogMismatch,
        ),
        (
            LocalLogStorageAppendPreparationError::ActiveLogMismatch,
            LocalLogStorageAppendPreparationErrorCode::ActiveLogMismatch,
        ),
        (
            LocalLogStorageAppendPreparationError::FramePolicyMismatch,
            LocalLogStorageAppendPreparationErrorCode::FramePolicyMismatch,
        ),
    ];
    for (error, expected_code) in errors {
        assert_eq!(error.code(), expected_code);
        assert_eq!(error.frame_error_code(), None);
        assert_eq!(error.tail_error_code(), None);
    }
}

// The two negative trait contracts live on the public production type so
// `cargo test --doc` executes them even though this adversarial module itself
// is compiled only under `cfg(test)`.
#[allow(dead_code)]
fn production_compile_fail_contracts_are_documented(_: &LocalLogStorageAppendPlan) {}
