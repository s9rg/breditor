//! Generated equivalence laws for framed active-tail cursor progress.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{LocalLogFrameLimits, LocalLogTailErrorCode},
    local_log::{LocalLogEvent, LocalLogId, LocalLogRecoveryLimits, LocalSessionId},
    session::EditorSession,
    state::EditorContext,
    transaction::HistoryIntent,
};
use proptest::{
    collection::vec,
    test_runner::{Config, TestCaseError},
};
use support::{
    local_log::{apply, entry, insertion, state},
    local_log_tail::{empty_anchor, frame_codec},
};

fn property_config() -> Config {
    Config { cases: 64, max_shrink_iters: 2_048, ..Config::default() }
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn fail(message: impl Into<String>) -> TestCaseError {
    TestCaseError::fail(message.into())
}

struct ExpectedFrame {
    frame_bytes: usize,
    sequence: u64,
    first_delivery_index: u64,
    duplicate: bool,
}

struct Trace {
    initial: breditor_core::state::EditorState,
    producer: EditorSession,
    session_id: LocalSessionId,
    checkpoint_log: LocalLogId,
    active_log: LocalLogId,
    bytes: Vec<u8>,
    frames: Vec<ExpectedFrame>,
    boundaries: Vec<usize>,
    unique_count: u64,
}

fn build_trace(insertions: &[char], duplicates: &[bool]) -> Result<Trace, TestCaseError> {
    let context = EditorContext::default();
    let initial = state(&context, "", "tail-cursor-property").map_err(test_failure)?;
    let session_id =
        LocalSessionId::try_new("session:tail-cursor-property").map_err(test_failure)?;
    let checkpoint_log =
        LocalLogId::try_new("log:tail-cursor-property:g0").map_err(test_failure)?;
    let active_log = LocalLogId::try_new("log:tail-cursor-property:g1").map_err(test_failure)?;
    let encoder = frame_codec(context.clone(), &session_id, &active_log);
    let mut producer = EditorSession::new(initial.clone());
    let mut bytes = Vec::new();
    let mut frames = Vec::new();
    let mut boundaries = Vec::new();
    let mut delivery_index = 0u64;

    for (index, character) in insertions.iter().copied().enumerate() {
        let offset = u64::try_from(index).map_err(test_failure)?;
        let transaction =
            insertion(producer.state(), offset, &character.to_string(), HistoryIntent::Record)
                .map_err(test_failure)?;
        let commit = apply(&mut producer, &transaction).map_err(test_failure)?;
        let sequence = offset.checked_add(1).ok_or_else(|| fail("sequence overflowed"))?;
        let observation = entry(
            &session_id,
            &active_log,
            sequence,
            &format!("request:tail-property:{index}"),
            LocalLogEvent::commit(commit),
        )
        .map_err(test_failure)?;
        let frame = encoder.encode(&observation).map_err(test_failure)?;
        let first_delivery_index = delivery_index;
        bytes.extend_from_slice(&frame);
        frames.push(ExpectedFrame {
            frame_bytes: frame.len(),
            sequence,
            first_delivery_index,
            duplicate: false,
        });
        boundaries.push(bytes.len());
        delivery_index =
            delivery_index.checked_add(1).ok_or_else(|| fail("delivery index overflowed"))?;

        if duplicates.get(index).copied().unwrap_or(false) {
            bytes.extend_from_slice(&frame);
            frames.push(ExpectedFrame {
                frame_bytes: frame.len(),
                sequence,
                first_delivery_index,
                duplicate: true,
            });
            boundaries.push(bytes.len());
            delivery_index = delivery_index
                .checked_add(1)
                .ok_or_else(|| fail("duplicate delivery index overflowed"))?;
        }
    }
    let unique_count = u64::try_from(insertions.len()).map_err(test_failure)?;
    Ok(Trace {
        initial,
        producer,
        session_id,
        checkpoint_log,
        active_log,
        bytes,
        frames,
        boundaries,
        unique_count,
    })
}

fn cursor(trace: &Trace) -> Result<breditor_core::codec::LocalLogTailCursor, TestCaseError> {
    let physical = u64::try_from(trace.frames.len()).map_err(test_failure)?;
    Ok(empty_anchor(
        trace.initial.clone(),
        &trace.session_id,
        &trace.checkpoint_log,
        &trace.active_log,
        trace.unique_count,
    )
    .map_err(test_failure)?
    .begin_successor_tail(
        LocalLogRecoveryLimits::new(physical, trace.unique_count, trace.unique_count),
        LocalLogFrameLimits::default(),
    ))
}

fn assert_complete_trace(trace: &Trace) -> Result<(), TestCaseError> {
    let mut cursor = cursor(trace)?;
    let mut consumed = 0usize;
    for (index, expected) in trace.frames.iter().enumerate() {
        let origin = u64::try_from(consumed).map_err(test_failure)?;
        let step =
            cursor.try_observe_frame(origin, &trace.bytes[consumed..]).map_err(test_failure)?;
        let status = step.status();
        if status.frame_bytes() != Some(expected.frame_bytes) {
            return Err(fail("cursor changed a generated frame boundary"));
        }
        let outcome = status
            .observation_outcome()
            .ok_or_else(|| fail("complete generated frame was not accepted"))?;
        if outcome.delivery_index() != u64::try_from(index).map_err(test_failure)?
            || outcome.sequence().get() != expected.sequence
            || outcome.was_applied() == expected.duplicate
            || outcome.first_delivery_index()
                != expected.duplicate.then_some(expected.first_delivery_index)
        {
            return Err(fail("generated observation outcome changed"));
        }
        consumed = consumed
            .checked_add(expected.frame_bytes)
            .ok_or_else(|| fail("generated consumed bytes overflowed"))?;
        let (next, _) = step.into_parts();
        cursor = next;
    }
    let physical_count = u64::try_from(trace.frames.len()).map_err(test_failure)?;
    let duplicate_count = physical_count
        .checked_sub(trace.unique_count)
        .ok_or_else(|| fail("generated duplicate count underflowed"))?;
    if consumed != trace.bytes.len()
        || cursor.accepted_byte_offset() != u64::try_from(consumed).map_err(test_failure)?
        || cursor.owner().observation_count() != physical_count
        || cursor.owner().unique_event_count() != trace.unique_count
        || cursor.owner().exact_duplicate_count() != duplicate_count
    {
        return Err(fail("complete generated cursor accounting changed"));
    }
    if cursor.owner().session().state() != trace.producer.state() {
        return Err(fail("complete generated cursor state diverged from its producer"));
    }
    let end = cursor
        .try_observe_frame(u64::try_from(consumed).map_err(test_failure)?, &[])
        .map_err(test_failure)?;
    if !end.status().is_end_of_input() {
        return Err(fail("complete generated tail did not end cleanly"));
    }
    Ok(())
}

fn assert_cut_trace(trace: &Trace, cut_seed: u16) -> Result<(), TestCaseError> {
    let divisor = trace.bytes.len().checked_add(1).ok_or_else(|| fail("tail length overflowed"))?;
    let cut = usize::from(cut_seed) % divisor;
    let expected_boundary = trace
        .boundaries
        .iter()
        .copied()
        .take_while(|boundary| *boundary <= cut)
        .last()
        .unwrap_or(0);
    let mut cursor = cursor(trace)?;
    let mut consumed = 0usize;
    loop {
        let step = cursor
            .try_observe_frame(
                u64::try_from(consumed).map_err(test_failure)?,
                &trace.bytes[consumed..cut],
            )
            .map_err(test_failure)?;
        let status = step.status();
        let (next, _) = step.into_parts();
        cursor = next;
        if let Some(frame_bytes) = status.frame_bytes() {
            consumed = consumed
                .checked_add(frame_bytes)
                .ok_or_else(|| fail("cut-trace consumed bytes overflowed"))?;
            continue;
        }
        if consumed == cut {
            if !status.is_end_of_input() {
                return Err(fail("exact generated boundary was not clean end"));
            }
        } else if status.truncation().is_none() {
            return Err(fail("partial generated frame was not truncated"));
        }
        break;
    }
    if consumed != expected_boundary
        || cursor.accepted_byte_offset()
            != u64::try_from(expected_boundary).map_err(test_failure)?
    {
        return Err(fail("cut generated tail advanced beyond its complete prefix"));
    }
    Ok(())
}

fn assert_arbitrary_input_is_atomic(
    bytes: &[u8],
    wrong_origin: bool,
    origin_seed: u64,
) -> Result<(), TestCaseError> {
    let trace = build_trace(&['a'], &[])?;
    let cursor = cursor(&trace)?;
    let origin = if wrong_origin { origin_seed | 1 } else { 0 };
    match cursor.try_observe_frame(origin, bytes) {
        Err(failure) => {
            if wrong_origin && failure.code() != LocalLogTailErrorCode::InputOriginMismatch {
                return Err(fail("wrong arbitrary origin did not take precedence"));
            }
            if failure.cursor().accepted_byte_offset() != 0
                || failure.cursor().owner().observation_count() != 0
            {
                return Err(fail("arbitrary rejected input changed cursor progress"));
            }
            let entry_expected = failure.code() == LocalLogTailErrorCode::Admission;
            if failure.rejected_entry().is_some() != entry_expected {
                return Err(fail("arbitrary failure retained an entry at the wrong layer"));
            }
        }
        Ok(step) => {
            if wrong_origin {
                return Err(fail("wrong arbitrary origin unexpectedly produced a step"));
            }
            let status = step.status();
            if let Some(frame_bytes) = status.frame_bytes() {
                let frame_end = u64::try_from(frame_bytes).map_err(test_failure)?;
                if status.accepted_range() != Some((0, frame_end))
                    || step.cursor().accepted_byte_offset() != frame_end
                    || step.cursor().owner().observation_count() != 1
                {
                    return Err(fail("arbitrary accepted frame broke joint progress"));
                }
            } else if step.cursor().accepted_byte_offset() != 0
                || step.cursor().owner().observation_count() != 0
            {
                return Err(fail("arbitrary clean-end or truncation advanced progress"));
            }
        }
    }
    Ok(())
}

fn assert_single_byte_corruption_is_rejected(
    index_seed: usize,
    mask: u8,
) -> Result<(), TestCaseError> {
    let trace = build_trace(&['a'], &[])?;
    let frame_end =
        *trace.boundaries.first().ok_or_else(|| fail("generated corruption trace had no frame"))?;
    let mut corrupted = trace.bytes[..frame_end].to_vec();
    let index = index_seed % corrupted.len();
    corrupted[index] ^= mask.max(1);

    let failure = cursor(&trace)?
        .try_observe_frame(0, &corrupted)
        .err()
        .ok_or_else(|| fail("single-byte frame corruption was accepted"))?;
    if failure.code() != LocalLogTailErrorCode::FrameScan
        || failure.cursor().accepted_byte_offset() != 0
        || failure.cursor().owner().observation_count() != 0
        || failure.rejected_entry().is_some()
    {
        return Err(fail("single-byte corruption did not preserve the fresh cursor"));
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn generated_sequential_and_duplicate_frames_match_direct_authoring_at_every_cut(
        insertions in vec(proptest::char::range('a', 'z'), 1..6),
        duplicates in vec(proptest::bool::ANY, 0..6),
        cut_seed in proptest::prelude::any::<u16>(),
    ) {
        let trace = build_trace(&insertions, &duplicates)?;
        assert_complete_trace(&trace)?;
        assert_cut_trace(&trace, cut_seed)?;
    }

    #[test]
    fn arbitrary_bytes_and_caller_origins_never_break_cursor_atomicity(
        bytes in vec(proptest::prelude::any::<u8>(), 0..1_024),
        wrong_origin in proptest::prelude::any::<bool>(),
        origin_seed in proptest::prelude::any::<u64>(),
    ) {
        assert_arbitrary_input_is_atomic(&bytes, wrong_origin, origin_seed)?;
    }

    #[test]
    fn every_generated_single_byte_corruption_fails_without_progress(
        index_seed in proptest::prelude::any::<usize>(),
        mask in 1u8..=u8::MAX,
    ) {
        assert_single_byte_corruption_is_rejected(index_seed, mask)?;
    }
}
