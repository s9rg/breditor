use std::error::Error;

use breditor_core::{
    codec::{
        LocalLogEntryJsonCodec, LocalLogFrameLimits, LocalLogTailCursor, SessionCheckpointJsonCodec,
    },
    local_log::{LocalLogEvent, LocalLogId, LocalLogRecoveryLimits, LocalSessionId},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::HistoryIntent,
};

use super::{
    local_log::{apply, entry, insertion, state},
    local_log_tail::{empty_anchor, frame_codec, raw_frame},
};

pub(crate) struct TailCompactionFixture {
    pub(crate) context: EditorContext,
    pub(crate) initial: EditorState,
    pub(crate) session_id: LocalSessionId,
    pub(crate) checkpoint_log: LocalLogId,
    pub(crate) active_log: LocalLogId,
    pub(crate) successor_log: LocalLogId,
    pub(crate) later_log: LocalLogId,
    pub(crate) first_frame: Vec<u8>,
    pub(crate) duplicate_frame: Vec<u8>,
    pub(crate) second_frame: Vec<u8>,
    pub(crate) after_first_checkpoint: String,
    pub(crate) after_second_checkpoint: String,
}

impl TailCompactionFixture {
    pub(crate) fn new(scope: &str) -> Result<Self, Box<dyn Error>> {
        let context = EditorContext::default();
        let initial = state(&context, "", &format!("tail-compaction-{scope}"))?;
        let session_id = LocalSessionId::try_new(format!("session:tail-compaction:{scope}"))?;
        let checkpoint_log = LocalLogId::try_new(format!("log:tail-compaction:{scope}:g0"))?;
        let active_log = LocalLogId::try_new(format!("log:tail-compaction:{scope}:g1"))?;
        let successor_log = LocalLogId::try_new(format!("log:tail-compaction:{scope}:g2"))?;
        let later_log = LocalLogId::try_new(format!("log:tail-compaction:{scope}:g3"))?;
        let encoder = frame_codec(context.clone(), &session_id, &active_log);
        let entry_codec = LocalLogEntryJsonCodec::new(context.clone());
        let session_codec = SessionCheckpointJsonCodec::new(context.clone());
        let mut producer = EditorSession::new(initial.clone());

        let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
        let first_commit = apply(&mut producer, &first_transaction)?;
        let first_entry = entry(
            &session_id,
            &active_log,
            1,
            &format!("request:tail-compaction:{scope}:first"),
            LocalLogEvent::commit(first_commit),
        )?;
        let first_frame = encoder.encode(&first_entry)?;
        let first_json = entry_codec.encode(&first_entry)?;
        let duplicate_frame = raw_frame(format!("\n {first_json}\t").as_bytes())?;
        let after_first_checkpoint = session_codec.encode(&producer)?;

        let second_transaction = insertion(producer.state(), 1, "B", HistoryIntent::Record)?;
        let second_commit = apply(&mut producer, &second_transaction)?;
        let second_entry = entry(
            &session_id,
            &active_log,
            2,
            &format!("request:tail-compaction:{scope}:second"),
            LocalLogEvent::commit(second_commit),
        )?;
        let second_frame = encoder.encode(&second_entry)?;
        let after_second_checkpoint = session_codec.encode(&producer)?;

        Ok(Self {
            context,
            initial,
            session_id,
            checkpoint_log,
            active_log,
            successor_log,
            later_log,
            first_frame,
            duplicate_frame,
            second_frame,
            after_first_checkpoint,
            after_second_checkpoint,
        })
    }

    pub(crate) fn cursor(
        &self,
        compaction_limit: u64,
        recovery_limits: LocalLogRecoveryLimits,
        frame_limits: LocalLogFrameLimits,
    ) -> Result<LocalLogTailCursor, Box<dyn Error>> {
        Ok(empty_anchor(
            self.initial.clone(),
            &self.session_id,
            &self.checkpoint_log,
            &self.active_log,
            compaction_limit,
        )?
        .begin_successor_tail(recovery_limits, frame_limits))
    }
}
