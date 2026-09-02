use std::error::Error;

use breditor_core::{
    codec::{
        LOCAL_LOG_FRAME_HEADER_BYTES, LOCAL_LOG_FRAME_MAGIC, LocalLogFrameBinding,
        LocalLogFrameCodec,
    },
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState},
};

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

pub(crate) fn empty_anchor(
    initial: EditorState,
    session_id: &LocalSessionId,
    checkpoint_log: &LocalLogId,
    active_log: &LocalLogId,
    compaction_limit: u64,
) -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    let recovered = LocalLogRecovery::new(session_id.clone(), checkpoint_log.clone())
        .recover(EditorSession::new(initial), Vec::new())?;
    recovered
        .try_into_checkpoint_anchor(
            active_log.clone(),
            LocalLogCompactionLimits::new(compaction_limit),
        )
        .map_err(Into::into)
}

pub(crate) fn frame_codec(
    context: EditorContext,
    session_id: &LocalSessionId,
    active_log: &LocalLogId,
) -> LocalLogFrameCodec {
    LocalLogFrameCodec::new(
        context,
        LocalLogFrameBinding::new(session_id.clone(), active_log.clone()),
    )
}

pub(crate) fn raw_frame(payload: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut frame = vec![0; LOCAL_LOG_FRAME_HEADER_BYTES];
    frame[..LOCAL_LOG_FRAME_MAGIC.len()].copy_from_slice(&LOCAL_LOG_FRAME_MAGIC);
    frame[8..10].copy_from_slice(&1u16.to_be_bytes());
    frame[12..20].copy_from_slice(&u64::try_from(payload.len())?.to_be_bytes());
    frame[20..24].copy_from_slice(&crc32c(payload).to_be_bytes());
    let header_checksum = crc32c(&frame[..24]);
    frame[24..28].copy_from_slice(&header_checksum.to_be_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}
