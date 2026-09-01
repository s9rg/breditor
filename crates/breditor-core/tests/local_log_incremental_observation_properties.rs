//! Generated equivalence laws for batch and incremental successor admission.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{
        LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits, LocalLogEntryJsonCodec,
        SessionCheckpointJsonCodec,
    },
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogEvent, LocalLogId,
        LocalLogObservationOutcome, LocalLogRecovery, LocalLogRecoveryLimits, LocalSessionId,
        ReplayId,
    },
    session::EditorSession,
    state::EditorContext,
    transaction::HistoryIntent,
};
use proptest::{
    collection::vec,
    prelude::Strategy,
    sample::select,
    test_runner::{Config, TestCaseError},
};
use support::local_log::{apply, entry, insertion, state};

fn property_config() -> Config {
    Config { cases: 64, max_shrink_iters: 2_048, ..Config::default() }
}

fn trace_strategy() -> impl Strategy<Value = (Vec<String>, Vec<bool>)> {
    vec(
        select(vec![
            "a".to_owned(),
            "Z".to_owned(),
            "é".to_owned(),
            "e\u{301}".to_owned(),
            "界".to_owned(),
            "😀".to_owned(),
        ]),
        0..7,
    )
    .prop_flat_map(|inserted| {
        let length = inserted.len();
        (proptest::strategy::Just(inserted), vec(proptest::bool::ANY, length))
    })
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn fail(message: impl Into<String>) -> TestCaseError {
    TestCaseError::fail(message.into())
}

fn author_encoded_trace(
    context: &EditorContext,
    initial: &breditor_core::state::EditorState,
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
    inserted: &[String],
    duplicates: &[bool],
) -> Result<(EditorSession, Vec<String>), TestCaseError> {
    let entry_codec = LocalLogEntryJsonCodec::new(context.clone());
    let mut producer = EditorSession::new(initial.clone());
    let mut encoded = Vec::new();
    for (index, text) in inserted.iter().enumerate() {
        let transaction =
            insertion(producer.state(), 0, text, HistoryIntent::Record).map_err(test_failure)?;
        let commit = apply(&mut producer, &transaction).map_err(test_failure)?;
        let sequence = u64::try_from(index)
            .map_err(test_failure)?
            .checked_add(1)
            .ok_or_else(|| fail("generated sequence overflowed"))?;
        let observation = entry(
            session_id,
            log_id,
            sequence,
            &format!("request:incremental:{index}"),
            LocalLogEvent::commit(commit),
        )
        .map_err(test_failure)?;
        let json = entry_codec.encode(&observation).map_err(test_failure)?;
        encoded.push(json.clone());
        if duplicates.get(index).copied().unwrap_or(false) {
            encoded.push(json);
        }
    }
    Ok((producer, encoded))
}

fn assert_incremental_equivalence(
    inserted: &[String],
    duplicates: &[bool],
    lineage_suffix: u16,
) -> Result<(), TestCaseError> {
    let context = EditorContext::default();
    let initial = state(&context, "base", &format!("incremental-property:{lineage_suffix}"))
        .map_err(test_failure)?;
    let session_id =
        LocalSessionId::try_new("session:incremental-property").map_err(test_failure)?;
    let g0 = LocalLogId::try_new("log:incremental-property:g0").map_err(test_failure)?;
    let g1 = LocalLogId::try_new("log:incremental-property:g1").map_err(test_failure)?;
    let g2 = LocalLogId::try_new("log:incremental-property:g2").map_err(test_failure)?;
    let entry_codec = LocalLogEntryJsonCodec::new(context.clone());
    let (producer, encoded) =
        author_encoded_trace(&context, &initial, &session_id, &g1, inserted, duplicates)?;

    let unique_count = u64::try_from(inserted.len()).map_err(test_failure)?;
    let observation_count = u64::try_from(encoded.len()).map_err(test_failure)?;
    let duplicate_count = observation_count
        .checked_sub(unique_count)
        .ok_or_else(|| fail("generated duplicate count underflowed"))?;
    let limits = LocalLogRecoveryLimits::new(observation_count, unique_count, unique_count);

    let batch_anchor = LocalLogRecovery::new(session_id.clone(), g0.clone())
        .recover(EditorSession::new(initial.clone()), Vec::new())
        .map_err(test_failure)?
        .try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(unique_count))
        .map_err(test_failure)?;
    let batch_entries = encoded
        .iter()
        .map(|json| entry_codec.decode(json).map_err(test_failure))
        .collect::<Result<Vec<_>, _>>()?;
    let batch = batch_anchor.recover_successor(batch_entries, limits).map_err(test_failure)?;

    let incremental_anchor = LocalLogRecovery::new(session_id.clone(), g0)
        .recover(EditorSession::new(initial), Vec::new())
        .map_err(test_failure)?
        .try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(unique_count))
        .map_err(test_failure)?;
    let mut incremental = incremental_anchor.begin_successor(limits);
    let mut applied = 0u64;
    let mut exact_duplicates = 0u64;
    for json in &encoded {
        let observation = entry_codec.decode(json).map_err(test_failure)?;
        let (next, outcome) = incremental.try_observe(observation).map_err(test_failure)?;
        match outcome {
            LocalLogObservationOutcome::Applied { .. } => {
                applied = applied
                    .checked_add(1)
                    .ok_or_else(|| fail("generated applied count overflowed"))?;
            }
            LocalLogObservationOutcome::ExactDuplicate { .. } => {
                exact_duplicates = exact_duplicates
                    .checked_add(1)
                    .ok_or_else(|| fail("generated duplicate count overflowed"))?;
            }
            _ => return Err(fail("incremental observation returned an unknown outcome")),
        }
        incremental = next;
    }

    if (applied, exact_duplicates) != (unique_count, duplicate_count)
        || incremental.observation_count() != observation_count
        || incremental.unique_event_count() != unique_count
        || incremental.exact_duplicate_count() != duplicate_count
        || incremental.applied_operation_count() != unique_count
        || incremental.recovery_limits() != limits
    {
        return Err(fail("incremental admission produced incorrect cumulative counters"));
    }
    if incremental.active_entries() != batch.active_entries() {
        return Err(fail("incremental admission retained different active entries than batch"));
    }
    let session_codec = SessionCheckpointJsonCodec::new(context.clone());
    let incremental_session = session_codec.encode(incremental.session()).map_err(test_failure)?;
    if incremental_session != session_codec.encode(batch.session()).map_err(test_failure)?
        || incremental_session != session_codec.encode(&producer).map_err(test_failure)?
    {
        return Err(fail("incremental admission changed final session/history semantics"));
    }

    let incremental_checkpoint =
        incremental.try_into_checkpoint_anchor(g2.clone()).map_err(test_failure)?;
    let batch_checkpoint = batch.try_into_checkpoint_anchor(g2.clone()).map_err(test_failure)?;
    for index in 0..inserted.len() {
        let replay_id =
            ReplayId::try_new(format!("request:incremental:{index}")).map_err(test_failure)?;
        if incremental_checkpoint.compacted_sequence_for_replay_id(&replay_id)
            != batch_checkpoint.compacted_sequence_for_replay_id(&replay_id)
        {
            return Err(fail("incremental seal changed a replay-to-sequence binding"));
        }
    }
    let checkpoint_codec = LocalLogCheckpointJsonCodec::new(
        context,
        LocalLogCheckpointBinding::try_new(session_id, g1, g2).map_err(test_failure)?,
    )
    .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(unique_count));
    if checkpoint_codec.encode(&incremental_checkpoint).map_err(test_failure)?
        != checkpoint_codec.encode(&batch_checkpoint).map_err(test_failure)?
    {
        return Err(fail("incremental and batch seals produced different checkpoint bytes"));
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn generated_one_by_one_delivery_matches_complete_batch(
        (inserted, duplicates) in trace_strategy(),
        lineage_suffix in proptest::prelude::any::<u16>(),
    ) {
        assert_incremental_equivalence(&inserted, &duplicates, lineage_suffix)?;
    }
}
