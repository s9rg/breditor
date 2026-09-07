use std::error::Error;

use crate::{
    codec::{
        LOCAL_LOG_FRAME_FORMAT_VERSION, LOCAL_LOG_FRAME_HEADER_BYTES,
        LOCAL_LOG_FRAME_V2_FORMAT_VERSION, LocalLogEntryJsonCodec, LocalLogEntryJsonCodecV2,
        LocalLogEntryV2CodecError, LocalLogFrameBinding, LocalLogFrameCodec,
        LocalLogFrameCodecError, LocalLogFrameCodecV2, LocalLogFrameLimits,
        LocalLogFrameTruncationStage, LocalLogFrameV2CodecError,
    },
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    state::EditorContext,
};

use super::local_log_frame_checksum::crc32c;

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";

type TestResult = Result<(), Box<dyn Error>>;

fn ids(label: &str) -> Result<(LocalSessionId, LocalLogId), Box<dyn Error>> {
    Ok((
        LocalSessionId::try_new(format!("session:frame-v2:{label}"))?,
        LocalLogId::try_new(format!("log:frame-v2:{label}:g1"))?,
    ))
}

fn binding(session: &LocalSessionId, log: &LocalLogId) -> LocalLogFrameBinding {
    LocalLogFrameBinding::new(session.clone(), log.clone())
}

fn control_entry(
    schema: &CompiledSchema,
    session: &LocalSessionId,
    log: &LocalLogId,
    sequence: u64,
    replay: &str,
) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new_with_schema_binding(
        schema.durable_binding(),
        session.clone(),
        log.clone(),
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay)?,
        LocalLogEvent::clear_history(),
    ))
}

fn raw_frame(payload: &[u8], version: u16) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut frame = vec![0; LOCAL_LOG_FRAME_HEADER_BYTES];
    frame[..8].copy_from_slice(&super::LOCAL_LOG_FRAME_MAGIC);
    frame[8..10].copy_from_slice(&version.to_be_bytes());
    frame[12..20].copy_from_slice(&u64::try_from(payload.len())?.to_be_bytes());
    frame[20..24].copy_from_slice(&crc32c(&[payload]).to_be_bytes());
    let header_checksum = crc32c(&[&frame[..24]]);
    frame[24..28].copy_from_slice(&header_checksum.to_be_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}

#[test]
fn minimal_control_frame_has_exact_v2_header_and_fingerprint_bound_payload() -> TestResult {
    assert_eq!(LOCAL_LOG_FRAME_FORMAT_VERSION, 1);
    assert_eq!(LOCAL_LOG_FRAME_V2_FORMAT_VERSION, 2);
    assert_eq!(LOCAL_LOG_FRAME_HEADER_BYTES, 28);

    let context = EditorContext::default();
    let (session, log) = ids("golden")?;
    let entry = control_entry(context.schema(), &session, &log, 1, "request:frame-v2-golden")?;
    let expected_payload = r#"{"format":"breditor/local-log-entry","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","sessionId":"session:frame-v2:golden","logId":"log:frame-v2:golden:g1","sequence":"1","replayId":"request:frame-v2-golden","event":{"kind":"clearHistory"}}"#;
    assert_eq!(LocalLogEntryJsonCodecV2::new(context.clone()).encode(&entry)?, expected_payload);

    let codec = LocalLogFrameCodecV2::new(context, binding(&session, &log));
    assert_eq!(codec.format_version(), 2);
    assert_eq!(codec.schema_binding(), entry.schema_binding());
    let frame = codec.encode(&entry)?;
    let expected_header = [
        0x89, 0x42, 0x52, 0x44, 0x54, 0x4c, 0x0d, 0x0a, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x01, 0x5e, 0x98, 0xb6, 0x17, 0xcf, 0x46, 0x47, 0x21, 0x40,
    ];
    assert_eq!(&frame[..LOCAL_LOG_FRAME_HEADER_BYTES], &expected_header);
    assert_eq!(&frame[LOCAL_LOG_FRAME_HEADER_BYTES..], expected_payload.as_bytes());
    assert_eq!(frame.len(), LOCAL_LOG_FRAME_HEADER_BYTES + expected_payload.len());

    let borrowed = codec.scan(&frame)?.into_frame().ok_or("encoded V2 frame was incomplete")?;
    assert_eq!(borrowed.consumed_bytes(), frame.len());
    assert!(borrowed.remaining_bytes().is_empty());
    assert_eq!(codec.decode_frame(borrowed)?, entry);
    Ok(())
}

#[test]
fn v1_and_v2_frames_are_mutually_rejected_after_checksum_validation() -> TestResult {
    let context = EditorContext::default();
    let (session, log) = ids("generation")?;
    let entry = control_entry(context.schema(), &session, &log, 1, "request:generation")?;
    let trusted = binding(&session, &log);
    let v1 = LocalLogFrameCodec::new(context.clone(), trusted.clone()).encode(&entry)?;
    let v2 = LocalLogFrameCodecV2::new(context.clone(), trusted.clone()).encode(&entry)?;

    assert!(matches!(
        LocalLogFrameCodec::new(context.clone(), trusted.clone()).scan(&v2),
        Err(LocalLogFrameCodecError::UnsupportedVersion { found: 2, supported: 1 })
    ));
    assert!(matches!(
        LocalLogFrameCodecV2::new(context, trusted).scan(&v1),
        Err(LocalLogFrameV2CodecError::UnsupportedVersion { found: 1, supported: 2 })
    ));
    Ok(())
}

#[test]
fn v1_and_v2_payloads_cannot_be_rewrapped_under_the_other_frame_generation() -> TestResult {
    let context = EditorContext::default();
    let (session, log) = ids("mixed-payload")?;
    let entry = control_entry(context.schema(), &session, &log, 1, "request:mixed-payload")?;
    let trusted = binding(&session, &log);
    let v1_codec = LocalLogFrameCodec::new(context.clone(), trusted.clone());
    let v2_codec = LocalLogFrameCodecV2::new(context.clone(), trusted);
    let v1_json = LocalLogEntryJsonCodec::new(context.clone()).encode(&entry)?;
    let v2_json = LocalLogEntryJsonCodecV2::new(context).encode(&entry)?;

    let v1_payload_in_v2 = raw_frame(v1_json.as_bytes(), 2)?;
    let borrowed = v2_codec
        .scan(&v1_payload_in_v2)?
        .into_frame()
        .ok_or("V1 payload under V2 header was incomplete")?;
    assert!(matches!(
        v2_codec.decode_frame(borrowed),
        Err(LocalLogFrameV2CodecError::InvalidEntry(source))
            if matches!(*source, LocalLogEntryV2CodecError::UnsupportedFormatVersion {
                found: 1,
                supported: 2,
            })
    ));

    let v2_payload_in_v1 = raw_frame(v2_json.as_bytes(), 1)?;
    let borrowed = v1_codec
        .scan(&v2_payload_in_v1)?
        .into_frame()
        .ok_or("V2 payload under V1 header was incomplete")?;
    assert!(matches!(
        v1_codec.decode_frame(borrowed),
        Err(LocalLogFrameCodecError::InvalidEntry(_))
    ));
    Ok(())
}

#[test]
fn v2_scanner_distinguishes_every_truncation_phase_and_borrows_exact_slices() -> TestResult {
    let context = EditorContext::default();
    let (session, log) = ids("truncation")?;
    let entry = control_entry(context.schema(), &session, &log, 1, "request:truncation")?;
    let codec = LocalLogFrameCodecV2::new(context, binding(&session, &log));
    let frame = codec.encode(&entry)?;

    assert!(codec.scan(&[])?.is_end_of_input());
    for cut in 1..frame.len() {
        let truncation = codec
            .scan(&frame[..cut])?
            .truncation()
            .copied()
            .ok_or("proper V2 prefix was not reported as truncated")?;
        assert_eq!(truncation.available_bytes(), cut);
        assert!(truncation.required_bytes() > cut);
        assert_eq!(truncation.missing_bytes(), truncation.required_bytes() - cut);
        let expected = if cut < 8 {
            LocalLogFrameTruncationStage::Magic
        } else if cut < LOCAL_LOG_FRAME_HEADER_BYTES {
            LocalLogFrameTruncationStage::Header
        } else {
            LocalLogFrameTruncationStage::Payload
        };
        assert_eq!(truncation.stage(), expected);
    }

    let mut concatenated = frame.clone();
    concatenated.extend_from_slice(b"uninspected-tail");
    let borrowed =
        codec.scan(&concatenated)?.into_frame().ok_or("complete V2 frame was not returned")?;
    assert_eq!(borrowed.consumed_bytes(), frame.len());
    assert_eq!(borrowed.remaining_bytes(), b"uninspected-tail");
    assert!(std::ptr::eq(
        borrowed.payload_bytes().as_ptr(),
        concatenated[LOCAL_LOG_FRAME_HEADER_BYTES..].as_ptr(),
    ));
    Ok(())
}

#[test]
fn v2_checksums_utf8_and_payload_limits_fail_at_their_owned_boundaries() -> TestResult {
    let context = EditorContext::default();
    let (session, log) = ids("boundaries")?;
    let entry = control_entry(context.schema(), &session, &log, 1, "request:boundaries")?;
    let codec = LocalLogFrameCodecV2::new(context.clone(), binding(&session, &log));
    let frame = codec.encode(&entry)?;

    let mut bad_header = frame.clone();
    bad_header[12] ^= 1;
    assert!(matches!(
        codec.scan(&bad_header),
        Err(LocalLogFrameV2CodecError::HeaderChecksumMismatch { .. })
    ));

    let mut bad_payload = frame.clone();
    *bad_payload.last_mut().ok_or("encoded frame was empty")? ^= 1;
    assert!(matches!(
        codec.scan(&bad_payload),
        Err(LocalLogFrameV2CodecError::PayloadChecksumMismatch { .. })
    ));

    let payload_bytes = u64::try_from(frame.len() - LOCAL_LOG_FRAME_HEADER_BYTES)?;
    let exact = LocalLogFrameCodecV2::new(context.clone(), binding(&session, &log))
        .with_limits(LocalLogFrameLimits::new(payload_bytes));
    assert!(exact.scan(&frame)?.frame().is_some());
    assert_eq!(exact.encode(&entry)?, frame);
    let limited = LocalLogFrameCodecV2::new(context, binding(&session, &log))
        .with_limits(LocalLogFrameLimits::new(payload_bytes - 1));
    assert!(matches!(
        limited.scan(&frame),
        Err(LocalLogFrameV2CodecError::PayloadTooLarge { actual, maximum })
            if actual == payload_bytes && maximum == payload_bytes - 1
    ));
    assert!(matches!(
        limited.encode(&entry),
        Err(LocalLogFrameV2CodecError::PayloadTooLarge { actual, maximum })
            if actual == payload_bytes && maximum == payload_bytes - 1
    ));

    let invalid_utf8 = raw_frame(&[0xff], 2)?;
    let borrowed = codec
        .scan(&invalid_utf8)?
        .into_frame()
        .ok_or("checksummed invalid UTF-8 frame was incomplete")?;
    assert!(matches!(
        codec.decode_frame(borrowed),
        Err(LocalLogFrameV2CodecError::InvalidUtf8 { valid_up_to: 0 })
    ));
    Ok(())
}

#[test]
fn schema_bound_control_frames_round_trip_only_under_the_exact_fingerprint() -> TestResult {
    let variant_schema = CompiledSchema::test_semantic_variant_same_id();
    let variant_context = EditorContext::new(variant_schema.clone(), DocumentLimits::default());
    let (session, log) = ids("schema")?;
    let entry = control_entry(&variant_schema, &session, &log, 1, "request:schema")?;
    let variant = LocalLogFrameCodecV2::new(variant_context, binding(&session, &log));
    let frame = variant.encode(&entry)?;
    let decoded = variant.decode_frame(
        variant.scan(&frame)?.into_frame().ok_or("variant V2 frame was incomplete")?,
    )?;
    assert_eq!(decoded.schema_binding(), entry.schema_binding());

    let original = frame.clone();
    let base = LocalLogFrameCodecV2::new(EditorContext::default(), binding(&session, &log));
    let borrowed = base.scan(&frame)?.into_frame().ok_or("variant V2 frame was incomplete")?;
    assert!(matches!(
        base.decode_frame(borrowed),
        Err(LocalLogFrameV2CodecError::InvalidEntry(source))
            if matches!(*source, LocalLogEntryV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
    ));
    assert_eq!(frame, original);
    assert_eq!(base.schema_binding().fingerprint().to_string(), BASE_FINGERPRINT);
    Ok(())
}
