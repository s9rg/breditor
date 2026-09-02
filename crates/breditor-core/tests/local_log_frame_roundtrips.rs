//! Black-box contracts for Local Log Frame V1 encoding and borrowed scanning.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        LOCAL_LOG_FRAME_FORMAT_VERSION, LOCAL_LOG_FRAME_HEADER_BYTES, LOCAL_LOG_FRAME_MAGIC,
        LocalLogEntryJsonCodec, LocalLogFrameBinding, LocalLogFrameCodec,
    },
    local_log::{LocalLogEntry, LocalLogEvent, LocalLogId, LocalSessionId},
    session::{EditorSession, HistoryReplayError},
    state::EditorContext,
    transaction::{Commit, HistoryIntent},
};
use support::{
    TestResult,
    local_log::{apply, entry, insertion, state},
    test_error,
};

fn history_commit(
    result: Result<Option<Commit>, HistoryReplayError>,
) -> Result<Commit, Box<dyn Error>> {
    result?.ok_or_else(|| test_error("history replay was unexpectedly unavailable").into())
}

fn binding(session_id: &LocalSessionId, log_id: &LocalLogId) -> LocalLogFrameBinding {
    LocalLogFrameBinding::new(session_id.clone(), log_id.clone())
}

fn all_event_entries(
    context: &EditorContext,
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
) -> Result<Vec<LocalLogEntry>, Box<dyn Error>> {
    let initial = state(context, "x", "local-log-frame-all-events")?;
    let mut producer = EditorSession::new(initial);
    let transaction = insertion(producer.state(), 1, "A", HistoryIntent::Record)?;
    let commit = apply(&mut producer, &transaction)?;
    let undo = history_commit(producer.undo())?;
    let redo = history_commit(producer.redo())?;
    Ok(vec![
        entry(session_id, log_id, 1, "request:frame:commit", LocalLogEvent::commit(commit))?,
        entry(session_id, log_id, 2, "request:frame:undo", LocalLogEvent::try_undo(undo)?)?,
        entry(session_id, log_id, 3, "request:frame:redo", LocalLogEvent::try_redo(redo)?)?,
        entry(session_id, log_id, 4, "request:frame:close", LocalLogEvent::close_history_group())?,
        entry(session_id, log_id, 5, "request:frame:clear", LocalLogEvent::clear_history())?,
    ])
}

#[test]
fn minimal_control_frame_has_exact_v1_header_and_payload_bytes() -> TestResult {
    assert_eq!(LOCAL_LOG_FRAME_MAGIC, *b"\x89BRDTL\r\n");
    assert_eq!(LOCAL_LOG_FRAME_FORMAT_VERSION, 1);
    assert_eq!(LOCAL_LOG_FRAME_HEADER_BYTES, 28);

    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:frame-golden")?;
    let log_id = LocalLogId::try_new("log:frame-golden:g1")?;
    let entry = entry(&session_id, &log_id, 1, "request:golden", LocalLogEvent::clear_history())?;
    let entry_json = LocalLogEntryJsonCodec::new(context.clone()).encode(&entry)?;
    let expected_payload = concat!(
        r#"{"format":"breditor/local-log-entry","formatVersion":1,"sessionId":"session:frame-golden","#,
        r#""logId":"log:frame-golden:g1","sequence":"1","replayId":"request:golden","#,
        r#""event":{"kind":"clearHistory"}}"#,
    );
    assert_eq!(entry_json, expected_payload);

    let codec = LocalLogFrameCodec::new(context, binding(&session_id, &log_id));
    let frame = codec.encode(&entry)?;
    let expected_header = [
        0x89, 0x42, 0x52, 0x44, 0x54, 0x4c, 0x0d, 0x0a, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xc3, 0x24, 0xe0, 0x87, 0xfe, 0x7c, 0x28, 0xd7, 0x4a,
    ];
    assert_eq!(&frame[..LOCAL_LOG_FRAME_HEADER_BYTES], &expected_header);
    assert_eq!(&frame[LOCAL_LOG_FRAME_HEADER_BYTES..], expected_payload.as_bytes());
    assert_eq!(frame.len(), LOCAL_LOG_FRAME_HEADER_BYTES + expected_payload.len());
    Ok(())
}

#[test]
fn every_event_kind_round_trips_through_the_same_binary_and_semantic_boundaries() -> TestResult {
    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:frame-all-events")?;
    let log_id = LocalLogId::try_new("log:frame-all-events:g1")?;
    let codec = LocalLogFrameCodec::new(context.clone(), binding(&session_id, &log_id));
    let entries = all_event_entries(&context, &session_id, &log_id)?;

    for original in entries {
        let encoded = codec.encode(&original)?;
        let scan = codec.scan(&encoded)?;
        let frame = scan
            .into_frame()
            .ok_or_else(|| test_error("complete encoded frame did not scan as complete"))?;
        assert_eq!(frame.consumed_bytes(), encoded.len());
        assert!(frame.remaining_bytes().is_empty());
        assert!(std::ptr::eq(
            frame.payload_bytes().as_ptr(),
            encoded[LOCAL_LOG_FRAME_HEADER_BYTES..].as_ptr(),
        ));
        assert_eq!(codec.decode_frame(frame)?, original);
    }
    Ok(())
}

#[test]
fn concatenated_frames_expose_exact_consumed_and_remaining_slices() -> TestResult {
    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:frame-concatenated")?;
    let log_id = LocalLogId::try_new("log:frame-concatenated:g1")?;
    let codec = LocalLogFrameCodec::new(context, binding(&session_id, &log_id));
    let first = entry(
        &session_id,
        &log_id,
        1,
        "request:frame:first",
        LocalLogEvent::close_history_group(),
    )?;
    let second =
        entry(&session_id, &log_id, 2, "request:frame:second", LocalLogEvent::clear_history())?;
    let first_bytes = codec.encode(&first)?;
    let second_bytes = codec.encode(&second)?;
    let mut tail = first_bytes.clone();
    tail.extend_from_slice(&second_bytes);

    let first_frame = codec
        .scan(&tail)?
        .into_frame()
        .ok_or_else(|| test_error("first concatenated frame was not complete"))?;
    assert_eq!(first_frame.consumed_bytes(), first_bytes.len());
    assert_eq!(first_frame.remaining_bytes(), second_bytes);
    assert_eq!(codec.decode_frame(first_frame)?, first);

    let second_frame = codec
        .scan(&tail[first_bytes.len()..])?
        .into_frame()
        .ok_or_else(|| test_error("second concatenated frame was not complete"))?;
    assert_eq!(second_frame.consumed_bytes(), second_bytes.len());
    assert!(second_frame.remaining_bytes().is_empty());
    assert_eq!(codec.decode_frame(second_frame)?, second);
    assert!(codec.scan(&tail[tail.len()..])?.is_end_of_input());
    Ok(())
}
