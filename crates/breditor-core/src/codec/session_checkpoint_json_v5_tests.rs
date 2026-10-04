//! Complete structural history persistence, admission and replay contracts.

use super::structural_codec_test_support::{
    TestResult, block, context, formats, heading, name, state,
};
use crate::{
    block::TextBlockKind,
    codec::{
        CodecErrorCode, SessionCheckpointCodecError, SessionCheckpointJsonCodec,
        SessionCheckpointJsonCodecV2, SessionCheckpointJsonCodecV3, SessionCheckpointJsonCodecV5,
        SessionCheckpointLimits, SessionCheckpointReplayDirection, SessionCheckpointV5CodecError,
    },
    document::FormatSet,
    operation::{Operation, TextBlockKindChange},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

fn caret(offset: u32) -> Result<Selection, Box<dyn Error>> {
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: offset,
        affinity: Affinity::After,
    };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn base(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    state(
        context,
        vec![block(TextBlockKind::Paragraph, "a🙂e\u{301}", formats()?)?],
        caret(1)?,
        Some(formats()?),
    )
}

fn request(base: &EditorState, rank: u32) -> Result<Transaction, Box<dyn Error>> {
    let target = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
    let operation = TextBlockKindChange::capture(base.context(), base.document(), 0..1, target)?;
    Ok(Transaction::new(base, vec![Operation::TextBlockKindChange(operation)]))
}

fn session(context: &EditorContext, ranks: &[u32]) -> Result<EditorSession, Box<dyn Error>> {
    let mut session = EditorSession::new(base(context)?);
    for rank in ranks {
        session.apply_transaction(&request(session.state(), *rank)?)?;
    }
    Ok(session)
}

fn same_values(left: &EditorState, right: &EditorState) {
    assert_eq!(left.snapshot().lineage(), right.snapshot().lineage());
    assert_eq!(left.document(), right.document());
    assert_eq!(left.selection(), right.selection());
    assert_eq!(left.pending_formats(), right.pending_formats());
}

#[test]
fn every_cursor_restores_in_an_independent_context_with_exact_bidirectional_values() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    assert_eq!(codec.context(), &context);
    assert_eq!(codec.limits(), &SessionCheckpointLimits::default());
    for undo_count in 0..=3 {
        let mut original = session(&context, &[1, 4, 0])?;
        for _ in 0..undo_count {
            original.undo()?.ok_or("undo")?;
        }
        let encoded = codec.encode(&original)?;
        let independent = super::structural_codec_test_support::context(DocumentLimits::default())?;
        let reader = SessionCheckpointJsonCodecV5::new(independent);
        let mut restored = reader.decode(&encoded)?;
        same_values(restored.state(), original.state());
        assert_eq!(restored.state().snapshot(), original.state().snapshot());
        assert_eq!(restored.undo_depth(), original.undo_depth());
        assert_eq!(restored.redo_depth(), original.redo_depth());
        assert_eq!(reader.encode(&restored)?, encoded);
        assert!(codec.encode(&restored).is_err());
        while original.can_undo() {
            original.undo()?.ok_or("source undo")?;
            restored.undo()?.ok_or("restored undo")?;
            same_values(restored.state(), original.state());
        }
        while original.can_redo() {
            original.redo()?.ok_or("source redo")?;
            restored.redo()?.ok_or("restored redo")?;
            same_values(restored.state(), original.state());
        }
        assert_eq!(reader.encode(&restored)?, codec.encode(&original)?);
    }
    Ok(())
}

#[test]
fn explicit_editor_value_changes_are_restored_at_each_history_boundary() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let initial = base(&context)?;
    let mut source = EditorSession::new(initial.clone());
    let first = request(source.state(), 2)?
        .with_selection_update(SelectionUpdate::Set(Some(caret(3)?)))
        .with_pending_formats_update(PendingFormatsUpdate::Set(None));
    source.apply_transaction(&first)?;
    let middle = source.state().clone();
    let second = request(source.state(), 5)?
        .with_selection_update(SelectionUpdate::Set(Some(caret(4)?)))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats()?)));
    source.apply_transaction(&second)?;
    let last = source.state().clone();
    source.undo()?.ok_or("undo")?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    same_values(restored.state(), &middle);
    restored.undo()?.ok_or("initial")?;
    same_values(restored.state(), &initial);
    restored.redo()?.ok_or("middle")?;
    restored.redo()?.ok_or("last")?;
    same_values(restored.state(), &last);
    Ok(())
}

#[test]
fn open_merge_group_continues_after_restore_and_redo_branch_can_be_replaced() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let mut source = session(&context, &[])?;
    let group =
        TransactionMetadata::new(None, HistoryIntent::Merge { group: name("example/heading")? });
    source.apply_transaction(&request(source.state(), 1)?.with_metadata(group.clone()))?;
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    restored.apply_transaction(&request(restored.state(), 2)?.with_metadata(group))?;
    assert_eq!(restored.undo_depth(), 1);
    restored.undo()?.ok_or("merged undo")?;
    same_values(restored.state(), &base(&context)?);
    restored.apply_transaction(&request(restored.state(), 6)?)?;
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 0);
    let encoded = codec.encode(&restored)?;
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);
    Ok(())
}

#[test]
fn capacity_eviction_retains_the_correct_heading_base() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source =
        EditorSession::with_history_capacity(base(&context)?, HistoryCapacity::try_new(2)?);
    let mut first = None;
    for rank in [1, 2, 3] {
        source.apply_transaction(&request(source.state(), rank)?)?;
        if rank == 1 {
            first = Some(source.state().clone());
        }
    }
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    assert_eq!(restored.history_capacity().get(), 2);
    assert_eq!(restored.undo_depth(), 2);
    restored.undo()?.ok_or("undo")?;
    restored.undo()?.ok_or("undo")?;
    same_values(restored.state(), &first.ok_or("first")?);
    assert!(restored.undo()?.is_none());
    Ok(())
}

#[test]
fn stale_guard_in_a_future_redo_entry_is_rejected_before_a_session_is_returned() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = session(&context, &[1, 2])?;
    source.undo()?.ok_or("undo")?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    value["entries"][1]["forwardOperations"][0]["expected"]["children"][0]["children"][0]["text"] =
        json!("different");
    let error = codec.decode(&value.to_string()).err().ok_or("must reject")?;
    assert!(matches!(error, SessionCheckpointV5CodecError::InvalidCheckpoint(source)
        if matches!(source.as_ref(), SessionCheckpointCodecError::Apply(error)
            if error.entry_index() == 1 && error.operation_index() == Some(0)
            && error.direction() == SessionCheckpointReplayDirection::Forward)));
    assert_eq!(source.undo_depth(), 1);
    assert_eq!(source.redo_depth(), 1);
    Ok(())
}

#[test]
fn payload_errors_keep_both_history_and_operation_indexes() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1, 2])?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    value["entries"][1]["forwardOperations"][0]["replacement"][0]["level"] = json!(7);
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(SessionCheckpointV5CodecError::OperationPayload {
            entry_index: 1,
            operation_index: 0,
            ..
        })
    ));
    Ok(())
}

#[test]
fn aggregate_count_is_admitted_before_payloads_or_history_base_are_materialized() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1, 2])?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let encoded = codec.encode(&source)?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["historyBase"] = json!(null);
    value["entries"][0]["forwardOperations"] = json!([{"invalid":"payload"}]);
    let limited = SessionCheckpointJsonCodecV5::new(context)
        .with_limits(SessionCheckpointLimits::default().with_max_aggregate_forward_operations(1));
    assert_eq!(
        limited.decode(&value.to_string()).err().ok_or("count limit")?.code(),
        CodecErrorCode::ResourceLimit
    );
    assert_eq!(
        limited.encode(&source).err().ok_or("encode limit")?.code(),
        CodecErrorCode::ResourceLimit
    );
    Ok(())
}

#[test]
fn exact_aggregate_retained_budgets_include_heading_properties_and_pending_formats() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1, 2])?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let encoded = codec.encode(&source)?;
    // Three 3-node boundaries, each with the same text and two link values
    // (document plus pending formats). Only the two result roots have a rank.
    let property_bytes = u64::try_from("https://example.com/🙂".len())? * 6;
    let text_bytes = u64::try_from("a🙂e\u{301}".len())? * 3;
    let exact = SessionCheckpointLimits::default()
        .with_max_aggregate_forward_operations(2)
        .with_max_retained_nodes(9)
        .with_max_retained_text_bytes(text_bytes)
        .with_max_retained_property_values(8)
        .with_max_retained_property_string_bytes(property_bytes);
    let exact_codec = SessionCheckpointJsonCodecV5::new(context.clone()).with_limits(exact);
    assert_eq!(exact_codec.encode(&source)?, encoded);
    assert_eq!(exact_codec.decode(&encoded)?.state(), source.state());
    for limits in [
        exact.with_max_aggregate_forward_operations(1),
        exact.with_max_retained_nodes(8),
        exact.with_max_retained_text_bytes(text_bytes - 1),
        exact.with_max_retained_property_values(7),
        exact.with_max_retained_property_string_bytes(property_bytes - 1),
    ] {
        let limited = SessionCheckpointJsonCodecV5::new(context.clone()).with_limits(limits);
        assert_eq!(
            limited.encode(&source).err().ok_or("encode budget")?.code(),
            CodecErrorCode::ResourceLimit
        );
        assert_eq!(
            limited.decode(&encoded).err().ok_or("decode budget")?.code(),
            CodecErrorCode::ResourceLimit
        );
    }
    Ok(())
}

#[test]
fn exact_json_byte_boundary_is_symmetric() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1, 2])?;
    let encoded = SessionCheckpointJsonCodecV5::new(context.clone()).encode(&source)?;
    for delta in [0, 1] {
        let bounded = EditorContext::new(
            context.schema().clone(),
            DocumentLimits::default().with_max_json_bytes(encoded.len() - delta),
        );
        let source = session(&bounded, &[1, 2])?;
        let codec = SessionCheckpointJsonCodecV5::new(bounded);
        if delta == 0 {
            assert_eq!(codec.encode(&source)?, encoded);
            assert_eq!(codec.decode(&encoded)?.state(), source.state());
        } else {
            assert!(matches!(
                codec.encode(&source),
                Err(SessionCheckpointV5CodecError::OutputTooLarge { .. })
            ));
            assert!(matches!(
                codec.decode(&encoded),
                Err(SessionCheckpointV5CodecError::InputTooLarge { .. })
            ));
        }
    }
    Ok(())
}

#[test]
fn malformed_topology_fields_and_mixed_generations_remain_closed() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1, 2])?;
    let codec = SessionCheckpointJsonCodecV5::new(context.clone());
    let encoded = codec.encode(&source)?;
    for invalid in [
        encoded.replacen('{', "{\"unknown\":0,", 1),
        encoded.replacen("\"cursor\":2", "\"cursor\":2,\"cursor\":2", 1),
        encoded.replacen("\"formatVersion\":5", "\"formatVersion\":3", 1),
        encoded.replacen("\"currentRevision\":\"2\"", "\"currentRevision\":\"02\"", 1),
    ] {
        assert_ne!(invalid, encoded);
        assert!(codec.decode(&invalid).is_err());
    }
    let value: Value = serde_json::from_str(&encoded)?;
    let mut variants = Vec::new();
    for (key, invalid) in
        [("cursor", json!(3)), ("historyCapacity", json!(1)), ("openMergeGroup", json!("bad name"))]
    {
        let mut altered = value.clone();
        altered[key] = invalid;
        variants.push(altered);
    }
    let mut altered = value.clone();
    altered["cursor"] = json!(0);
    altered["openMergeGroup"] = json!("example/group");
    variants.push(altered);
    let mut altered = value.clone();
    altered["historyBase"]["formatVersion"] = json!(4);
    variants.push(altered);
    let mut altered = value.clone();
    altered["historyBase"]["snapshot"]["revision"] = json!("1");
    variants.push(altered);
    let mut altered = value.clone();
    altered["entries"][0]["forwardOperations"] = json!([]);
    variants.push(altered);
    let mut altered = value;
    altered["entries"][0]["inverseOperations"] = json!([]);
    variants.push(altered);
    for altered in variants {
        assert!(codec.decode(&altered.to_string()).is_err(), "{altered}");
    }
    assert!(SessionCheckpointJsonCodec::new(context.clone()).decode(&encoded).is_err());
    assert!(SessionCheckpointJsonCodecV2::new(context.clone()).decode(&encoded).is_err());
    assert!(SessionCheckpointJsonCodecV3::new(context).decode(&encoded).is_err());
    Ok(())
}

#[test]
fn binding_mismatch_precedes_history_interpretation() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1])?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    value["schemaFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    value["entries"] = json!(null);
    assert_eq!(
        codec.decode(&value.to_string()).err().ok_or("binding")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    Ok(())
}

#[test]
fn maximum_revision_restores_without_wrapping_on_undo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1])?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    value["currentRevision"] = json!(u64::MAX.to_string());
    let mut restored = codec.decode(&value.to_string())?;
    let before = restored.state().clone();
    assert!(restored.undo().is_err());
    assert_eq!(restored.state(), &before);
    assert_eq!(restored.undo_depth(), 1);
    Ok(())
}

#[test]
fn empty_paragraph_checkpoint_only_changes_the_explicit_outer_version() -> TestResult {
    let context = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let source = EditorSession::new(state(
        &context,
        vec![block(TextBlockKind::Paragraph, "", FormatSet::default())?],
        None,
        None,
    )?);
    let old = SessionCheckpointJsonCodecV3::new(context.clone()).encode(&source)?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let encoded = codec.encode(&source)?;
    assert_eq!(encoded.replacen("\"formatVersion\":5", "\"formatVersion\":3", 1), old);
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);
    assert!(codec.decode(&old).is_err());
    Ok(())
}

#[test]
fn state_only_changes_preserve_the_saved_redo_frontier() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = session(&context, &[1, 2])?;
    source.undo()?.ok_or("undo")?;
    source.apply_transaction(
        &Transaction::new(source.state(), vec![])
            .with_selection_update(SelectionUpdate::Set(Some(caret(4)?)))
            .with_pending_formats_update(PendingFormatsUpdate::Set(None)),
    )?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    assert_eq!(restored.state(), source.state());
    assert_eq!(restored.redo_depth(), 1);
    restored.redo()?.ok_or("redo")?;
    source.redo()?.ok_or("redo")?;
    assert_eq!(restored.state(), source.state());
    Ok(())
}

#[test]
fn replay_enforces_whole_document_limits_not_only_individual_fragments() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let initial = state(
        &context,
        vec![
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        ],
        None,
        None,
    )?;
    let mut source = EditorSession::new(initial);
    for start in 0..2 {
        let operation = TextBlockKindChange::capture(
            &context,
            source.state().document(),
            start..start + 1,
            heading(1)?,
        )?;
        source.apply_transaction(&Transaction::new(
            source.state(),
            vec![Operation::TextBlockKindChange(operation)],
        ))?;
    }
    let encoded = SessionCheckpointJsonCodecV5::new(context.clone()).encode(&source)?;
    let tight = EditorContext::new(
        context.schema().clone(),
        DocumentLimits::default().with_max_property_values(1),
    );
    let error = SessionCheckpointJsonCodecV5::new(tight)
        .decode(&encoded)
        .err()
        .ok_or("full result limit")?;
    assert!(matches!(error, SessionCheckpointV5CodecError::InvalidCheckpoint(source)
        if matches!(source.as_ref(), SessionCheckpointCodecError::Apply(error)
            if error.entry_index() == 1 && error.direction() == SessionCheckpointReplayDirection::Forward)));
    Ok(())
}

#[test]
fn per_entry_count_and_history_capacity_are_host_authoritative() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1])?;
    let encoded = SessionCheckpointJsonCodecV5::new(context.clone()).encode(&source)?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["entries"][0]["forwardOperations"] = json!([null, null]);
    value["historyBase"] = json!(null);
    let tight =
        SessionCheckpointJsonCodecV5::new(context.clone().with_max_operations_per_transaction(1));
    assert_eq!(
        tight.decode(&value.to_string()).err().ok_or("entry count")?.code(),
        CodecErrorCode::ResourceLimit
    );
    let tight = SessionCheckpointJsonCodecV5::new(context).with_limits(
        SessionCheckpointLimits::default().with_max_history_capacity(HistoryCapacity::try_new(1)?),
    );
    assert_eq!(
        tight.decode(&encoded).err().ok_or("capacity")?.code(),
        CodecErrorCode::ResourceLimit
    );
    assert_eq!(
        tight.encode(&source).err().ok_or("capacity")?.code(),
        CodecErrorCode::ResourceLimit
    );
    Ok(())
}

#[test]
fn final_selection_and_pending_format_validation_are_not_skipped_on_redo_entries() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = session(&context, &[1, 2])?;
    source.undo()?.ok_or("undo")?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    let mut invalid_selection = value.clone();
    invalid_selection["entries"][1]["resultSelection"] = serde_json::to_value(
        super::editor_value_payload_v1::encode_selection_record_v1(&caret(999)?),
    )?;
    assert!(codec.decode(&invalid_selection.to_string()).is_err());
    let mut invalid_pending = value;
    invalid_pending["entries"][1]["resultPendingFormats"][1]["properties"]["example/href"] =
        json!(42);
    assert!(codec.decode(&invalid_pending.to_string()).is_err());
    Ok(())
}

#[test]
fn explicit_noop_recipe_is_not_admitted_as_a_history_event() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = session(&context, &[1])?;
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&source)?)?;
    value["entries"][0]["forwardOperations"][0]["replacement"] = json!([{"kind":"paragraph"}]);
    assert!(codec.decode(&value.to_string()).is_err());
    Ok(())
}

#[test]
fn mixed_multiblock_span_and_backward_selection_survive_full_history_restore() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let point = |index| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![index, 0])?,
            utf16_offset: if index == 2 { 2 } else { 1 },
            affinity: Affinity::Before,
        })
    };
    let selection = RangeSelection::new(point(2)?, point(0)?);
    let initial = state(
        &context,
        vec![
            block(TextBlockKind::Paragraph, "abc", formats()?)?,
            block(heading(6)?, "", FormatSet::default())?,
            block(heading(1)?, "🙂", formats()?)?,
        ],
        Selection::Range(selection),
        None,
    )?;
    let mut source = EditorSession::new(initial.clone());
    let operation = TextBlockKindChange::capture(&context, initial.document(), 0..3, heading(2)?)?;
    source.apply_transaction(&Transaction::new(
        source.state(),
        vec![Operation::TextBlockKindChange(operation)],
    ))?;
    let after = source.state().clone();
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let mut restored = codec.decode(&codec.encode(&source)?)?;
    same_values(restored.state(), &after);
    restored.undo()?.ok_or("undo")?;
    same_values(restored.state(), &initial);
    restored.redo()?.ok_or("redo")?;
    same_values(restored.state(), &after);
    Ok(())
}

#[test]
fn net_zero_merged_recipe_remains_a_replayable_history_event() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let mut source = session(&context, &[])?;
    let metadata =
        TransactionMetadata::new(None, HistoryIntent::Merge { group: name("example/round-trip")? });
    for rank in [1, 0] {
        source
            .apply_transaction(&request(source.state(), rank)?.with_metadata(metadata.clone()))?;
    }
    assert_eq!(source.undo_depth(), 1);
    let codec = SessionCheckpointJsonCodecV5::new(context);
    let encoded = codec.encode(&source)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["formatVersion"], json!(5));
    assert_eq!(value["historyBase"]["formatVersion"], json!(3));
    assert_eq!(value["historyBase"]["document"]["formatVersion"], json!(2));
    assert_eq!(value["entries"][0]["forwardOperations"].as_array().ok_or("recipe")?.len(), 2);
    assert!(value["entries"][0].get("inverseOperations").is_none());
    let mut restored = codec.decode(&encoded)?;
    assert_eq!(restored.undo_depth(), 1);
    restored.undo()?.ok_or("undo")?;
    restored.redo()?.ok_or("redo")?;
    same_values(restored.state(), source.state());
    Ok(())
}

proptest! {
    #[test]
    fn randomized_heading_sessions_preserve_every_retained_boundary(
        ranks in prop::collection::vec(0_u32..=6, 0..14), undo_selector in 0_u32..20
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let mut original = session(&context, &ranks)?;
            let undo_count = undo_selector % (original.undo_depth()+1);
            for _ in 0..undo_count { original.undo()?.ok_or("undo")?; }
            let codec = SessionCheckpointJsonCodecV5::new(context);
            let encoded = codec.encode(&original)?;
            let mut restored = codec.decode(&encoded)?;
            assert_eq!(restored.state(), original.state());
            assert_eq!(restored.undo_depth(), original.undo_depth());
            assert_eq!(restored.redo_depth(), original.redo_depth());
            assert_eq!(codec.encode(&restored)?, encoded);
            while original.can_undo() {
                original.undo()?.ok_or("undo")?; restored.undo()?.ok_or("undo")?;
                assert_eq!(restored.state(), original.state());
            }
            while original.can_redo() {
                original.redo()?.ok_or("redo")?; restored.redo()?.ok_or("redo")?;
                assert_eq!(restored.state(), original.state());
            }
            Ok(())
        })();
        result.map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
