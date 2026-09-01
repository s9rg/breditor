//! Generated multi-generation laws for repeated local-log compaction.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{
        DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits,
        SessionCheckpointJsonCodec,
    },
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent,
        LocalLogId, LocalLogRecovery, LocalLogRecoveryError, LocalLogRecoveryLimits,
        LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use proptest::{
    collection::vec,
    prelude::{Strategy, any},
    sample::select,
    test_runner::{Config, TestCaseError},
};
use support::{document_json, paragraph, path, text_node};

struct CommitRecipe {
    before: EditorState,
    inserted: String,
}

fn property_config() -> Config {
    Config { cases: 64, max_shrink_iters: 2_048, ..Config::default() }
}

fn trace_strategy() -> impl Strategy<Value = Vec<String>> {
    vec(
        select(vec![
            "a".to_owned(),
            "Z".to_owned(),
            "é".to_owned(),
            "e\u{301}".to_owned(),
            "界".to_owned(),
            "😀".to_owned(),
        ]),
        0..9,
    )
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn fail(message: impl Into<String>) -> TestCaseError {
    TestCaseError::fail(message.into())
}

fn initial_state(context: &EditorContext, suffix: u16) -> Result<EditorState, TestCaseError> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node("base", false)])]))
        .map_err(test_failure)?;
    EditorState::try_new(
        context,
        LineageId::try_new(format!("repeated-property-{suffix}")).map_err(test_failure)?,
        document,
        None,
        None,
    )
    .map_err(test_failure)
}

fn insertion(state: &EditorState, inserted: &str) -> Result<Transaction, TestCaseError> {
    let start = TextOffset::try_new(0).map_err(test_failure)?;
    let range = TextRange::try_new(path(&[0]).map_err(test_failure)?, start, start)
        .map_err(test_failure)?;
    let replacement: TextFragment =
        TextRun::try_new(inserted, FormatSet::default()).map_err(test_failure)?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)
        .map_err(test_failure)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn author_trace(
    initial: &EditorState,
    inserted: &[String],
) -> Result<(EditorSession, Vec<CommitRecipe>), TestCaseError> {
    let mut producer = EditorSession::new(initial.clone());
    let mut recipes = Vec::with_capacity(inserted.len());
    for text in inserted {
        let before = producer.state().clone();
        let transaction = insertion(&before, text)?;
        producer
            .apply_transaction(&transaction)
            .map_err(test_failure)?
            .into_commit()
            .ok_or_else(|| fail("generated insertion was unexpectedly unchanged"))?;
        recipes.push(CommitRecipe { before, inserted: text.clone() });
    }
    Ok((producer, recipes))
}

fn commit(recipe: &CommitRecipe) -> Result<Commit, TestCaseError> {
    insertion(&recipe.before, &recipe.inserted)?
        .apply(recipe.before.context(), &recipe.before)
        .map_err(test_failure)?
        .into_commit()
        .ok_or_else(|| fail("generated recipe was unexpectedly unchanged"))
}

fn sequence(index: usize) -> Result<LocalLogSequence, TestCaseError> {
    let value = u64::try_from(index)
        .map_err(test_failure)?
        .checked_add(1)
        .ok_or_else(|| fail("generated sequence overflowed"))?;
    LocalLogSequence::try_new(value).map_err(test_failure)
}

fn replay_id(index: usize) -> Result<ReplayId, TestCaseError> {
    ReplayId::try_new(format!("request:repeated:{index}")).map_err(test_failure)
}

fn entries(
    recipes: &[CommitRecipe],
    range: std::ops::Range<usize>,
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
) -> Result<Vec<LocalLogEntry>, TestCaseError> {
    range
        .map(|index| {
            let recipe = recipes
                .get(index)
                .ok_or_else(|| fail("generated entry index was outside the recipe trace"))?;
            Ok(LocalLogEntry::new(
                session_id.clone(),
                log_id.clone(),
                sequence(index)?,
                replay_id(index)?,
                LocalLogEvent::commit(commit(recipe)?),
            ))
        })
        .collect()
}

fn assert_repeated_split_law(
    inserted: &[String],
    first_seed: u8,
    second_seed: u8,
    replay_seed: u8,
    lineage_suffix: u16,
) -> Result<(), TestCaseError> {
    let context = EditorContext::default();
    let initial = initial_state(&context, lineage_suffix)?;
    let (producer, recipes) = author_trace(&initial, inserted)?;
    let first = usize::from(first_seed) % (recipes.len() + 1);
    let second = first + (usize::from(second_seed) % (recipes.len() - first + 1));
    let total = u64::try_from(recipes.len()).map_err(test_failure)?;
    let session_id = LocalSessionId::try_new("session:repeated-property").map_err(test_failure)?;
    let g0 = LocalLogId::try_new("log:repeated-property-g0").map_err(test_failure)?;
    let g1 = LocalLogId::try_new("log:repeated-property-g1").map_err(test_failure)?;
    let g2 = LocalLogId::try_new("log:repeated-property-g2").map_err(test_failure)?;
    let g3 = LocalLogId::try_new("log:repeated-property-g3").map_err(test_failure)?;

    let recovered = LocalLogRecovery::new(session_id.clone(), g0.clone())
        .recover(EditorSession::new(initial), entries(&recipes, 0..first, &session_id, &g0)?)
        .map_err(test_failure)?;
    let anchor = recovered
        .try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(total))
        .map_err(test_failure)?;
    let continued = anchor
        .recover_successor(
            entries(&recipes, first..second, &session_id, &g1)?,
            LocalLogRecoveryLimits::default(),
        )
        .map_err(test_failure)?;
    let anchor = continued.try_into_checkpoint_anchor(g2.clone()).map_err(test_failure)?;

    // A durable round trip must preserve the cumulative runtime contract. The
    // host-selected codec limit explicitly reauthorizes the in-memory policy.
    let binding = LocalLogCheckpointBinding::try_new(session_id.clone(), g1.clone(), g2.clone())
        .map_err(test_failure)?;
    let codec = LocalLogCheckpointJsonCodec::new(context.clone(), binding)
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(total));
    let anchor =
        codec.decode(&codec.encode(&anchor).map_err(test_failure)?).map_err(test_failure)?;
    if anchor.compaction_limits().max_replay_tombstones() != total {
        return Err(fail("durable decode installed the wrong runtime lifetime policy"));
    }

    let continued = anchor
        .recover_successor(
            entries(&recipes, second..recipes.len(), &session_id, &g2)?,
            LocalLogRecoveryLimits::default(),
        )
        .map_err(test_failure)?;
    let anchor = continued.try_into_checkpoint_anchor(g3.clone()).map_err(test_failure)?;

    if anchor.compacted_replay_count() != total
        || anchor.checkpoint_covered_through().map(LocalLogSequence::get)
            != (total != 0).then_some(total)
    {
        return Err(fail("repeated compaction produced the wrong complete frontier"));
    }
    for index in 0..recipes.len() {
        if anchor.compacted_sequence_for_replay_id(&replay_id(index)?) != Some(sequence(index)?) {
            return Err(fail("repeated compaction lost a replay-to-sequence binding"));
        }
    }
    let session_codec = SessionCheckpointJsonCodec::new(context);
    if session_codec.encode(anchor.session()).map_err(test_failure)?
        != session_codec.encode(&producer).map_err(test_failure)?
    {
        return Err(fail("repeated compaction changed final session/history semantics"));
    }

    if !recipes.is_empty() {
        let selected = usize::from(replay_seed) % recipes.len();
        let retry = LocalLogEntry::new(
            session_id,
            g3,
            LocalLogSequence::FIRST,
            replay_id(selected)?,
            LocalLogEvent::close_history_group(),
        );
        let error = anchor
            .recover_successor(vec![retry], LocalLogRecoveryLimits::new(1, 0, 0))
            .err()
            .ok_or_else(|| fail("generated compacted retry was unexpectedly accepted"))?;
        let LocalLogRecoveryError::CompactedReplayId { checkpoint_sequence, .. } = error else {
            return Err(fail("generated compacted retry used the wrong error variant"));
        };
        if checkpoint_sequence != sequence(selected)? {
            return Err(fail("generated compacted retry reported the wrong sequence"));
        }
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn every_generated_two_split_trace_preserves_session_sequence_and_replay_scope(
        inserted in trace_strategy(),
        first_seed in any::<u8>(),
        second_seed in any::<u8>(),
        replay_seed in any::<u8>(),
        lineage_suffix in any::<u16>(),
    ) {
        assert_repeated_split_law(
            &inserted,
            first_seed,
            second_seed,
            replay_seed,
            lineage_suffix,
        )?;
    }
}
