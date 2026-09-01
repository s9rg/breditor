//! Black-box contracts for exact session-history observations.

mod support;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId},
    transaction::{HistoryIntent, Transaction, TransactionMetadata},
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn initial_state(
    context: &EditorContext,
    lineage: &str,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node("a", false)])]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insert(
    state: &EditorState,
    text: &str,
    history: HistoryIntent,
) -> Result<Transaction, Box<dyn std::error::Error>> {
    let end = TextOffset::try_new(1)?;
    let range = TextRange::try_new(path(&[0])?, end, end)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history)))
}

fn publish(session: &mut EditorSession, transaction: &Transaction) -> TestResult {
    let outcome = session.apply_transaction(transaction)?;
    if outcome.into_commit().is_none() {
        return Err(test_error("transaction unexpectedly unchanged").into());
    }
    Ok(())
}

#[test]
fn status_tracks_publication_replay_and_effective_clear() -> TestResult {
    let context = EditorContext::default();
    let capacity = HistoryCapacity::try_new(3)?;
    let mut session = EditorSession::with_history_capacity(
        initial_state(&context, "history-status-publication")?,
        capacity,
    );

    let initial = session.history_status();
    let initial_clone = initial.clone();
    assert_eq!(initial, initial_clone);
    assert_eq!(initial.capacity(), capacity);
    assert_eq!(initial.undo_depth(), 0);
    assert_eq!(initial.redo_depth(), 0);
    assert!(!initial.can_undo());
    assert!(!initial.can_redo());
    assert_eq!(format!("{:?}", initial.stamp()), "HistoryStamp { .. }");

    session.close_history_group();
    session.clear_history();
    assert_eq!(session.history_status().stamp(), initial.stamp());

    let edit = insert(session.state(), "b", HistoryIntent::Record)?;
    publish(&mut session, &edit)?;
    let committed = session.history_status();
    assert_ne!(committed.stamp(), initial.stamp());
    assert_eq!(committed.undo_depth(), 1);
    assert_eq!(committed.redo_depth(), 0);
    assert!(committed.can_undo());

    if session.undo()?.is_none() {
        return Err(test_error("undo unexpectedly unavailable").into());
    }
    let undone = session.history_status();
    assert_ne!(undone.stamp(), committed.stamp());
    assert_eq!(undone.undo_depth(), 0);
    assert_eq!(undone.redo_depth(), 1);
    assert!(undone.can_redo());

    if session.redo()?.is_none() {
        return Err(test_error("redo unexpectedly unavailable").into());
    }
    let redone = session.history_status();
    assert_ne!(redone.stamp(), undone.stamp());
    assert_eq!(redone.undo_depth(), 1);
    assert_eq!(redone.redo_depth(), 0);

    session.clear_history();
    let cleared = session.history_status();
    assert_ne!(cleared.stamp(), redone.stamp());
    assert_eq!(cleared.undo_depth(), 0);
    assert_eq!(cleared.redo_depth(), 0);
    session.clear_history();
    assert_eq!(session.history_status().stamp(), cleared.stamp());
    Ok(())
}

#[test]
fn status_distinguishes_effective_merge_boundary_from_no_op_close() -> TestResult {
    let context = EditorContext::default();
    let mut session = EditorSession::new(initial_state(&context, "history-status-boundary")?);
    let initial = session.history_status();

    session.close_history_group();
    assert_eq!(session.history_status().stamp(), initial.stamp());

    let edit = insert(
        session.state(),
        "b",
        HistoryIntent::Merge { group: QualifiedName::try_new("test/status-merge")? },
    )?;
    publish(&mut session, &edit)?;
    let open = session.history_status();
    assert_eq!(open.undo_depth(), 1);

    session.close_history_group();
    let closed = session.history_status();
    assert_ne!(closed.stamp(), open.stamp());
    assert_eq!(closed.undo_depth(), open.undo_depth());
    assert_eq!(closed.redo_depth(), open.redo_depth());

    session.close_history_group();
    assert_eq!(session.history_status().stamp(), closed.stamp());
    Ok(())
}

#[test]
fn zero_capacity_publication_rotates_but_retains_no_history() -> TestResult {
    let context = EditorContext::default();
    let mut session = EditorSession::with_history_capacity(
        initial_state(&context, "history-status-disabled")?,
        HistoryCapacity::DISABLED,
    );
    let before = session.history_status();
    let edit = insert(session.state(), "b", HistoryIntent::Record)?;
    publish(&mut session, &edit)?;
    let after = session.history_status();
    assert_ne!(after.stamp(), before.stamp());
    assert_eq!(after.capacity(), HistoryCapacity::DISABLED);
    assert_eq!(after.undo_depth(), 0);
    assert_eq!(after.redo_depth(), 0);

    session.clear_history();
    session.close_history_group();
    assert_eq!(session.history_status().stamp(), after.stamp());
    Ok(())
}
