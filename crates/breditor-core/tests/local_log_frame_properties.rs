//! Generated framing, concatenation, and arbitrary-input laws.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{
        LOCAL_LOG_FRAME_HEADER_BYTES, LOCAL_LOG_FRAME_MAGIC, LocalLogFrameBinding,
        LocalLogFrameCodec,
    },
    local_log::{LocalLogEvent, LocalLogEventKind, LocalLogId, LocalSessionId},
    state::EditorContext,
};
use proptest::{
    collection::vec,
    test_runner::{Config, TestCaseError},
};
use support::local_log::entry;

const CRC32C_REVERSED_POLYNOMIAL: u32 = 0x82F6_3B78;

fn crc32c(bytes: &[u8]) -> u32 {
    let mut state = u32::MAX;
    for byte in bytes {
        let mut value = state ^ u32::from(*byte);
        for _ in 0..8 {
            value =
                if value & 1 == 0 { value >> 1 } else { (value >> 1) ^ CRC32C_REVERSED_POLYNOMIAL };
        }
        state = value;
    }
    !state
}

fn framed_payload(payload: &[u8]) -> Result<Vec<u8>, TestCaseError> {
    let mut frame = vec![0; LOCAL_LOG_FRAME_HEADER_BYTES];
    frame[..LOCAL_LOG_FRAME_MAGIC.len()].copy_from_slice(&LOCAL_LOG_FRAME_MAGIC);
    frame[8..10].copy_from_slice(&1u16.to_be_bytes());
    frame[12..20]
        .copy_from_slice(&u64::try_from(payload.len()).map_err(test_failure)?.to_be_bytes());
    frame[20..24].copy_from_slice(&crc32c(payload).to_be_bytes());
    let header_checksum = crc32c(&frame[..24]);
    frame[24..28].copy_from_slice(&header_checksum.to_be_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}

fn property_config() -> Config {
    Config { cases: 96, max_shrink_iters: 2_048, ..Config::default() }
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn fail(message: impl Into<String>) -> TestCaseError {
    TestCaseError::fail(message.into())
}

fn fixture() -> Result<(LocalLogFrameCodec, LocalSessionId, LocalLogId), TestCaseError> {
    let session_id = LocalSessionId::try_new("session:frame-property").map_err(test_failure)?;
    let log_id = LocalLogId::try_new("log:frame-property:g1").map_err(test_failure)?;
    let codec = LocalLogFrameCodec::new(
        EditorContext::default(),
        LocalLogFrameBinding::new(session_id.clone(), log_id.clone()),
    );
    Ok((codec, session_id, log_id))
}

fn encoded_tail(
    kinds: &[bool],
) -> Result<(LocalLogFrameCodec, Vec<u8>, Vec<usize>), TestCaseError> {
    let (codec, session_id, log_id) = fixture()?;
    let mut tail = Vec::new();
    let mut boundaries = Vec::with_capacity(kinds.len());
    for (index, close) in kinds.iter().copied().enumerate() {
        let sequence = u64::try_from(index)
            .map_err(test_failure)?
            .checked_add(1)
            .ok_or_else(|| fail("generated sequence overflowed"))?;
        let event = if close {
            LocalLogEvent::close_history_group()
        } else {
            LocalLogEvent::clear_history()
        };
        let observation = entry(
            &session_id,
            &log_id,
            sequence,
            &format!("request:frame-property:{index}"),
            event,
        )
        .map_err(test_failure)?;
        tail.extend_from_slice(&codec.encode(&observation).map_err(test_failure)?);
        boundaries.push(tail.len());
    }
    Ok((codec, tail, boundaries))
}

fn assert_complete_tail(kinds: &[bool]) -> Result<(), TestCaseError> {
    let (codec, tail, boundaries) = encoded_tail(kinds)?;
    let mut remaining = tail.as_slice();
    let mut consumed_total = 0usize;
    for (index, close) in kinds.iter().copied().enumerate() {
        let frame = codec
            .scan(remaining)
            .map_err(test_failure)?
            .into_frame()
            .ok_or_else(|| fail("generated complete frame did not scan"))?;
        consumed_total = consumed_total
            .checked_add(frame.consumed_bytes())
            .ok_or_else(|| fail("generated consumed offset overflowed"))?;
        if boundaries.get(index).copied() != Some(consumed_total) {
            return Err(fail("scanner reported the wrong concatenated boundary"));
        }
        let decoded = codec.decode_frame(frame).map_err(test_failure)?;
        if decoded.sequence().get() != u64::try_from(index).map_err(test_failure)?.saturating_add(1)
        {
            return Err(fail("decoded generated sequence changed"));
        }
        let expected_kind = if close {
            LocalLogEventKind::CloseHistoryGroup
        } else {
            LocalLogEventKind::ClearHistory
        };
        if decoded.event_kind() != expected_kind {
            return Err(fail("decoded generated event kind changed"));
        }
        remaining = frame.remaining_bytes();
    }
    if !remaining.is_empty() || !codec.scan(remaining).map_err(test_failure)?.is_end_of_input() {
        return Err(fail("generated complete tail did not end at a clean boundary"));
    }
    Ok(())
}

fn assert_cut_tail(kinds: &[bool], cut_seed: u16) -> Result<(), TestCaseError> {
    let (codec, tail, _) = encoded_tail(kinds)?;
    let divisor = tail.len().checked_add(1).ok_or_else(|| fail("tail length overflowed"))?;
    let cut = usize::from(cut_seed) % divisor;
    let prefix = &tail[..cut];
    let mut accepted = 0;
    loop {
        let scan = codec.scan(&prefix[accepted..]).map_err(test_failure)?;
        if let Some(frame) = scan.into_frame() {
            codec.decode_frame(frame).map_err(test_failure)?;
            accepted = accepted
                .checked_add(frame.consumed_bytes())
                .ok_or_else(|| fail("accepted offset overflowed"))?;
            continue;
        }
        if accepted == cut {
            if !scan.is_end_of_input() {
                return Err(fail("exact generated frame boundary was not clean end-of-input"));
            }
        } else {
            let truncation = scan
                .truncation()
                .ok_or_else(|| fail("partial generated frame was not classified as truncated"))?;
            if truncation.available_bytes() != cut - accepted
                || truncation.required_bytes() <= truncation.available_bytes()
            {
                return Err(fail("generated truncation reported inconsistent byte counts"));
            }
        }
        break;
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn generated_concatenated_frames_round_trip_and_every_final_cut_is_safe(
        kinds in vec(proptest::bool::ANY, 0..9),
        cut_seed in proptest::prelude::any::<u16>(),
    ) {
        assert_complete_tail(&kinds)?;
        assert_cut_tail(&kinds, cut_seed)?;
    }

    #[test]
    fn arbitrary_borrowed_bytes_never_panic_or_trigger_resynchronization(
        bytes in vec(proptest::prelude::any::<u8>(), 0..257),
    ) {
        let (codec, _, _) = fixture()?;
        let _ = codec.scan(&bytes);
    }

    #[test]
    fn checksum_valid_structured_frames_preserve_arbitrary_payload_and_suffix_bytes(
        payload in vec(proptest::prelude::any::<u8>(), 0..513),
        suffix in vec(proptest::prelude::any::<u8>(), 0..65),
    ) {
        let (codec, _, _) = fixture()?;
        let mut input = framed_payload(&payload)?;
        let frame_bytes = input.len();
        input.extend_from_slice(&suffix);

        let frame = codec
            .scan(&input)
            .map_err(test_failure)?
            .into_frame()
            .ok_or_else(|| fail("checksum-valid structured frame did not scan as complete"))?;
        if frame.payload_bytes() != payload {
            return Err(fail("structured frame payload bytes changed"));
        }
        if frame.consumed_bytes() != frame_bytes || frame.remaining_bytes() != suffix {
            return Err(fail("structured frame boundary or suffix changed"));
        }
    }
}
