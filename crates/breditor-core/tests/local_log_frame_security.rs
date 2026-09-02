//! Adversarial contracts for Local Log Frame V1 scanning and binding.

mod support;

use breditor_core::{
    codec::{
        LOCAL_LOG_FRAME_HEADER_BYTES, LOCAL_LOG_FRAME_MAGIC, LocalLogFrameBinding,
        LocalLogFrameCodec, LocalLogFrameCodecError, LocalLogFrameErrorCode, LocalLogFrameLimits,
        LocalLogFrameTruncationStage,
    },
    local_log::{LocalLogEvent, LocalLogId, LocalSessionId},
    schema::DocumentLimits,
    state::EditorContext,
};
use support::{TestResult, local_log::entry, test_error};

const VERSION_START: usize = 8;
const FLAGS_START: usize = 10;
const LENGTH_START: usize = 12;
const PAYLOAD_CHECKSUM_START: usize = 20;
const HEADER_CHECKSUM_START: usize = 24;
const CRC32C_REVERSED_POLYNOMIAL: u32 = 0x82F6_3B78;

fn binding(session: &str, log: &str) -> Result<LocalLogFrameBinding, Box<dyn std::error::Error>> {
    Ok(LocalLogFrameBinding::new(LocalSessionId::try_new(session)?, LocalLogId::try_new(log)?))
}

fn codec() -> Result<LocalLogFrameCodec, Box<dyn std::error::Error>> {
    Ok(LocalLogFrameCodec::new(
        EditorContext::default(),
        binding("session:frame-security", "log:frame-security:g1")?,
    ))
}

fn control_entry(
    session: &str,
    log: &str,
) -> Result<breditor_core::local_log::LocalLogEntry, Box<dyn std::error::Error>> {
    entry(
        &LocalSessionId::try_new(session)?,
        &LocalLogId::try_new(log)?,
        1,
        "request:frame-security",
        LocalLogEvent::clear_history(),
    )
}

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

fn write_u16(bytes: &mut [u8], start: usize, value: u16) {
    bytes[start..start + 2].copy_from_slice(&value.to_be_bytes());
}

fn write_u32(bytes: &mut [u8], start: usize, value: u32) {
    bytes[start..start + 4].copy_from_slice(&value.to_be_bytes());
}

fn write_u64(bytes: &mut [u8], start: usize, value: u64) {
    bytes[start..start + 8].copy_from_slice(&value.to_be_bytes());
}

fn read_u64(bytes: &[u8], start: usize) -> u64 {
    u64::from_be_bytes([
        bytes[start],
        bytes[start + 1],
        bytes[start + 2],
        bytes[start + 3],
        bytes[start + 4],
        bytes[start + 5],
        bytes[start + 6],
        bytes[start + 7],
    ])
}

fn refresh_header_checksum(frame: &mut [u8]) {
    let checksum = crc32c(&frame[..HEADER_CHECKSUM_START]);
    write_u32(frame, HEADER_CHECKSUM_START, checksum);
}

fn raw_frame(payload: &[u8]) -> Vec<u8> {
    let mut frame = vec![0; LOCAL_LOG_FRAME_HEADER_BYTES];
    frame[..LOCAL_LOG_FRAME_MAGIC.len()].copy_from_slice(&LOCAL_LOG_FRAME_MAGIC);
    write_u16(&mut frame, VERSION_START, 1);
    write_u64(&mut frame, LENGTH_START, u64::try_from(payload.len()).unwrap_or(u64::MAX));
    write_u32(&mut frame, PAYLOAD_CHECKSUM_START, crc32c(payload));
    refresh_header_checksum(&mut frame);
    frame.extend_from_slice(payload);
    frame
}

fn assert_code(
    result: Result<breditor_core::codec::LocalLogFrameScan<'_>, LocalLogFrameCodecError>,
    expected: LocalLogFrameErrorCode,
) -> Result<LocalLogFrameCodecError, Box<dyn std::error::Error>> {
    let error = result
        .err()
        .ok_or_else(|| test_error(format!("expected local-log frame error {expected:?}")))?;
    assert_eq!(error.code(), expected);
    Ok(error)
}

#[test]
fn every_valid_prefix_is_clean_end_truncated_or_complete_at_the_exact_boundary() -> TestResult {
    let codec = codec()?;
    let encoded =
        codec.encode(&control_entry("session:frame-security", "log:frame-security:g1")?)?;
    assert!(codec.scan(&[])?.is_end_of_input());

    for cut in 1..encoded.len() {
        let scan = codec.scan(&encoded[..cut])?;
        let truncation = scan
            .truncation()
            .ok_or_else(|| test_error(format!("valid prefix {cut} was not truncated")))?;
        let expected_stage = if cut < LOCAL_LOG_FRAME_MAGIC.len() {
            LocalLogFrameTruncationStage::Magic
        } else if cut < LOCAL_LOG_FRAME_HEADER_BYTES {
            LocalLogFrameTruncationStage::Header
        } else {
            LocalLogFrameTruncationStage::Payload
        };
        let expected_required = match expected_stage {
            LocalLogFrameTruncationStage::Magic => LOCAL_LOG_FRAME_MAGIC.len(),
            LocalLogFrameTruncationStage::Header => LOCAL_LOG_FRAME_HEADER_BYTES,
            LocalLogFrameTruncationStage::Payload => encoded.len(),
            _ => return Err(test_error("unknown truncation stage").into()),
        };
        assert_eq!(truncation.stage(), expected_stage);
        assert_eq!(truncation.available_bytes(), cut);
        assert_eq!(truncation.required_bytes(), expected_required);
        assert_eq!(truncation.missing_bytes(), expected_required - cut);
    }
    let complete = codec
        .scan(&encoded)?
        .into_frame()
        .ok_or_else(|| test_error("full frame was not complete"))?;
    assert_eq!(complete.consumed_bytes(), encoded.len());

    assert_eq!(
        assert_code(codec.scan(b"X"), LocalLogFrameErrorCode::UnsupportedMagic)?.code(),
        LocalLogFrameErrorCode::UnsupportedMagic
    );
    Ok(())
}

#[test]
fn header_corruption_never_masquerades_as_a_truncated_payload() -> TestResult {
    let codec = codec()?;
    let encoded =
        codec.encode(&control_entry("session:frame-security", "log:frame-security:g1")?)?;

    let mut corrupted_length = encoded.clone();
    corrupted_length[LENGTH_START + 7] ^= 1;
    assert_code(codec.scan(&corrupted_length), LocalLogFrameErrorCode::HeaderChecksumMismatch)?;

    let mut corrupted_payload_checksum = encoded.clone();
    corrupted_payload_checksum[PAYLOAD_CHECKSUM_START] ^= 1;
    assert_code(
        codec.scan(&corrupted_payload_checksum),
        LocalLogFrameErrorCode::HeaderChecksumMismatch,
    )?;

    let mut corrupted_header_checksum = encoded;
    corrupted_header_checksum[HEADER_CHECKSUM_START] ^= 1;
    assert_code(
        codec.scan(&corrupted_header_checksum),
        LocalLogFrameErrorCode::HeaderChecksumMismatch,
    )?;
    Ok(())
}

#[test]
fn every_single_bit_header_and_payload_corruption_is_detected() -> TestResult {
    let codec = codec()?;
    let encoded =
        codec.encode(&control_entry("session:frame-security", "log:frame-security:g1")?)?;

    for byte_index in 0..LOCAL_LOG_FRAME_HEADER_BYTES {
        for bit_index in 0..8 {
            let mut corrupted = encoded.clone();
            corrupted[byte_index] ^= 1u8 << bit_index;
            let expected = if byte_index < LOCAL_LOG_FRAME_MAGIC.len() {
                LocalLogFrameErrorCode::UnsupportedMagic
            } else {
                LocalLogFrameErrorCode::HeaderChecksumMismatch
            };
            assert_code(codec.scan(&corrupted), expected)?;
        }
    }

    for byte_index in LOCAL_LOG_FRAME_HEADER_BYTES..encoded.len() {
        for bit_index in 0..8 {
            let mut corrupted = encoded.clone();
            corrupted[byte_index] ^= 1u8 << bit_index;
            assert_code(codec.scan(&corrupted), LocalLogFrameErrorCode::PayloadChecksumMismatch)?;
        }
    }
    Ok(())
}

#[test]
fn checksum_valid_routing_errors_precede_payload_availability_and_semantics() -> TestResult {
    let codec = codec()?;
    let encoded =
        codec.encode(&control_entry("session:frame-security", "log:frame-security:g1")?)?;

    let mut unsupported_version = encoded.clone();
    write_u16(&mut unsupported_version, VERSION_START, 2);
    refresh_header_checksum(&mut unsupported_version);
    assert_code(codec.scan(&unsupported_version), LocalLogFrameErrorCode::UnsupportedVersion)?;

    let mut unsupported_flags = encoded.clone();
    write_u16(&mut unsupported_flags, FLAGS_START, 1);
    refresh_header_checksum(&mut unsupported_flags);
    assert_code(codec.scan(&unsupported_flags), LocalLogFrameErrorCode::UnsupportedFlags)?;

    let payload_length = read_u64(&encoded, LENGTH_START);
    let limited = codec.clone().with_limits(LocalLogFrameLimits::new(payload_length));
    assert!(limited.scan(&encoded)?.frame().is_some());
    assert_eq!(
        limited.encode(&control_entry("session:frame-security", "log:frame-security:g1",)?)?.len(),
        encoded.len()
    );

    let too_small = codec.clone().with_limits(LocalLogFrameLimits::new(payload_length - 1));
    let error = assert_code(too_small.scan(&encoded), LocalLogFrameErrorCode::PayloadTooLarge)?;
    assert!(matches!(
        error,
        LocalLogFrameCodecError::PayloadTooLarge { actual, maximum }
            if actual == payload_length && maximum == payload_length - 1
    ));

    let mut declared_excess = encoded[..LOCAL_LOG_FRAME_HEADER_BYTES].to_vec();
    write_u64(&mut declared_excess, LENGTH_START, payload_length + 1);
    refresh_header_checksum(&mut declared_excess);
    assert_code(limited.scan(&declared_excess), LocalLogFrameErrorCode::PayloadTooLarge)?;
    Ok(())
}

#[test]
fn platform_overflow_and_context_json_limits_fail_before_waiting_for_payload() -> TestResult {
    let binding = binding("session:frame-security", "log:frame-security:g1")?;
    let context_limited = LocalLogFrameCodec::new(
        EditorContext::new(
            breditor_core::schema::CompiledSchema::default(),
            DocumentLimits::default().with_max_json_bytes(7),
        ),
        binding.clone(),
    )
    .with_limits(LocalLogFrameLimits::new(u64::MAX));
    let mut header = raw_frame(b"")[..LOCAL_LOG_FRAME_HEADER_BYTES].to_vec();
    write_u64(&mut header, LENGTH_START, 8);
    refresh_header_checksum(&mut header);
    let error =
        assert_code(context_limited.scan(&header), LocalLogFrameErrorCode::PayloadTooLarge)?;
    assert!(matches!(error, LocalLogFrameCodecError::PayloadTooLarge { actual: 8, maximum: 7 }));

    let unbounded = LocalLogFrameCodec::new(
        EditorContext::new(
            breditor_core::schema::CompiledSchema::default(),
            DocumentLimits::default().with_max_json_bytes(usize::MAX),
        ),
        binding,
    )
    .with_limits(LocalLogFrameLimits::new(u64::MAX));
    write_u64(&mut header, LENGTH_START, u64::MAX);
    refresh_header_checksum(&mut header);
    if usize::BITS < u64::BITS {
        let error = assert_code(unbounded.scan(&header), LocalLogFrameErrorCode::PayloadTooLarge)?;
        assert!(matches!(
            error,
            LocalLogFrameCodecError::PayloadTooLarge { actual: u64::MAX, maximum }
                if maximum == usize::MAX as u64
        ));
    } else {
        assert_code(unbounded.scan(&header), LocalLogFrameErrorCode::FrameLengthOverflow)?;
    }

    let first_impossible_slice_payload = isize::MAX
        .unsigned_abs()
        .checked_sub(LOCAL_LOG_FRAME_HEADER_BYTES)
        .and_then(|value| value.checked_add(1))
        .and_then(|value| u64::try_from(value).ok())
        .ok_or_else(|| test_error("supported slice width could not represent its frame limit"))?;
    write_u64(&mut header, LENGTH_START, first_impossible_slice_payload);
    refresh_header_checksum(&mut header);
    assert_code(unbounded.scan(&header), LocalLogFrameErrorCode::FrameLengthOverflow)?;
    Ok(())
}

#[test]
fn payload_corruption_utf8_and_semantic_failures_are_distinct() -> TestResult {
    let codec = codec()?;
    let mut corrupted =
        codec.encode(&control_entry("session:frame-security", "log:frame-security:g1")?)?;
    corrupted[LOCAL_LOG_FRAME_HEADER_BYTES] ^= 0xff;
    assert_code(codec.scan(&corrupted), LocalLogFrameErrorCode::PayloadChecksumMismatch)?;

    let invalid_utf8 = raw_frame(&[0xff]);
    let utf8_frame = codec
        .scan(&invalid_utf8)?
        .into_frame()
        .ok_or_else(|| test_error("checksummed invalid UTF-8 frame was not complete"))?;
    let utf8_error = codec
        .decode_frame(utf8_frame)
        .err()
        .ok_or_else(|| test_error("invalid UTF-8 payload decoded"))?;
    assert_eq!(utf8_error.code(), LocalLogFrameErrorCode::InvalidUtf8);

    let invalid_entry = raw_frame(b"{}");
    let entry_frame = codec
        .scan(&invalid_entry)?
        .into_frame()
        .ok_or_else(|| test_error("checksummed invalid entry frame was not complete"))?;
    let entry_error = codec
        .decode_frame(entry_frame)
        .err()
        .ok_or_else(|| test_error("invalid entry payload decoded"))?;
    assert_eq!(entry_error.code(), LocalLogFrameErrorCode::InvalidEntry);
    Ok(())
}

#[test]
fn trusted_session_then_log_binding_applies_to_encode_and_decode() -> TestResult {
    let context = EditorContext::default();
    let source = codec()?;
    let foreign = control_entry("session:foreign-frame", "log:foreign-frame:g9")?;
    let encode_error = source
        .encode(&foreign)
        .err()
        .ok_or_else(|| test_error("foreign entry encoded under trusted binding"))?;
    assert_eq!(encode_error.code(), LocalLogFrameErrorCode::SessionMismatch);

    let source_codec = LocalLogFrameCodec::new(
        context.clone(),
        binding("session:foreign-frame", "log:foreign-frame:g9")?,
    );
    let encoded = source_codec.encode(&foreign)?;
    let frame = source
        .scan(&encoded)?
        .into_frame()
        .ok_or_else(|| test_error("foreign frame did not pass structural scan"))?;
    let decode_error = source
        .decode_frame(frame)
        .err()
        .ok_or_else(|| test_error("foreign session passed trusted decode binding"))?;
    assert_eq!(decode_error.code(), LocalLogFrameErrorCode::SessionMismatch);

    let same_session = LocalLogFrameCodec::new(
        context,
        binding("session:foreign-frame", "log:frame-security:g1")?,
    );
    let frame = same_session
        .scan(&encoded)?
        .into_frame()
        .ok_or_else(|| test_error("foreign-log frame did not pass structural scan"))?;
    let log_error = same_session
        .decode_frame(frame)
        .err()
        .ok_or_else(|| test_error("foreign log passed trusted decode binding"))?;
    assert_eq!(log_error.code(), LocalLogFrameErrorCode::ActiveLogMismatch);
    Ok(())
}

#[test]
fn semantic_decode_rechecks_the_receiving_codecs_payload_policy() -> TestResult {
    let permissive = codec()?;
    let encoded =
        permissive.encode(&control_entry("session:frame-security", "log:frame-security:g1")?)?;
    let frame = permissive
        .scan(&encoded)?
        .into_frame()
        .ok_or_else(|| test_error("permissively scanned frame was not complete"))?;
    let strict = codec()?.with_limits(LocalLogFrameLimits::new(0));

    let error = strict
        .decode_frame(frame)
        .err()
        .ok_or_else(|| test_error("borrowed frame bypassed the receiving codec's payload limit"))?;
    assert!(matches!(
        error,
        LocalLogFrameCodecError::PayloadTooLarge { actual, maximum: 0 }
            if actual == u64::try_from(frame.payload_bytes().len())?
    ));
    Ok(())
}
