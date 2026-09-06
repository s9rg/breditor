//! Bounded property laws for the complete local-log-checkpoint JSON boundary.

mod support;

use std::{
    error::Error,
    fmt::Display,
    panic::{AssertUnwindSafe, catch_unwind},
};

use breditor_core::{
    codec::{
        DocumentJsonCodec, LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec,
        LocalLogCheckpointTopologyErrorCode,
    },
    document::{FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits,
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogRecovery, LocalLogRecoveryError,
        LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{HistoryIntent, Transaction, TransactionMetadata},
};
use proptest::{
    collection::{btree_set, vec},
    prelude::{Strategy, any},
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use serde_json::Value;
use support::{document_json, paragraph, path, test_error, text_node};

fn property_config() -> Config {
    let mut config = Config::with_failure_persistence(FileFailurePersistence::Direct(
        "tests/local_log_checkpoint_json_properties.proptest-regressions",
    ));
    config.cases = 64;
    config.max_shrink_iters = 2_048;
    config
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn fail(message: impl Into<String>) -> TestCaseError {
    TestCaseError::fail(message.into())
}

fn replay_id_strategy(minimum: usize) -> impl Strategy<Value = Vec<String>> {
    btree_set(any::<u16>(), minimum..9).prop_map(|values| {
        // Reverse a zero-padded lexical ordering so the codec cannot accidentally
        // reconstruct chronology by its internal ReplayId-keyed map order.
        values.into_iter().rev().map(|value| format!("request:{value:05}")).collect()
    })
}

fn arbitrary_json_text() -> impl Strategy<Value = String> {
    vec(any::<char>(), 0..512).prop_map(|characters| characters.into_iter().collect::<String>())
}

fn initial_state(context: &EditorContext, suffix: u16) -> Result<EditorState, TestCaseError> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node("base", false)])]))
        .map_err(test_failure)?;
    EditorState::try_new(
        context,
        LineageId::try_new(format!("local-log-checkpoint-json-property:{suffix}"))
            .map_err(test_failure)?,
        document,
        None,
        None,
    )
    .map_err(test_failure)
}

fn insertion(state: &EditorState, text: &str) -> Result<Transaction, TestCaseError> {
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

fn sequence(index: usize) -> Result<LocalLogSequence, TestCaseError> {
    let value = u64::try_from(index)
        .map_err(test_failure)?
        .checked_add(1)
        .ok_or_else(|| fail("generated replay sequence overflowed"))?;
    LocalLogSequence::try_new(value).map_err(test_failure)
}

fn checkpoint_fixture(
    replay_ids: &[String],
    lineage_suffix: u16,
) -> Result<(LocalLogCheckpointJsonCodec, LocalLogCheckpointAnchor), TestCaseError> {
    let context = EditorContext::default();
    let initial = initial_state(&context, lineage_suffix)?;
    let session_id =
        LocalSessionId::try_new("session:checkpoint-json-property").map_err(test_failure)?;
    let checkpoint_log_id =
        LocalLogId::try_new("log:checkpoint-json-property:sealed").map_err(test_failure)?;
    let successor_log_id =
        LocalLogId::try_new("log:checkpoint-json-property:successor").map_err(test_failure)?;
    let binding = LocalLogCheckpointBinding::try_new(
        session_id.clone(),
        checkpoint_log_id.clone(),
        successor_log_id.clone(),
    )
    .map_err(test_failure)?;

    let mut producer = EditorSession::new(initial.clone());
    let mut entries = Vec::with_capacity(replay_ids.len());
    for (index, replay_id) in replay_ids.iter().enumerate() {
        let before = producer.state().clone();
        let transaction = insertion(&before, "x")?;
        let commit = producer
            .apply_transaction(&transaction)
            .map_err(test_failure)?
            .into_commit()
            .ok_or_else(|| fail("generated insertion was unexpectedly unchanged"))?;
        entries.push(LocalLogEntry::new(
            session_id.clone(),
            checkpoint_log_id.clone(),
            sequence(index)?,
            ReplayId::try_new(replay_id.clone()).map_err(test_failure)?,
            LocalLogEvent::commit(commit),
        ));
    }

    let recovered = LocalLogRecovery::new(session_id, checkpoint_log_id)
        .recover(EditorSession::new(initial), entries)
        .map_err(test_failure)?;
    let anchor = recovered
        .try_into_checkpoint_anchor(successor_log_id, LocalLogCompactionLimits::default())
        .map_err(test_failure)?;
    Ok((LocalLogCheckpointJsonCodec::new(context, binding), anchor))
}

fn assert_replay_mapping(
    anchor: &LocalLogCheckpointAnchor,
    replay_ids: &[String],
) -> Result<(), TestCaseError> {
    let expected_count = u64::try_from(replay_ids.len()).map_err(test_failure)?;
    if anchor.compacted_replay_count() != expected_count {
        return Err(fail("checkpoint changed the complete replay tombstone count"));
    }
    for (index, replay_id) in replay_ids.iter().enumerate() {
        let replay_id = ReplayId::try_new(replay_id.clone()).map_err(test_failure)?;
        if anchor.compacted_sequence_for_replay_id(&replay_id) != Some(sequence(index)?) {
            return Err(fail("checkpoint changed a replay ID's chronological sequence"));
        }
    }
    Ok(())
}

fn replay_tombstones(record: &Value) -> Result<Vec<String>, TestCaseError> {
    record
        .get("replayTombstones")
        .and_then(Value::as_array)
        .ok_or_else(|| fail("encoded checkpoint had no replayTombstones array"))?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(ToOwned::to_owned)
                .ok_or_else(|| fail("encoded replay tombstone was not a string"))
        })
        .collect()
}

fn assert_count_mismatch(error: &LocalLogCheckpointCodecError) -> Result<(), TestCaseError> {
    let LocalLogCheckpointCodecError::InvalidTopology(source) = error else {
        return Err(fail(format!("frontier mutation returned an unexpected error: {error}")));
    };
    if source.code() != LocalLogCheckpointTopologyErrorCode::TombstoneCountMismatch {
        return Err(fail("frontier mutation returned the wrong topology subcode"));
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn generated_small_prefixes_round_trip_canonically_with_exact_replay_sequences(
        replay_ids in replay_id_strategy(0),
        lineage_suffix in any::<u16>(),
    ) {
        let (codec, anchor) = checkpoint_fixture(&replay_ids, lineage_suffix)?;
        assert_replay_mapping(&anchor, &replay_ids)?;

        let encoded = codec.encode(&anchor).map_err(test_failure)?;
        if codec.encode(&anchor).map_err(test_failure)? != encoded {
            return Err(fail("repeated checkpoint encoding changed canonical bytes"));
        }
        let record: Value = serde_json::from_str(&encoded).map_err(test_failure)?;
        if replay_tombstones(&record)? != replay_ids {
            return Err(fail("wire tombstones followed key order instead of chronological order"));
        }

        let decoded = codec.decode(&encoded).map_err(test_failure)?;
        assert_replay_mapping(&decoded, &replay_ids)?;
        if codec.encode(&decoded).map_err(test_failure)? != encoded {
            return Err(fail("decode changed canonical checkpoint bytes"));
        }
    }

    #[test]
    fn reordered_nonlexicographic_tombstones_define_and_preserve_chronological_mapping(
        replay_ids in replay_id_strategy(2),
        rotation_seed in any::<u8>(),
        lineage_suffix in any::<u16>(),
    ) {
        let (codec, anchor) = checkpoint_fixture(&replay_ids, lineage_suffix)?;
        let encoded = codec.encode(&anchor).map_err(test_failure)?;
        let mut record: Value = serde_json::from_str(&encoded).map_err(test_failure)?;
        let tombstones = record
            .get_mut("replayTombstones")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| fail("encoded checkpoint had no replayTombstones array"))?;
        let rotation = usize::from(rotation_seed) % tombstones.len();
        tombstones.rotate_left(rotation);
        tombstones.reverse();
        let expected_order = tombstones
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .map(ToOwned::to_owned)
                    .ok_or_else(|| fail("mutated tombstone was not a string"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let reordered = serde_json::to_string(&record).map_err(test_failure)?;

        let decoded = codec.decode(&reordered).map_err(test_failure)?;
        assert_replay_mapping(&decoded, &expected_order)?;
        let canonical: Value =
            serde_json::from_str(&codec.encode(&decoded).map_err(test_failure)?)
                .map_err(test_failure)?;
        if replay_tombstones(&canonical)? != expected_order {
            return Err(fail("re-encoding lost the reordered chronological mapping"));
        }
    }

    #[test]
    fn frontier_and_tombstone_count_mutations_are_rejected_without_poisoning_the_codec(
        replay_ids in replay_id_strategy(1),
        mutation in any::<u8>(),
        lineage_suffix in any::<u16>(),
    ) {
        let (codec, anchor) = checkpoint_fixture(&replay_ids, lineage_suffix)?;
        let canonical = codec.encode(&anchor).map_err(test_failure)?;
        let mut record: Value = serde_json::from_str(&canonical).map_err(test_failure)?;
        match mutation % 4 {
            0 => {
                record["coveredThrough"] =
                    Value::String((u64::try_from(replay_ids.len()).map_err(test_failure)? + 1).to_string());
            }
            1 => {
                let tombstones = record["replayTombstones"]
                    .as_array_mut()
                    .ok_or_else(|| fail("encoded checkpoint had no replayTombstones array"))?;
                let _ = tombstones.pop();
            }
            2 => {
                record["replayTombstones"]
                    .as_array_mut()
                    .ok_or_else(|| fail("encoded checkpoint had no replayTombstones array"))?
                    .push(Value::String("request:mutation-extra".to_owned()));
            }
            _ => record["coveredThrough"] = Value::Null,
        }
        let mutated = serde_json::to_string(&record).map_err(test_failure)?;
        let Err(error) = codec.decode(&mutated) else {
            return Err(fail("a mismatched frontier and tombstone count decoded successfully"));
        };
        assert_count_mismatch(&error)?;

        let restored = codec.decode(&canonical).map_err(test_failure)?;
        assert_replay_mapping(&restored, &replay_ids)?;
        if codec.encode(&restored).map_err(test_failure)? != canonical {
            return Err(fail("codec did not remain reusable after a topology failure"));
        }
    }

    #[test]
    fn arbitrary_json_never_panics_and_failures_do_not_poison_later_decode(
        candidate in arbitrary_json_text(),
        lineage_suffix in any::<u16>(),
    ) {
        let replay_ids = vec!["request:known-good".to_owned()];
        let (codec, anchor) = checkpoint_fixture(&replay_ids, lineage_suffix)?;
        let canonical = codec.encode(&anchor).map_err(test_failure)?;

        if catch_unwind(AssertUnwindSafe(|| codec.decode(&candidate))).is_err() {
            return Err(fail("arbitrary JSON panicked the checkpoint decoder"));
        }
        if codec
            .decode(r#"{"format":"breditor/local-log-checkpoint","formatVersion":1}"#)
            .is_ok()
        {
            return Err(fail("forced malformed checkpoint unexpectedly decoded"));
        }
        let restored = codec.decode(&canonical).map_err(test_failure)?;
        assert_replay_mapping(&restored, &replay_ids)?;
    }
}

#[test]
fn helper_fixture_remains_a_public_api_black_box() -> Result<(), Box<dyn Error>> {
    let replay_ids = vec!["request:z".to_owned(), "request:a".to_owned(), "request:m".to_owned()];
    let (codec, anchor) = checkpoint_fixture(&replay_ids, 0).map_err(|error| error.to_string())?;
    let decoded = codec.decode(&codec.encode(&anchor)?)?;
    for (index, replay_id) in replay_ids.iter().enumerate() {
        assert_eq!(
            decoded.compacted_sequence_for_replay_id(&ReplayId::try_new(replay_id.clone())?),
            Some(LocalLogSequence::try_new(u64::try_from(index)? + 1)?),
        );
    }
    Ok(())
}

#[test]
fn same_binding_session_splice_is_structurally_valid_but_not_a_causal_proof()
-> Result<(), Box<dyn Error>> {
    let first_ids = vec![String::from("request:first-history")];
    let second_ids = vec![String::from("request:second-history")];
    let (codec, first_anchor) =
        checkpoint_fixture(&first_ids, 11).map_err(|error| error.to_string())?;
    let (second_codec, second_anchor) =
        checkpoint_fixture(&second_ids, 12).map_err(|error| error.to_string())?;
    let mut first_record: Value = serde_json::from_str(&codec.encode(&first_anchor)?)?;
    let second_record: Value = serde_json::from_str(&second_codec.encode(&second_anchor)?)?;
    first_record["sessionCheckpoint"] = second_record["sessionCheckpoint"].clone();

    let spliced = codec.decode(&serde_json::to_string(&first_record)?)?;
    assert_eq!(
        spliced.compacted_sequence_for_replay_id(&ReplayId::try_new(&first_ids[0])?),
        Some(LocalLogSequence::FIRST)
    );
    assert_eq!(spliced.session().state().snapshot(), second_anchor.session().state().snapshot());
    assert_eq!(spliced.session().state().document(), second_anchor.session().state().document());
    assert_eq!(spliced.session().state().selection(), second_anchor.session().state().selection());
    assert_eq!(
        spliced.session().state().pending_formats(),
        second_anchor.session().state().pending_formats()
    );
    assert_ne!(spliced.session().state().context(), second_anchor.session().state().context());
    assert_ne!(spliced.session().state(), first_anchor.session().state());

    // Extending and compacting a structurally decoded anchor must preserve,
    // not silently upgrade, the provenance level inherited from that decode.
    let mut spliced_producer = EditorSession::new(spliced.session().state().clone());
    let successor_transaction =
        insertion(spliced_producer.state(), "after-splice").map_err(|error| error.to_string())?;
    let successor_commit = spliced_producer
        .apply_transaction(&successor_transaction)?
        .into_commit()
        .ok_or_else(|| test_error("successor insertion was unexpectedly unchanged"))?;

    let mut causal_first_producer = EditorSession::new(first_anchor.session().state().clone());
    let causal_first_transaction = insertion(causal_first_producer.state(), "after-splice")
        .map_err(|error| error.to_string())?;
    causal_first_producer
        .apply_transaction(&causal_first_transaction)?
        .into_commit()
        .ok_or_else(|| test_error("causal comparison insertion was unexpectedly unchanged"))?;

    let session_id = LocalSessionId::try_new("session:checkpoint-json-property")?;
    let first_log = LocalLogId::try_new("log:checkpoint-json-property:successor")?;
    let second_log = LocalLogId::try_new("log:checkpoint-json-property:after-splice")?;
    let new_replay = ReplayId::try_new("request:after-splice")?;
    let continued = spliced.recover_successor(
        vec![LocalLogEntry::new(
            session_id.clone(),
            first_log.clone(),
            LocalLogSequence::try_new(2)?,
            new_replay.clone(),
            LocalLogEvent::commit(successor_commit),
        )],
        LocalLogRecoveryLimits::default(),
    )?;
    let rotated = continued.try_into_checkpoint_anchor(second_log.clone())?;
    let rotated_codec = LocalLogCheckpointJsonCodec::new(
        codec.context().clone(),
        LocalLogCheckpointBinding::try_new(session_id.clone(), first_log, second_log.clone())?,
    );
    let rotated_json = rotated_codec.encode(&rotated)?;
    let restored = rotated_codec.decode(&rotated_json)?;

    let inherited_replay = ReplayId::try_new(&first_ids[0])?;
    assert_eq!(
        restored.compacted_sequence_for_replay_id(&inherited_replay),
        Some(LocalLogSequence::FIRST)
    );
    assert_eq!(
        restored.compacted_sequence_for_replay_id(&new_replay),
        Some(LocalLogSequence::try_new(2)?)
    );
    assert_eq!(restored.session().state(), spliced_producer.state());
    assert_ne!(restored.session().state(), causal_first_producer.state());

    // Both the inherited structural tombstone and the newly proved tombstone
    // retain exact fail-closed replay membership after another durable round.
    for (replay_id, expected_sequence) in
        [(inherited_replay, LocalLogSequence::FIRST), (new_replay, LocalLogSequence::try_new(2)?)]
    {
        let owner = rotated_codec.decode(&rotated_json)?;
        let error = owner
            .recover_successor(
                vec![LocalLogEntry::new(
                    session_id.clone(),
                    second_log.clone(),
                    LocalLogSequence::try_new(3)?,
                    replay_id,
                    LocalLogEvent::close_history_group(),
                )],
                LocalLogRecoveryLimits::new(1, 0, 0),
            )
            .err()
            .ok_or_else(|| test_error("a compacted replay ID was unexpectedly accepted"))?;
        assert!(matches!(
            error,
            LocalLogRecoveryError::CompactedReplayId {
                checkpoint_sequence,
                ..
            } if checkpoint_sequence == expected_sequence
        ));
    }
    Ok(())
}
