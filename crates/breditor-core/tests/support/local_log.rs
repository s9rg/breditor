use std::error::Error;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};

use super::{document_json, paragraph, path, test_error, text_node};

pub(crate) fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

pub(crate) fn entry(
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new(
        session_id.clone(),
        log_id.clone(),
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

pub(crate) fn insertion(
    state: &EditorState,
    offset: u64,
    text: &str,
    history: HistoryIntent,
) -> Result<Transaction, Box<dyn Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history)))
}

pub(crate) fn apply(
    session: &mut EditorSession,
    transaction: &Transaction,
) -> Result<Commit, Box<dyn Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly remained unchanged").into())
}
