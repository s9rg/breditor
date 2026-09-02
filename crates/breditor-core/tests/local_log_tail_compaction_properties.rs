//! Generated equivalence laws for cursor and semantic-owner compaction.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{
        LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits, LocalLogEntryJsonCodec,
        LocalLogFrameLimits, LocalLogFrameScan,
    },
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogEvent, LocalLogId,
        LocalLogRecoveryLimits, LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::HistoryIntent,
};
use proptest::{
    collection::vec,
    test_runner::{Config, TestCaseError},
};
use support::{
    local_log::{apply, entry, insertion, state},
    local_log_tail::{empty_anchor, frame_codec, raw_frame},
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

struct GeneratedTrace {
    context: EditorContext,
    initial: EditorState,
    session_id: LocalSessionId,
    checkpoint_log: LocalLogId,
    active_log: LocalLogId,
    successor_log: LocalLogId,
    frames: Vec<Vec<u8>>,
    unique_count: u64,
}

fn build_trace(insertions: &[char], duplicates: &[bool]) -> Result<GeneratedTrace, TestCaseError> {
    let context = EditorContext::default();
    let initial = state(&context, "", "tail-compaction-property").map_err(test_failure)?;
    let session_id =
        LocalSessionId::try_new("session:tail-compaction:property").map_err(test_failure)?;
    let checkpoint_log =
        LocalLogId::try_new("log:tail-compaction:property:g0").map_err(test_failure)?;
    let active_log =
        LocalLogId::try_new("log:tail-compaction:property:g1").map_err(test_failure)?;
    let successor_log =
        LocalLogId::try_new("log:tail-compaction:property:g2").map_err(test_failure)?;
    let encoder = frame_codec(context.clone(), &session_id, &active_log);
    let entry_codec = LocalLogEntryJsonCodec::new(context.clone());
    let mut producer = EditorSession::new(initial.clone());
    let mut frames = Vec::new();

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
            &format!("request:tail-compaction:property:{index}"),
            LocalLogEvent::commit(commit),
        )
        .map_err(test_failure)?;
        frames.push(encoder.encode(&observation).map_err(test_failure)?);
        if duplicates.get(index).copied().unwrap_or(false) {
            let json = entry_codec.encode(&observation).map_err(test_failure)?;
            frames.push(raw_frame(format!(" \n{json}\t").as_bytes()).map_err(test_failure)?);
        }
    }

    Ok(GeneratedTrace {
        context,
        initial,
        session_id,
        checkpoint_log,
        active_log,
        successor_log,
        frames,
        unique_count: u64::try_from(insertions.len()).map_err(test_failure)?,
    })
}

fn assert_cursor_compaction_matches_direct_owner(
    insertions: &[char],
    duplicates: &[bool],
    cut_seed: u8,
    frame_limit_delta: u16,
) -> Result<(), TestCaseError> {
    let trace = build_trace(insertions, duplicates)?;
    let frame_count = usize::from(cut_seed) % trace.frames.len().saturating_add(1);
    let physical_limit = u64::try_from(trace.frames.len()).map_err(test_failure)?;
    let recovery_limits =
        LocalLogRecoveryLimits::new(physical_limit, trace.unique_count, trace.unique_count);
    let frame_limits =
        LocalLogFrameLimits::new(u64::MAX.saturating_sub(u64::from(frame_limit_delta)));
    let compaction_limit = LocalLogCompactionLimits::new(trace.unique_count);

    let cursor_anchor = empty_anchor(
        trace.initial.clone(),
        &trace.session_id,
        &trace.checkpoint_log,
        &trace.active_log,
        trace.unique_count,
    )
    .map_err(test_failure)?;
    let mut cursor = cursor_anchor.begin_successor_tail(recovery_limits, frame_limits);
    let mut accepted_prefix = 0u64;
    for frame in trace.frames.iter().take(frame_count) {
        let step = cursor.try_observe_frame(accepted_prefix, frame).map_err(test_failure)?;
        if step.status().frame_bytes() != Some(frame.len()) {
            return Err(fail("generated complete frame was not accepted by the cursor"));
        }
        accepted_prefix = accepted_prefix
            .checked_add(u64::try_from(frame.len()).map_err(test_failure)?)
            .ok_or_else(|| fail("generated accepted prefix overflowed"))?;
        let (next, _) = step.into_parts();
        cursor = next;
    }
    let outcome =
        cursor.try_into_checkpoint_anchor(trace.successor_log.clone()).map_err(test_failure)?;

    let direct_anchor = empty_anchor(
        trace.initial,
        &trace.session_id,
        &trace.checkpoint_log,
        &trace.active_log,
        trace.unique_count,
    )
    .map_err(test_failure)?;
    let mut owner = direct_anchor.begin_successor(recovery_limits);
    let decoder = frame_codec(trace.context.clone(), &trace.session_id, &trace.active_log);
    for frame in trace.frames.iter().take(frame_count) {
        let scan = decoder.scan(frame).map_err(test_failure)?;
        let LocalLogFrameScan::Complete(borrowed) = scan else {
            return Err(fail("generated direct frame was not complete"));
        };
        let observation = decoder.decode_frame(borrowed).map_err(test_failure)?;
        let (next, _) = owner.try_observe(observation).map_err(test_failure)?;
        owner = next;
    }
    let direct =
        owner.try_into_checkpoint_anchor(trace.successor_log.clone()).map_err(test_failure)?;

    if outcome.accepted_prefix_bytes() != accepted_prefix
        || outcome.frame_limits() != frame_limits
        || outcome.anchor().compaction_limits() != compaction_limit
    {
        return Err(fail("cursor compaction changed generated accepted-prefix metadata or policy"));
    }
    let binding =
        LocalLogCheckpointBinding::try_new(trace.session_id, trace.active_log, trace.successor_log)
            .map_err(test_failure)?;
    let codec = LocalLogCheckpointJsonCodec::new(trace.context, binding).with_limits(
        LocalLogCheckpointLimits::default().with_max_replay_tombstones(trace.unique_count),
    );
    if codec.encode(outcome.anchor()).map_err(test_failure)?
        != codec.encode(&direct).map_err(test_failure)?
    {
        return Err(fail("cursor and direct owner compaction published different anchors"));
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn every_generated_accepted_prefix_compacts_like_its_direct_semantic_owner(
        insertions in vec(proptest::char::range('a', 'z'), 0..6),
        duplicates in vec(proptest::bool::ANY, 0..6),
        cut_seed in proptest::num::u8::ANY,
        frame_limit_delta in proptest::num::u16::ANY,
    ) {
        assert_cursor_compaction_matches_direct_owner(
            &insertions,
            &duplicates,
            cut_seed,
            frame_limit_delta,
        )?;
    }
}
