//! Transaction V4 structural persistence contracts.

use super::structural_codec_test_support::{
    TestResult, block, context, fixture, formats, heading, name, state,
};
use crate::{
    block::TextBlockKind,
    codec::{
        CodecErrorCode, CommitJsonCodecV3, EditorStateJsonCodecV3, SessionCheckpointJsonCodecV3,
        TransactionJsonCodec, TransactionJsonCodecV2, TransactionJsonCodecV3,
        TransactionJsonCodecV4, TransactionV4CodecError,
    },
    document::{Document, FormatSet, TextFragment, TextRun},
    operation::{Operation, TextBlockKindChange, TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

fn recontext(base: &EditorState, context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let document =
        Document::try_new(context.schema(), base.document().root().clone(), context.limits())?;
    Ok(EditorState::try_new(
        context,
        base.snapshot().lineage().clone(),
        document,
        base.selection().cloned(),
        base.pending_formats().cloned(),
    )?
    .with_checkpoint_revision(base.snapshot().revision()))
}

fn chain(base: &EditorState, ranks: &[u32]) -> Result<Transaction, Box<dyn Error>> {
    let mut shadow = EditorSession::new(base.clone());
    let mut operations = Vec::new();
    for rank in ranks {
        let target = if *rank == 0 { TextBlockKind::Paragraph } else { heading(*rank)? };
        let operation = Operation::TextBlockKindChange(TextBlockKindChange::capture(
            base.context(),
            shadow.state().document(),
            0..1,
            target,
        )?);
        shadow.apply_transaction(&Transaction::new(shadow.state(), vec![operation.clone()]))?;
        operations.push(operation);
    }
    Ok(Transaction::new(base, operations))
}

fn encoded() -> Result<(EditorState, TransactionJsonCodecV4, String), Box<dyn Error>> {
    let (context, base, _) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let json = codec.encode(&chain(&base, &[2, 4])?)?;
    Ok((base, codec, json))
}

#[test]
fn sequential_heading_requests_restore_exact_selection_pending_and_history_as_one_unit()
-> TestResult {
    let (context, base, _) = fixture()?;
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 3,
        affinity: Affinity::After,
    };
    let selection = Selection::Range(RangeSelection::new(point.clone(), point));
    let transaction = chain(&base, &[2, 4])?
        .with_selection_update(SelectionUpdate::Set(Some(selection.clone())))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats()?)))
        .with_metadata(TransactionMetadata::new(
            Some(name("example/heading")?),
            HistoryIntent::Record,
        ));
    let codec = TransactionJsonCodecV4::new(context.clone());
    assert_eq!(codec.context(), &context);
    let json = codec.encode(&transaction)?;
    let decoded = codec.decode(&json, &base)?;
    assert_eq!(decoded, transaction);
    assert_eq!(codec.encode(&decoded)?, json);
    let mut session = EditorSession::new(base.clone());
    let commit = session.apply_transaction(&decoded)?.into_commit().ok_or("commit")?;
    assert_eq!(commit.forward_operations().len(), 2);
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.state().selection(), Some(&selection));
    assert_eq!(session.state().pending_formats(), Some(&formats()?));
    let after = session.state().clone();
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), base.document());
    assert_eq!(session.state().selection(), base.selection());
    assert_eq!(session.state().pending_formats(), base.pending_formats());
    session.redo()?.ok_or("redo")?;
    assert_eq!(session.state().document(), after.document());
    assert_eq!(session.state().selection(), after.selection());
    assert_eq!(session.state().pending_formats(), after.pending_formats());
    assert!(CommitJsonCodecV3::new(context.clone()).encode(&commit).is_err());
    assert!(SessionCheckpointJsonCodecV3::new(context).encode(&session).is_err());
    Ok(())
}

#[test]
fn request_replays_from_an_independently_decoded_base_state() -> TestResult {
    let (base, codec, json) = encoded()?;
    let state_json = EditorStateJsonCodecV3::new(base.context().clone()).encode(&base)?;
    let context = context(DocumentLimits::default())?;
    let independent = EditorStateJsonCodecV3::new(context.clone()).decode(&state_json)?;
    assert_eq!(
        codec.decode(&json, &independent).err().ok_or("context mismatch")?.code(),
        CodecErrorCode::ContextMismatch
    );
    let reader = TransactionJsonCodecV4::new(context);
    let decoded = reader.decode(&json, &independent)?;
    assert_eq!(reader.encode(&decoded)?, json);
    let mut session = EditorSession::new(independent.clone());
    session.apply_transaction(&decoded)?;
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), independent.document());
    session.redo()?.ok_or("redo")?;
    Ok(())
}

#[test]
fn stale_snapshot_precedes_payload_reconstruction_and_never_changes_state() -> TestResult {
    let (base, codec, json) = encoded()?;
    let mut session = EditorSession::new(base.clone());
    session.apply_transaction(&chain(&base, &[1])?)?;
    let current = session.state().clone();
    let history = session.history_status();
    let mut altered: Value = serde_json::from_str(&json)?;
    altered["operations"] = json!([{"not":"a payload"}]);
    assert!(matches!(
        codec.decode(&altered.to_string(), &current),
        Err(TransactionV4CodecError::BaseSnapshotMismatch { .. })
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn late_stale_guard_rolls_back_the_entire_decoded_batch_and_preserves_redo() -> TestResult {
    let (context, base, operation) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let mut session = EditorSession::new(base.clone());
    session.apply_transaction(&Transaction::new(&base, vec![operation.clone()]))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    // Both guards describe a paragraph; after the first change the second must fail.
    let stale = Transaction::new(&current, vec![operation.clone(), operation]);
    let decoded = codec.decode(&codec.encode(&stale)?, &current)?;
    assert!(session.apply_transaction(&decoded).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo retained")?;
    Ok(())
}

#[test]
fn final_selection_failure_cannot_publish_successful_content_operations() -> TestResult {
    let (context, base, operation) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let missing = Point::Children {
        parent_path: NodePath::try_from_indices(vec![9])?,
        child_index: 0,
        affinity: Affinity::After,
    };
    let request = Transaction::new(&base, vec![operation]).with_selection_update(
        SelectionUpdate::Set(Some(RangeSelection::new(missing.clone(), missing).into())),
    );
    let decoded = codec.decode(&codec.encode(&request)?, &base)?;
    let mut session = EditorSession::new(base.clone());
    assert!(session.apply_transaction(&decoded).is_err());
    assert_eq!(session.state(), &base);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn operation_count_is_checked_before_any_owned_payload_and_first_excess_is_bounded() -> TestResult {
    let (context, initial, operation) = fixture()?;
    for maximum in [0, 1, 2] {
        let context = context.clone().with_max_operations_per_transaction(maximum);
        let base = recontext(&initial, &context)?;
        let codec = TransactionJsonCodecV4::new(context);
        let json = codec.encode(&Transaction::new(&base, vec![]))?;
        let mut value: Value = serde_json::from_str(&json)?;
        value["operations"] =
            Value::Array(vec![json!({"not":"a valid operation"}); usize::try_from(maximum)? + 1]);
        assert!(
            matches!(codec.decode(&value.to_string(), &base), Err(TransactionV4CodecError::OperationLimit { actual, maximum: cap }) if actual == u64::from(maximum) + 1 && cap == maximum)
        );
        let too_many =
            Transaction::new(&base, vec![operation.clone(); usize::try_from(maximum)? + 1]);
        assert!(matches!(
            codec.encode(&too_many),
            Err(TransactionV4CodecError::OperationLimit { .. })
        ));
        let admitted = chain(&base, &vec![2; usize::try_from(maximum)?])?;
        assert_eq!(codec.decode(&codec.encode(&admitted)?, &base)?, admitted);
    }
    Ok(())
}

#[test]
fn indexed_payload_errors_do_not_turn_into_generic_serialization_failures() -> TestResult {
    let (base, codec, encoded) = encoded()?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["operations"][1]["replacement"][0]["level"] = json!(7);
    assert!(matches!(
        codec.decode(&value.to_string(), &base),
        Err(TransactionV4CodecError::OperationPayload { operation_index: 1, .. })
    ));
    let malformed = Operation::TextBlockKindChange(TextBlockKindChange::try_new(
        0,
        vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
        vec![heading(1)?],
    )?);
    let base_context =
        EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let base = state(
        &base_context,
        vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
        None,
        None,
    )?;
    let codec = TransactionJsonCodecV4::new(base_context);
    assert!(matches!(
        codec.encode(&Transaction::new(&base, vec![malformed])),
        Err(TransactionV4CodecError::OperationPayload { operation_index: 0, .. })
    ));
    Ok(())
}

#[test]
fn exact_json_byte_limits_apply_symmetrically() -> TestResult {
    let (base, codec, encoded) = encoded()?;
    let request = codec.decode(&encoded, &base)?;
    for difference in [0, 1] {
        let context = EditorContext::new(
            base.context().schema().clone(),
            DocumentLimits::default().with_max_json_bytes(encoded.len() - difference),
        );
        let rebound = recontext(&base, &context)?;
        let codec = TransactionJsonCodecV4::new(context);
        let request = Transaction::new(&rebound, request.operations().to_vec());
        if difference == 0 {
            assert_eq!(codec.encode(&request)?, encoded);
            assert_eq!(codec.decode(&encoded, &rebound)?, request);
        } else {
            assert!(matches!(
                codec.encode(&request),
                Err(TransactionV4CodecError::OutputTooLarge { .. })
            ));
            assert!(matches!(
                codec.decode(&encoded, &rebound),
                Err(TransactionV4CodecError::InputTooLarge { .. })
            ));
        }
    }
    Ok(())
}

#[test]
fn malformed_outer_fields_versions_and_nested_operation_envelopes_are_rejected() -> TestResult {
    let (base, codec, encoded) = encoded()?;
    for malformed in [
        encoded.replacen('{', "{\"unknown\":0,", 1),
        encoded.replace("\"formatVersion\":4", "\"formatVersion\":4,\"formatVersion\":4"),
        encoded.replace("\"formatVersion\":4", "\"formatVersion\":3"),
        encoded.replace("\"revision\":\"0\"", "\"revision\":0"),
        encoded.replace("\"revision\":\"0\"", "\"revision\":\"00\""),
        encoded.replace("\"level\":4", "\"level\":4,\"level\":4"),
    ] {
        assert!(codec.decode(&malformed, &base).is_err());
    }
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["operations"][0] = json!({"format":"breditor/operation","formatVersion":4,"operation":value["operations"][0].clone()});
    assert!(codec.decode(&value.to_string(), &base).is_err());
    assert!(TransactionJsonCodec::new(base.context().clone()).decode(&encoded, &base).is_err());
    assert!(TransactionJsonCodecV2::new(base.context().clone()).decode(&encoded, &base).is_err());
    assert!(TransactionJsonCodecV3::new(base.context().clone()).decode(&encoded, &base).is_err());
    Ok(())
}

#[test]
fn schema_binding_admission_precedes_operation_count_and_payload_checks() -> TestResult {
    let (base, codec, encoded) = encoded()?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["schemaFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    value["operations"] = json!({"not":"an array"});
    assert_eq!(
        codec.decode(&value.to_string(), &base).err().ok_or("binding mismatch")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    Ok(())
}

#[test]
fn empty_and_state_only_requests_keep_existing_noop_and_redo_semantics() -> TestResult {
    let (context, base, operation) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let empty = Transaction::new(&base, vec![]);
    let decoded = codec.decode(&codec.encode(&empty)?, &base)?;
    let mut session = EditorSession::new(base.clone());
    assert!(session.apply_transaction(&decoded)?.is_unchanged());
    assert_eq!(session.state(), &base);
    session.apply_transaction(&Transaction::new(&base, vec![operation]))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let state_only = Transaction::new(&current, vec![])
        .with_pending_formats_update(PendingFormatsUpdate::Set(None));
    let decoded = codec.decode(&codec.encode(&state_only)?, &current)?;
    session.apply_transaction(&decoded)?;
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 1);
    assert_eq!(session.state().pending_formats(), None);
    session.redo()?.ok_or("retained redo")?;
    Ok(())
}

#[test]
fn merge_and_ignore_metadata_retain_existing_history_laws() -> TestResult {
    let (context, base, _) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let mut session = EditorSession::new(base.clone());
    for rank in [1, 2] {
        let request = chain(session.state(), &[rank])?.with_metadata(TransactionMetadata::new(
            None,
            HistoryIntent::Merge { group: name("example/heading-group")? },
        ));
        let decoded = codec.decode(&codec.encode(&request)?, session.state())?;
        session.apply_transaction(&decoded)?;
    }
    assert_eq!(session.undo_depth(), 1);
    session.undo()?.ok_or("merged undo")?;
    assert_eq!(session.state().document(), base.document());
    let ignored = chain(session.state(), &[3])?
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Ignore));
    let decoded = codec.decode(&codec.encode(&ignored)?, session.state())?;
    session.apply_transaction(&decoded)?;
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 0);
    Ok(())
}

#[test]
fn legacy_paragraph_requests_only_change_the_explicit_envelope_version() -> TestResult {
    let context = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let base = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "", FormatSet::default())?],
        None,
        None,
    )?;
    let operation = Operation::from(TextSplice::try_new(
        TextRange::try_new(
            NodePath::try_from_indices(vec![0])?,
            TextOffset::ZERO,
            TextOffset::ZERO,
        )?,
        TextFragment::empty(),
        TextFragment::try_from_runs(vec![TextRun::try_new("x", FormatSet::default())?])?,
    )?);
    let request = Transaction::new(&base, vec![operation]);
    let old = TransactionJsonCodecV3::new(context.clone()).encode(&request)?;
    let codec = TransactionJsonCodecV4::new(context);
    let current = codec.encode(&request)?;
    assert_eq!(current.replacen("\"formatVersion\":4", "\"formatVersion\":3", 1), old);
    assert_eq!(codec.decode(&current, &base)?, request);
    assert!(codec.decode(&old, &base).is_err());
    Ok(())
}

#[test]
fn later_result_budget_failure_rolls_back_preceding_valid_edits() -> TestResult {
    let context = context(DocumentLimits::default().with_max_property_values(1))?;
    let base = state(
        &context,
        vec![
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        ],
        None,
        None,
    )?;
    let operations = (0..2)
        .map(|start| {
            TextBlockKindChange::capture(
                &context,
                base.document(),
                start..start + 1,
                TextBlockKind::Heading(crate::block::HeadingLevel::try_new(1)?),
            )
            .map(Operation::TextBlockKindChange)
            .map_err(Into::into)
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    let request = Transaction::new(&base, operations);
    let codec = TransactionJsonCodecV4::new(context);
    let decoded = codec.decode(&codec.encode(&request)?, &base)?;
    let mut session = EditorSession::new(base.clone());
    assert!(session.apply_transaction(&decoded).is_err());
    assert_eq!(session.state(), &base);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn invalid_pending_format_properties_fail_decode_and_incompatible_selection_fails_atomically()
-> TestResult {
    let (context, base, _) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let request = chain(&base, &[2])?
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats()?)));
    let mut value: Value = serde_json::from_str(&codec.encode(&request)?)?;
    value["pendingFormatsUpdate"]["formats"][1]["properties"]["example/href"] = json!(17);
    assert!(codec.decode(&value.to_string(), &base).is_err());
    let selection = RangeSelection::new(
        Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 0,
            affinity: Affinity::Before,
        },
        Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 3,
            affinity: Affinity::After,
        },
    );
    let incompatible = request.with_selection_update(SelectionUpdate::Set(Some(selection.into())));
    let decoded = codec.decode(&codec.encode(&incompatible)?, &base)?;
    let mut session = EditorSession::new(base.clone());
    assert!(session.apply_transaction(&decoded).is_err());
    assert_eq!(session.state(), &base);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn net_zero_heading_batch_remains_one_content_history_event() -> TestResult {
    let (context, base, _) = fixture()?;
    let codec = TransactionJsonCodecV4::new(context);
    let request = chain(&base, &[1, 0])?;
    let decoded = codec.decode(&codec.encode(&request)?, &base)?;
    let mut session = EditorSession::new(base.clone());
    let commit = session.apply_transaction(&decoded)?.into_commit().ok_or("content event")?;
    assert_eq!(commit.forward_operations().len(), 2);
    assert_eq!(session.state().document(), base.document());
    assert_ne!(session.state().snapshot(), base.snapshot());
    assert_eq!(session.undo_depth(), 1);
    session.undo()?.ok_or("net-zero undo")?;
    session.redo()?.ok_or("net-zero redo")?;
    assert_eq!(session.state().document(), base.document());
    Ok(())
}

proptest! {
    #[test]
    fn randomized_transaction_v4_batches_match_direct_execution_and_exact_history(ranks in prop::collection::vec(0_u32..=6, 0..12)) {
        let result = (|| -> TestResult {
            let (context, base, _) = fixture()?;
            let request = chain(&base, &ranks)?;
            let codec = TransactionJsonCodecV4::new(context);
            let encoded = codec.encode(&request)?;
            let decoded = codec.decode(&encoded, &base)?;
            assert_eq!(decoded, request);
            assert_eq!(codec.encode(&decoded)?, encoded);
            let mut direct = EditorSession::new(base.clone());
            let mut replayed = EditorSession::new(base.clone());
            let expected = direct.apply_transaction(&request)?;
            let observed = replayed.apply_transaction(&decoded)?;
            assert_eq!(observed, expected);
            assert_eq!(replayed.state(), direct.state());
            if !observed.is_unchanged() {
                assert_eq!(replayed.undo_depth(), 1);
                let after = replayed.state().clone();
                replayed.undo()?.ok_or("undo")?;
                assert_eq!(replayed.state().document(), base.document());
                assert_eq!(replayed.state().selection(), base.selection());
                assert_eq!(replayed.state().pending_formats(), base.pending_formats());
                replayed.redo()?.ok_or("redo")?;
                assert_eq!(replayed.state().document(), after.document());
            }
            Ok(())
        })();
        result.map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
