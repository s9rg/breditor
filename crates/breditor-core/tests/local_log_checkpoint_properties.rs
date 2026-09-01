//! Generated split-point laws for compact checkpoint-linked local-log recovery.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{DocumentJsonCodec, SessionCheckpointJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogRecovery, LocalLogRecoveryLimits,
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
        LineageId::try_new(format!("checkpoint-property-{suffix}")).map_err(test_failure)?,
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
    ReplayId::try_new(format!("request:{index}")).map_err(test_failure)
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

fn assert_split_law(
    inserted: &[String],
    split_seed: u8,
    lineage_suffix: u16,
) -> Result<(), TestCaseError> {
    let context = EditorContext::default();
    let initial = initial_state(&context, lineage_suffix)?;
    let (producer, recipes) = author_trace(&initial, inserted)?;
    let split = usize::from(split_seed) % (recipes.len() + 1);
    let session_id =
        LocalSessionId::try_new("session:checkpoint-property").map_err(test_failure)?;
    let checkpoint_log_id =
        LocalLogId::try_new("log:checkpoint-property-prefix").map_err(test_failure)?;
    let successor_log_id =
        LocalLogId::try_new("log:checkpoint-property-tail").map_err(test_failure)?;

    let prefix = LocalLogRecovery::new(session_id.clone(), checkpoint_log_id.clone())
        .recover(
            EditorSession::new(initial),
            entries(&recipes, 0..split, &session_id, &checkpoint_log_id)?,
        )
        .map_err(test_failure)?;
    let anchor =
        prefix.try_into_checkpoint_anchor(successor_log_id.clone()).map_err(test_failure)?;
    let continued = anchor
        .recover_successor(
            entries(&recipes, split..recipes.len(), &session_id, &successor_log_id)?,
            LocalLogRecoveryLimits::default(),
        )
        .map_err(test_failure)?;

    if continued.compacted_replay_count() != u64::try_from(split).map_err(test_failure)?
        || continued.active_entries().len() != recipes.len() - split
    {
        return Err(fail("split recovery retained the wrong prefix or tail cardinality"));
    }
    for index in 0..split {
        if continued.compacted_sequence_for_replay_id(&replay_id(index)?) != Some(sequence(index)?)
        {
            return Err(fail("split recovery lost a compacted replay tombstone"));
        }
    }
    for index in split..recipes.len() {
        if continued.active_entry_for_replay_id(&replay_id(index)?).is_none() {
            return Err(fail("split recovery lost an active replay proof"));
        }
    }

    let checkpoint_codec = SessionCheckpointJsonCodec::new(context);
    if checkpoint_codec.encode(continued.session()).map_err(test_failure)?
        != checkpoint_codec.encode(&producer).map_err(test_failure)?
    {
        return Err(fail("split recovery changed final session or history semantics"));
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn every_generated_generation_split_preserves_session_and_replay_scopes(
        inserted in trace_strategy(),
        split_seed in any::<u8>(),
        lineage_suffix in any::<u16>(),
    ) {
        assert_split_law(&inserted, split_seed, lineage_suffix)?;
    }
}
