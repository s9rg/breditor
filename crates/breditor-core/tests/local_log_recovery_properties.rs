//! Generated laws for genesis local-log recovery and exact retry handling.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{DocumentJsonCodec, SessionCheckpointJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryError, LocalLogRecoveryErrorCode, LocalLogSequence, LocalSessionId,
        RecoveredLocalLog, ReplayId,
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

const SESSION_ID: &str = "session:recovery-property";
const LOG_ID: &str = "log:recovery-property";

#[derive(Clone, Debug)]
struct StepSpec {
    inserted: String,
    retry_seeds: Vec<u8>,
}

struct CommitRecipe {
    before: EditorState,
    inserted: String,
}

struct AuthoredTrace {
    producer: EditorSession,
    recipes: Vec<CommitRecipe>,
}

fn property_config() -> Config {
    Config { cases: 64, max_shrink_iters: 2_048, ..Config::default() }
}

fn step_strategy() -> impl Strategy<Value = StepSpec> {
    let inserted = select(vec![
        "a".to_owned(),
        "Z".to_owned(),
        "é".to_owned(),
        "e\u{301}".to_owned(),
        "界".to_owned(),
        "😀".to_owned(),
    ]);
    (inserted, vec(0_u8..16, 0..3))
        .prop_map(|(inserted, retry_seeds)| StepSpec { inserted, retry_seeds })
}

fn trace_strategy() -> impl Strategy<Value = Vec<StepSpec>> {
    vec(step_strategy(), 0..9)
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn fail(message: impl Into<String>) -> TestCaseError {
    TestCaseError::fail(message.into())
}

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, TestCaseError> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node("genesis", false)])]))
        .map_err(test_failure)?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage).map_err(test_failure)?,
        document,
        None,
        None,
    )
    .map_err(test_failure)
}

fn insert_transaction(state: &EditorState, text: &str) -> Result<Transaction, TestCaseError> {
    let start = TextOffset::try_new(0).map_err(test_failure)?;
    let range = TextRange::try_new(path(&[0]).map_err(test_failure)?, start, start)
        .map_err(test_failure)?;
    let replacement: TextFragment =
        TextRun::try_new(text, FormatSet::default()).map_err(test_failure)?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)
        .map_err(test_failure)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn commit_from_recipe(recipe: &CommitRecipe) -> Result<Commit, TestCaseError> {
    insert_transaction(&recipe.before, &recipe.inserted)?
        .apply(recipe.before.context(), &recipe.before)
        .map_err(test_failure)?
        .into_commit()
        .ok_or_else(|| fail("generated insertion was unexpectedly unchanged"))
}

fn author_trace(initial: &EditorState, steps: &[StepSpec]) -> Result<AuthoredTrace, TestCaseError> {
    let mut producer = EditorSession::new(initial.clone());
    let mut recipes = Vec::with_capacity(steps.len());
    for step in steps {
        let before = producer.state().clone();
        let transaction = insert_transaction(&before, &step.inserted)?;
        let commit = producer
            .apply_transaction(&transaction)
            .map_err(test_failure)?
            .into_commit()
            .ok_or_else(|| fail("generated producer insertion was unexpectedly unchanged"))?;
        if commit.forward_operations().len() != 1 {
            return Err(fail("generated ordinary commit did not contain exactly one operation"));
        }
        recipes.push(CommitRecipe { before, inserted: step.inserted.clone() });
    }
    Ok(AuthoredTrace { producer, recipes })
}

fn logical_sequence(index: usize) -> Result<LocalLogSequence, TestCaseError> {
    let value = u64::try_from(index)
        .map_err(test_failure)?
        .checked_add(1)
        .ok_or_else(|| fail("generated logical sequence overflowed"))?;
    LocalLogSequence::try_new(value).map_err(test_failure)
}

fn replay_id(index: usize) -> Result<ReplayId, TestCaseError> {
    ReplayId::try_new(format!("replay:{}", logical_sequence(index)?.get())).map_err(test_failure)
}

fn entry_from_recipe(
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
    recipes: &[CommitRecipe],
    index: usize,
) -> Result<LocalLogEntry, TestCaseError> {
    let recipe = recipes
        .get(index)
        .ok_or_else(|| fail("generated retry target did not name an authored commit"))?;
    Ok(LocalLogEntry::new(
        session_id.clone(),
        log_id.clone(),
        logical_sequence(index)?,
        replay_id(index)?,
        LocalLogEvent::commit(commit_from_recipe(recipe)?),
    ))
}

fn observations(
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
    recipes: &[CommitRecipe],
    steps: &[StepSpec],
    include_retries: bool,
) -> Result<Vec<LocalLogEntry>, TestCaseError> {
    if recipes.len() != steps.len() {
        return Err(fail("authored recipe count did not match generated steps"));
    }
    let retry_count = steps.iter().map(|step| step.retry_seeds.len()).sum::<usize>();
    let capacity = recipes
        .len()
        .checked_add(if include_retries { retry_count } else { 0 })
        .ok_or_else(|| fail("generated observation capacity overflowed"))?;
    let mut observations = Vec::with_capacity(capacity);
    for (index, step) in steps.iter().enumerate() {
        observations.push(entry_from_recipe(session_id, log_id, recipes, index)?);
        if include_retries {
            for seed in &step.retry_seeds {
                let target = usize::from(*seed) % (index + 1);
                observations.push(entry_from_recipe(session_id, log_id, recipes, target)?);
            }
        }
    }
    Ok(observations)
}

fn assert_retained_prefix(
    recovered: &RecoveredLocalLog,
    initial: &EditorState,
    expected_count: usize,
) -> Result<(), TestCaseError> {
    if recovered.entries().len() != expected_count {
        return Err(fail("recovery retained the wrong number of logical entries"));
    }

    let mut expected_before = initial;
    for (index, retained) in recovered.entries().iter().enumerate() {
        if retained.sequence() != logical_sequence(index)? {
            return Err(fail("retained logical entries were not sequence-contiguous"));
        }
        if retained.replay_id() != &replay_id(index)? {
            return Err(fail("retained entry had the wrong replay identity"));
        }
        if retained.event_kind() != LocalLogEventKind::Commit {
            return Err(fail("ordinary-commit trace retained another event kind"));
        }
        let commit = retained
            .event()
            .as_commit()
            .ok_or_else(|| fail("retained commit event had no commit"))?;
        if commit.before() != expected_before {
            return Err(fail("retained commit chain was disconnected"));
        }
        if commit.forward_operations().len() != 1 {
            return Err(fail("retained ordinary commit did not have one operation"));
        }
        expected_before = commit.after();

        let lookup = recovered
            .entry_for_replay_id(retained.replay_id())
            .ok_or_else(|| fail("retained replay identity was missing from the lookup"))?;
        if !std::ptr::eq(lookup, retained) {
            return Err(fail("replay lookup did not return the retained entry allocation"));
        }
    }
    if expected_before != recovered.session().state() {
        return Err(fail("retained commit chain did not end at the recovered state"));
    }
    let absent = ReplayId::try_new("replay:absent").map_err(test_failure)?;
    if recovered.entry_for_replay_id(&absent).is_some() {
        return Err(fail("unknown replay identity unexpectedly resolved"));
    }
    Ok(())
}

fn assert_trace_laws(steps: &[StepSpec], lineage_suffix: u16) -> Result<(), TestCaseError> {
    let context = EditorContext::default();
    let initial = state(&context, &format!("local-log-recovery-property-{lineage_suffix}"))?;
    let authored = author_trace(&initial, steps)?;
    let session_id = LocalSessionId::try_new(SESSION_ID).map_err(test_failure)?;
    let log_id = LocalLogId::try_new(LOG_ID).map_err(test_failure)?;
    let unique_observations = observations(&session_id, &log_id, &authored.recipes, steps, false)?;
    let retried_observations = observations(&session_id, &log_id, &authored.recipes, steps, true)?;
    let expected_unique = u64::try_from(steps.len()).map_err(test_failure)?;
    let expected_duplicates = steps.iter().try_fold(0_u64, |total, step| {
        let count = u64::try_from(step.retry_seeds.len()).map_err(test_failure)?;
        total.checked_add(count).ok_or_else(|| fail("generated duplicate count overflowed"))
    })?;
    let expected_observations = expected_unique
        .checked_add(expected_duplicates)
        .ok_or_else(|| fail("generated observation count overflowed"))?;

    let recovery = LocalLogRecovery::new(session_id.clone(), log_id.clone());
    let unique = recovery
        .recover(EditorSession::new(initial.clone()), unique_observations)
        .map_err(test_failure)?;
    let retried = recovery
        .recover(EditorSession::new(initial.clone()), retried_observations)
        .map_err(test_failure)?;

    if unique.session_id() != &session_id
        || retried.session_id() != &session_id
        || unique.active_log_id() != &log_id
        || retried.active_log_id() != &log_id
    {
        return Err(fail("recovery changed a generated membership scope"));
    }
    if unique.observation_count() != expected_unique
        || unique.unique_event_count() != expected_unique
        || unique.exact_duplicate_count() != 0
        || unique.applied_operation_count() != expected_unique
    {
        return Err(fail("duplicate-free recovery counters were inconsistent"));
    }
    if retried.observation_count() != expected_observations
        || retried.unique_event_count() != expected_unique
        || retried.exact_duplicate_count() != expected_duplicates
        || retried.applied_operation_count() != expected_unique
    {
        return Err(fail("retrying recovery counters were inconsistent"));
    }

    let expected_covered =
        if steps.is_empty() { None } else { Some(logical_sequence(steps.len() - 1)?) };
    let expected_next = if steps.is_empty() {
        Some(LocalLogSequence::FIRST)
    } else {
        Some(logical_sequence(steps.len() - 1)?.successor().map_err(test_failure)?)
    };
    if unique.covered_through() != expected_covered
        || retried.covered_through() != expected_covered
        || unique.next_sequence() != expected_next
        || retried.next_sequence() != expected_next
    {
        return Err(fail("recovery reported the wrong logical sequence frontier"));
    }

    assert_retained_prefix(&unique, &initial, steps.len())?;
    assert_retained_prefix(&retried, &initial, steps.len())?;
    if unique.entries() != retried.entries() {
        return Err(fail("exact retries changed the retained logical entries"));
    }
    if unique.session().state() != authored.producer.state()
        || retried.session().state() != authored.producer.state()
        || unique.session().state() != retried.session().state()
    {
        return Err(fail("exact retries changed the final editor state"));
    }
    let expected_undo_depth = u32::try_from(expected_unique).map_err(test_failure)?;
    if unique.session().undo_depth() != expected_undo_depth
        || retried.session().undo_depth() != expected_undo_depth
        || unique.session().redo_depth() != 0
        || retried.session().redo_depth() != 0
    {
        return Err(fail("exact retries changed the retained history cursor"));
    }

    let checkpoint_codec = SessionCheckpointJsonCodec::new(context);
    let producer_checkpoint = checkpoint_codec.encode(&authored.producer).map_err(test_failure)?;
    let unique_checkpoint = checkpoint_codec.encode(unique.session()).map_err(test_failure)?;
    let retried_checkpoint = checkpoint_codec.encode(retried.session()).map_err(test_failure)?;
    if unique_checkpoint != producer_checkpoint || retried_checkpoint != producer_checkpoint {
        return Err(fail("exact retries changed durable session semantics"));
    }
    Ok(())
}

#[test]
fn delayed_retry_of_an_old_binding_is_semantically_inert() -> Result<(), TestCaseError> {
    let steps = vec![
        StepSpec { inserted: "a".to_owned(), retry_seeds: Vec::new() },
        StepSpec { inserted: "界".to_owned(), retry_seeds: Vec::new() },
        StepSpec { inserted: "😀".to_owned(), retry_seeds: vec![0] },
    ];
    assert_trace_laws(&steps, 0)
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn exact_retry_schedules_preserve_one_contiguous_logical_commit_chain(
        steps in trace_strategy(),
        lineage_suffix in any::<u16>(),
    ) {
        assert_trace_laws(&steps, lineage_suffix)?;
    }

    #[test]
    fn changing_the_sequence_of_an_existing_replay_binding_is_a_conflict(
        inserted in select(vec![
            "a".to_owned(),
            "é".to_owned(),
            "界".to_owned(),
            "😀".to_owned(),
        ]),
        lineage_suffix in any::<u16>(),
    ) {
        let context = EditorContext::default();
        let initial = state(
            &context,
            &format!("local-log-replay-conflict-property-{lineage_suffix}"),
        )?;
        let recipe = CommitRecipe { before: initial.clone(), inserted };
        let first_commit = commit_from_recipe(&recipe)?;
        let changed_sequence_commit = commit_from_recipe(&recipe)?;
        if first_commit != changed_sequence_commit {
            return Err(fail("independently derived retry commits were not semantically equal"));
        }

        let session_id = LocalSessionId::try_new(SESSION_ID).map_err(test_failure)?;
        let log_id = LocalLogId::try_new(LOG_ID).map_err(test_failure)?;
        let replay_id = ReplayId::try_new("replay:mutated-binding").map_err(test_failure)?;
        let observations = vec![
            LocalLogEntry::new(
                session_id.clone(),
                log_id.clone(),
                LocalLogSequence::FIRST,
                replay_id.clone(),
                LocalLogEvent::commit(first_commit),
            ),
            LocalLogEntry::new(
                session_id.clone(),
                log_id.clone(),
                LocalLogSequence::try_new(2).map_err(test_failure)?,
                replay_id.clone(),
                LocalLogEvent::commit(changed_sequence_commit),
            ),
        ];
        let error = LocalLogRecovery::new(session_id, log_id)
            .recover(EditorSession::new(initial), observations)
            .err()
            .ok_or_else(|| fail("mutated replay binding was unexpectedly accepted"))?;
        if error.code() != LocalLogRecoveryErrorCode::ReplayConflict
            || error.delivery_index() != Some(1)
        {
            return Err(fail("mutated replay binding used the wrong recovery classification"));
        }
        let LocalLogRecoveryError::ReplayConflict {
            first_delivery_index,
            delivery_index,
            replay_id: rejected_replay_id,
        } = error
        else {
            return Err(fail("mutated replay binding used the wrong error variant"));
        };
        if first_delivery_index != 0
            || delivery_index != 1
            || rejected_replay_id != replay_id
        {
            return Err(fail("replay conflict did not retain its bounded binding coordinates"));
        }
    }
}
