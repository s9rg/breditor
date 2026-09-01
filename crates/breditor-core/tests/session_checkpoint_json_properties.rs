//! Generated behavioral laws for durable session/history checkpoints.

mod support;

use std::{error::Error, fmt::Display};

use breditor_core::{
    codec::{DocumentJsonCodec, SessionCheckpointJsonCodec},
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity, SessionHistoryStatus},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use proptest::{
    prelude::*,
    test_runner::{Config, TestCaseError},
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

#[derive(Clone, Copy, Debug)]
enum HistorySpec {
    Record,
    MergeA,
    MergeB,
    Ignore,
}

#[derive(Clone, Copy, Debug)]
enum PendingSpec {
    None,
    Empty,
    Strong,
}

#[derive(Clone, Debug)]
enum Command {
    Insert { text: String, history: HistorySpec },
    StateOnly { at_end: bool, after_affinity: bool, pending: PendingSpec },
    Undo,
    Redo,
    CloseGroup,
    ClearHistory,
    Unchanged,
}

fn property_config() -> Config {
    Config { cases: 96, max_shrink_iters: 4_096, ..Config::default() }
}

fn command_strategy() -> impl Strategy<Value = Command> {
    let token = prop::sample::select(vec![
        "a".to_owned(),
        "é".to_owned(),
        "e\u{301}".to_owned(),
        "😀".to_owned(),
        "界".to_owned(),
    ]);
    let history = prop_oneof![
        Just(HistorySpec::Record),
        Just(HistorySpec::MergeA),
        Just(HistorySpec::MergeB),
        Just(HistorySpec::Ignore),
    ];
    let pending =
        prop_oneof![Just(PendingSpec::None), Just(PendingSpec::Empty), Just(PendingSpec::Strong),];
    prop_oneof![
        8 => (token, history).prop_map(|(text, history)| Command::Insert { text, history }),
        4 => (any::<bool>(), any::<bool>(), pending).prop_map(
            |(at_end, after_affinity, pending)| Command::StateOnly {
                at_end,
                after_affinity,
                pending,
            },
        ),
        2 => Just(Command::Undo),
        2 => Just(Command::Redo),
        1 => Just(Command::CloseGroup),
        1 => Just(Command::ClearHistory),
        1 => Just(Command::Unchanged),
    ]
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn document_codec(context: &EditorContext) -> DocumentJsonCodec {
    DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone())
}

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    let document =
        document_codec(context).decode(&document_json(&[paragraph(&[text_node("s", false)])]))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        Some(collapsed_selection(1, false)?),
        None,
    )
    .map_err(Into::into)
}

fn collapsed_selection(offset: u32, after_affinity: bool) -> Result<Selection, Box<dyn Error>> {
    let text_path = path(&[0, 0])?;
    let affinity = if after_affinity { Affinity::After } else { Affinity::Before };
    Ok(RangeSelection::new(
        Point::Text { text_path: text_path.clone(), utf16_offset: offset, affinity },
        Point::Text { text_path, utf16_offset: offset, affinity },
    )
    .into())
}

fn paragraph_text(document: &Document) -> Result<String, Box<dyn Error>> {
    let Some(paragraph) = document.node_at(&path(&[0])?)?.as_element() else {
        return Err(test_error("property paragraph was not an element").into());
    };
    let mut text = String::new();
    for child in paragraph.children() {
        let Some(run) = child.as_text() else {
            return Err(test_error("property paragraph contained a non-text child").into());
        };
        text.push_str(run.text());
    }
    Ok(text)
}

fn text_end(document: &Document) -> Result<u32, Box<dyn Error>> {
    u32::try_from(paragraph_text(document)?.encode_utf16().count()).map_err(Into::into)
}

fn fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}

fn history_intent(spec: HistorySpec) -> Result<HistoryIntent, Box<dyn Error>> {
    Ok(match spec {
        HistorySpec::Record => HistoryIntent::Record,
        HistorySpec::MergeA => {
            HistoryIntent::Merge { group: QualifiedName::try_new("test/checkpoint-property-a")? }
        }
        HistorySpec::MergeB => {
            HistoryIntent::Merge { group: QualifiedName::try_new("test/checkpoint-property-b")? }
        }
        HistorySpec::Ignore => HistoryIntent::Ignore,
    })
}

fn pending_formats(spec: PendingSpec) -> Result<Option<FormatSet>, Box<dyn Error>> {
    match spec {
        PendingSpec::None => Ok(None),
        PendingSpec::Empty => Ok(Some(FormatSet::default())),
        PendingSpec::Strong => Ok(Some(FormatSet::try_from_formats(vec![Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::default(),
        )])?)),
    }
}

fn insert_transaction(
    state: &EditorState,
    text: &str,
    history: HistorySpec,
) -> Result<Transaction, Box<dyn Error>> {
    let end = TextOffset::try_new(u64::from(text_end(state.document())?))?;
    let range = TextRange::try_new(path(&[0])?, end, end)?;
    let splice = TextSplice::capture(state.context(), state.document(), range, fragment(text)?)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history_intent(history)?)))
}

fn state_only_transaction(
    state: &EditorState,
    at_end: bool,
    after_affinity: bool,
    pending: PendingSpec,
) -> Result<Transaction, Box<dyn Error>> {
    let offset = if at_end { text_end(state.document())? } else { 0 };
    Ok(Transaction::new(state, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(collapsed_selection(
            offset,
            after_affinity,
        )?)))
        .with_pending_formats_update(PendingFormatsUpdate::Set(pending_formats(pending)?))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn execute_one(session: &mut EditorSession, command: &Command) -> Result<(), Box<dyn Error>> {
    match command {
        Command::Insert { text, history } => {
            let transaction = insert_transaction(session.state(), text, *history)?;
            let _ = session.apply_transaction(&transaction)?;
        }
        Command::StateOnly { at_end, after_affinity, pending } => {
            let transaction =
                state_only_transaction(session.state(), *at_end, *after_affinity, *pending)?;
            let _ = session.apply_transaction(&transaction)?;
        }
        Command::Undo => {
            let _ = session.undo()?;
        }
        Command::Redo => {
            let _ = session.redo()?;
        }
        Command::CloseGroup => session.close_history_group(),
        Command::ClearHistory => session.clear_history(),
        Command::Unchanged => {
            let transaction = Transaction::new(session.state(), Vec::new());
            let _ = session.apply_transaction(&transaction)?;
        }
    }
    Ok(())
}

fn same_public_observation(left: &EditorSession, right: &EditorSession) -> bool {
    left.state() == right.state()
        && left.history_capacity() == right.history_capacity()
        && left.undo_depth() == right.undo_depth()
        && left.redo_depth() == right.redo_depth()
        && left.can_undo() == right.can_undo()
        && left.can_redo() == right.can_redo()
}

fn stamp_changed(session: &EditorSession, previous: &SessionHistoryStatus) -> bool {
    session.history_status().stamp() != previous.stamp()
}

fn execute_pair(
    left: &mut EditorSession,
    right: &mut EditorSession,
    command: &Command,
) -> Result<(), TestCaseError> {
    let left_status = left.history_status();
    let right_status = right.history_status();
    match command {
        Command::Insert { text, history } => {
            let transaction =
                insert_transaction(left.state(), text, *history).map_err(test_failure)?;
            let left_outcome = left.apply_transaction(&transaction).map_err(test_failure)?;
            let right_outcome = right.apply_transaction(&transaction).map_err(test_failure)?;
            if left_outcome != right_outcome {
                return Err(TestCaseError::fail("paired insert outcomes diverged"));
            }
        }
        Command::StateOnly { at_end, after_affinity, pending } => {
            let transaction =
                state_only_transaction(left.state(), *at_end, *after_affinity, *pending)
                    .map_err(test_failure)?;
            let left_outcome = left.apply_transaction(&transaction).map_err(test_failure)?;
            let right_outcome = right.apply_transaction(&transaction).map_err(test_failure)?;
            if left_outcome != right_outcome {
                return Err(TestCaseError::fail("paired state-only outcomes diverged"));
            }
        }
        Command::Undo => {
            let left_outcome = left.undo().map_err(test_failure)?;
            let right_outcome = right.undo().map_err(test_failure)?;
            if left_outcome != right_outcome {
                return Err(TestCaseError::fail("paired undo outcomes diverged"));
            }
        }
        Command::Redo => {
            let left_outcome = left.redo().map_err(test_failure)?;
            let right_outcome = right.redo().map_err(test_failure)?;
            if left_outcome != right_outcome {
                return Err(TestCaseError::fail("paired redo outcomes diverged"));
            }
        }
        Command::CloseGroup => {
            left.close_history_group();
            right.close_history_group();
        }
        Command::ClearHistory => {
            left.clear_history();
            right.clear_history();
        }
        Command::Unchanged => {
            let transaction = Transaction::new(left.state(), Vec::new());
            let left_outcome = left.apply_transaction(&transaction).map_err(test_failure)?;
            let right_outcome = right.apply_transaction(&transaction).map_err(test_failure)?;
            if left_outcome != right_outcome {
                return Err(TestCaseError::fail("paired unchanged outcomes diverged"));
            }
        }
    }
    if !same_public_observation(left, right) {
        return Err(TestCaseError::fail("paired session observations diverged"));
    }
    if stamp_changed(left, &left_status) != stamp_changed(right, &right_status) {
        return Err(TestCaseError::fail("paired history-stamp transition behavior diverged"));
    }
    Ok(())
}

fn exhaust_history_pair(
    left: &mut EditorSession,
    right: &mut EditorSession,
) -> Result<(), TestCaseError> {
    loop {
        let left_status = left.history_status();
        let right_status = right.history_status();
        let left_outcome = left.undo().map_err(test_failure)?;
        let right_outcome = right.undo().map_err(test_failure)?;
        if left_outcome != right_outcome {
            return Err(TestCaseError::fail("exhaustive undo behavior diverged"));
        }
        if stamp_changed(left, &left_status) != stamp_changed(right, &right_status) {
            return Err(TestCaseError::fail("exhaustive undo stamp behavior diverged"));
        }
        if !same_public_observation(left, right) {
            return Err(TestCaseError::fail("sessions diverged while exhausting undo"));
        }
        if left_outcome.is_none() {
            break;
        }
    }
    loop {
        let left_status = left.history_status();
        let right_status = right.history_status();
        let left_outcome = left.redo().map_err(test_failure)?;
        let right_outcome = right.redo().map_err(test_failure)?;
        if left_outcome != right_outcome {
            return Err(TestCaseError::fail("exhaustive redo behavior diverged"));
        }
        if stamp_changed(left, &left_status) != stamp_changed(right, &right_status) {
            return Err(TestCaseError::fail("exhaustive redo stamp behavior diverged"));
        }
        if !same_public_observation(left, right) {
            return Err(TestCaseError::fail("sessions diverged while exhausting redo"));
        }
        if left_outcome.is_none() {
            break;
        }
    }
    Ok(())
}

fn assert_trace_round_trip_law(
    capacity: u32,
    maximum_operations: u32,
    commands: &[Command],
    split_seed: u8,
    lineage_suffix: u16,
) -> Result<(), TestCaseError> {
    let context = EditorContext::default().with_max_operations_per_transaction(maximum_operations);
    let initial =
        state(&context, &format!("checkpoint-property-{lineage_suffix}")).map_err(test_failure)?;
    let capacity = HistoryCapacity::try_new(capacity).map_err(test_failure)?;
    let mut original = EditorSession::with_history_capacity(initial, capacity);
    let split = usize::from(split_seed) % commands.len().saturating_add(1);
    for command in &commands[..split] {
        execute_one(&mut original, command).map_err(test_failure)?;
    }

    let codec = SessionCheckpointJsonCodec::new(context);
    let encoded = codec.encode(&original).map_err(test_failure)?;
    let repeated = codec.encode(&original).map_err(test_failure)?;
    if encoded != repeated {
        return Err(TestCaseError::fail("repeated session encoding changed bytes"));
    }
    let mut restored = codec.decode(&encoded).map_err(test_failure)?;
    if !same_public_observation(&original, &restored) {
        return Err(TestCaseError::fail("restored session observation differed"));
    }
    if codec.encode(&restored).map_err(test_failure)? != encoded {
        return Err(TestCaseError::fail("decode changed canonical checkpoint bytes"));
    }

    for command in &commands[split..] {
        execute_pair(&mut original, &mut restored, command)?;
    }
    exhaust_history_pair(&mut original, &mut restored)?;
    if codec.encode(&original).map_err(test_failure)?
        != codec.encode(&restored).map_err(test_failure)?
    {
        return Err(TestCaseError::fail(
            "equivalent future traversal produced different checkpoint bytes",
        ));
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn session_checkpoint_preserves_generated_unicode_history_and_future_behavior(
        capacity in 0_u32..=4,
        maximum_operations in 1_u32..=4,
        commands in prop::collection::vec(command_strategy(), 0..24),
        split_seed in any::<u8>(),
        lineage_suffix in any::<u16>(),
    ) {
        assert_trace_round_trip_law(
            capacity,
            maximum_operations,
            &commands,
            split_seed,
            lineage_suffix,
        )?;
    }
}

#[test]
fn revision_zero_with_nonempty_history_is_not_rejected_as_false_chronology() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "checkpoint-property-revision-zero")?;
    let mut session = EditorSession::new(initial);
    let transaction = insert_transaction(&session.state().clone(), "😀", HistorySpec::Record)?;
    if session.apply_transaction(&transaction)?.into_commit().is_none() {
        return Err(test_error("revision-zero fixture insert was unexpectedly unchanged").into());
    }
    let codec = SessionCheckpointJsonCodec::new(context);
    let mut record: Value = serde_json::from_str(&codec.encode(&session)?)?;
    record["currentRevision"] = Value::String("0".to_owned());
    let encoded = serde_json::to_string(&record)?;

    let mut restored = codec.decode(&encoded)?;
    assert_eq!(restored.state().snapshot().revision(), Revision::ZERO);
    assert_eq!((restored.undo_depth(), restored.redo_depth()), (1, 0));
    let canonical = codec.encode(&restored)?;
    let canonical_record: Value = serde_json::from_str(&canonical)?;
    assert_eq!(canonical_record["currentRevision"], "0");
    assert_eq!(codec.encode(&codec.decode(&canonical)?)?, canonical);

    let undo = restored
        .undo()?
        .ok_or_else(|| test_error("revision-zero restored undo was unavailable"))?;
    assert_eq!(undo.base_revision(), Revision::ZERO);
    assert_eq!(undo.revision(), Revision::new(1));
    let redo = restored
        .redo()?
        .ok_or_else(|| test_error("revision-zero restored redo was unavailable"))?;
    assert_eq!(redo.base_revision(), Revision::new(1));
    assert_eq!(redo.revision(), Revision::new(2));
    Ok(())
}
