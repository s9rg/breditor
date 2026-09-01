//! Bounded property laws for the durable one-entry local-log JSON boundary.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{DocumentJsonCodec, EditorStateJsonCodec, LocalLogEntryJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use proptest::{
    collection::vec,
    prelude::{Just, Strategy, any, prop_oneof},
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use serde_json::Value;
use support::{document_json, paragraph};

#[derive(Clone, Copy, Debug)]
enum ControlEventSpec {
    CloseHistoryGroup,
    ClearHistory,
}

fn property_config() -> Config {
    let mut config = Config::with_failure_persistence(FileFailurePersistence::Direct(
        "tests/local_log_entry_json_properties.proptest-regressions",
    ));
    config.cases = 48;
    config
}

fn portable_identity_suffix() -> impl Strategy<Value = String> {
    vec(select(vec!['a', 'Z', '0', '9', '.', '_', ':', '-']), 0..24)
        .prop_map(|characters| characters.into_iter().collect())
}

fn distinct_identities() -> impl Strategy<Value = (String, String, String)> {
    (portable_identity_suffix(), portable_identity_suffix(), portable_identity_suffix()).prop_map(
        |(session, log, replay)| (format!("S{session}"), format!("L{log}"), format!("R{replay}")),
    )
}

fn sequence_strategy() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(1),
        Just(2),
        Just(9_007_199_254_740_991),
        Just(9_007_199_254_740_993),
        Just(u64::MAX - 1),
        Just(u64::MAX),
        any::<u64>().prop_map(|value| value.max(1)),
    ]
}

fn result_revision_strategy() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(1),
        Just(2),
        Just(9_007_199_254_740_991),
        Just(9_007_199_254_740_993),
        Just(u64::MAX - 1),
        Just(u64::MAX),
        any::<u64>().prop_map(|value| value.max(1)),
    ]
}

fn independent_sequence_and_revision() -> impl Strategy<Value = (u64, u64)> {
    (sequence_strategy(), result_revision_strategy()).prop_map(|(sequence, revision)| {
        let revision = if sequence == revision {
            if revision == u64::MAX { 1 } else { revision + 1 }
        } else {
            revision
        };
        (sequence, revision)
    })
}

fn unicode_text() -> impl Strategy<Value = String> {
    vec(
        select(vec![
            'a',
            'Z',
            '0',
            ' ',
            '\n',
            '"',
            '\\',
            '\u{e9}',
            '\u{754c}',
            '\u{301}',
            '\u{1f600}',
            '\u{1f680}',
            '\u{1f1e8}',
            '\u{1f1e6}',
            '\u{200d}',
        ]),
        1..6,
    )
    .prop_map(|characters| characters.into_iter().collect())
}

fn control_event_strategy() -> impl Strategy<Value = ControlEventSpec> {
    prop_oneof![Just(ControlEventSpec::CloseHistoryGroup), Just(ControlEventSpec::ClearHistory),]
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn entry(
    identities: &(String, String, String),
    sequence: u64,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, TestCaseError> {
    let (session_id, log_id, replay_id) = identities;
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new(session_id).map_err(test_failure)?,
        LocalLogId::try_new(log_id).map_err(test_failure)?,
        LocalLogSequence::try_new(sequence).map_err(test_failure)?,
        ReplayId::try_new(replay_id).map_err(test_failure)?,
        event,
    ))
}

fn assert_codec_laws(
    codec: &LocalLogEntryJsonCodec,
    entry: &LocalLogEntry,
) -> Result<(String, LocalLogEntry), TestCaseError> {
    let encoded = codec.encode(entry).map_err(test_failure)?;
    let repeated = codec.encode(entry).map_err(test_failure)?;
    if repeated != encoded {
        return Err(TestCaseError::fail(
            "repeated encoding of one local-log entry was not byte-identical",
        ));
    }

    let decoded = codec.decode(&encoded).map_err(test_failure)?;
    if &decoded != entry {
        return Err(TestCaseError::fail(
            "decode(encode(entry)) did not preserve the complete local-log entry",
        ));
    }
    let reencoded = codec.encode(&decoded).map_err(test_failure)?;
    if reencoded != encoded {
        return Err(TestCaseError::fail(
            "decoded local-log entry changed deterministic bytes on re-encode",
        ));
    }
    Ok((encoded, decoded))
}

fn state_at_revision(context: &EditorContext, revision: u64) -> Result<EditorState, TestCaseError> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[])]))
        .map_err(test_failure)?;
    let initial = EditorState::try_new(
        context,
        LineageId::try_new("local-log-entry-json-property").map_err(test_failure)?,
        document,
        None,
        None,
    )
    .map_err(test_failure)?;
    let state_codec = EditorStateJsonCodec::new(context.clone());
    let encoded = state_codec.encode(&initial).map_err(test_failure)?;
    let mut record: Value = serde_json::from_str(&encoded).map_err(test_failure)?;
    let revision_field = record
        .pointer_mut("/snapshot/revision")
        .ok_or_else(|| TestCaseError::fail("encoded editor state has no snapshot revision"))?;
    *revision_field = Value::String(revision.to_string());
    state_codec.decode(&serde_json::to_string(&record).map_err(test_failure)?).map_err(test_failure)
}

fn unicode_commit(
    context: &EditorContext,
    text: &str,
    result_revision: u64,
) -> Result<Commit, TestCaseError> {
    let before = state_at_revision(context, result_revision - 1)?;
    let paragraph_path = NodePath::try_from_indices(vec![0]).map_err(test_failure)?;
    let offset = TextOffset::try_new(0).map_err(test_failure)?;
    let range = TextRange::try_new(paragraph_path, offset, offset).map_err(test_failure)?;
    let replacement: TextFragment =
        TextRun::try_new(text, FormatSet::default()).map_err(test_failure)?.into();
    let splice = TextSplice::capture(context, before.document(), range, replacement)
        .map_err(test_failure)?;
    let transaction = Transaction::new(&before, vec![splice.into()]);
    let outcome = transaction.apply(context, &before).map_err(test_failure)?;
    match outcome {
        TransactionOutcome::Committed(commit) => Ok(*commit),
        TransactionOutcome::Unchanged => {
            Err(TestCaseError::fail("generated Unicode insertion was unexpectedly unchanged"))
        }
    }
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn control_events_preserve_full_range_sequence_and_distinct_opaque_identities(
        identities in distinct_identities(),
        sequence in sequence_strategy(),
        event_spec in control_event_strategy(),
    ) {
        let context = EditorContext::default();
        let codec = LocalLogEntryJsonCodec::new(context);
        let (session_id, log_id, replay_id) = &identities;
        let (event, expected_kind) = match event_spec {
            ControlEventSpec::CloseHistoryGroup => (
                LocalLogEvent::close_history_group(),
                LocalLogEventKind::CloseHistoryGroup,
            ),
            ControlEventSpec::ClearHistory => (
                LocalLogEvent::clear_history(),
                LocalLogEventKind::ClearHistory,
            ),
        };
        let original = entry(&identities, sequence, event)?;
        let (encoded, decoded) = assert_codec_laws(&codec, &original)?;

        if session_id == log_id || session_id == replay_id || log_id == replay_id {
            return Err(TestCaseError::fail("generated identity scopes were not distinct"));
        }
        if decoded.session_id().as_str() != session_id
            || decoded.log_id().as_str() != log_id
            || decoded.replay_id().as_str() != replay_id
        {
            return Err(TestCaseError::fail(
                "codec conflated or changed a generated identity scope",
            ));
        }
        if decoded.sequence().get() != sequence {
            return Err(TestCaseError::fail("codec changed a full-range local-log sequence"));
        }
        if decoded.event_kind() != expected_kind || decoded.event().as_commit().is_some() {
            return Err(TestCaseError::fail("codec changed a unit control event"));
        }

        let record: Value = serde_json::from_str(&encoded).map_err(test_failure)?;
        if record.get("sessionId") != Some(&Value::String(session_id.clone()))
            || record.get("logId") != Some(&Value::String(log_id.clone()))
            || record.get("replayId") != Some(&Value::String(replay_id.clone()))
            || record.get("sequence") != Some(&Value::String(sequence.to_string()))
        {
            return Err(TestCaseError::fail(
                "wire record changed an identity scope or decimal sequence",
            ));
        }
    }

    #[test]
    fn unicode_commits_keep_log_sequence_independent_from_editor_revision(
        identities in distinct_identities(),
        (sequence, result_revision) in independent_sequence_and_revision(),
        text in unicode_text(),
    ) {
        let context = EditorContext::default();
        let codec = LocalLogEntryJsonCodec::new(context.clone());
        let commit = unicode_commit(&context, &text, result_revision)?;
        if commit.base_revision() != Revision::new(result_revision - 1)
            || commit.revision() != Revision::new(result_revision)
        {
            return Err(TestCaseError::fail(
                "generated commit did not retain its requested full-u64 revisions",
            ));
        }
        if sequence == result_revision {
            return Err(TestCaseError::fail(
                "property fixture did not keep sequence and revision independent",
            ));
        }

        let original = entry(&identities, sequence, LocalLogEvent::commit(commit))?;
        let (_, decoded) = assert_codec_laws(&codec, &original)?;
        let decoded_commit = decoded
            .event()
            .as_commit()
            .ok_or_else(|| TestCaseError::fail("decoded ordinary event lost its commit"))?;
        if decoded.event_kind() != LocalLogEventKind::Commit
            || decoded.sequence().get() != sequence
            || decoded_commit.base_revision() != Revision::new(result_revision - 1)
            || decoded_commit.revision() != Revision::new(result_revision)
        {
            return Err(TestCaseError::fail(
                "codec coupled local-log sequence to editor-state revision",
            ));
        }
        let decoded_text = decoded_commit
            .after()
            .document()
            .node_at(&NodePath::try_from_indices(vec![0, 0]).map_err(test_failure)?)
            .map_err(test_failure)?
            .as_text()
            .ok_or_else(|| TestCaseError::fail("decoded commit has no generated text node"))?;
        if decoded_text.text() != text {
            return Err(TestCaseError::fail("codec changed generated Unicode commit text"));
        }
    }
}
