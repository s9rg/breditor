//! V5 heading-edit persistence: closed payloads, replay and atomic requests.
use super::structural_codec_test_support::{
    TestResult, block, context, formats, heading, name, state,
};
use super::*;
use crate::{
    block::TextBlockKind,
    document::{FormatSet, TextFragment, TextRun},
    operation::{
        Operation, RootTextBoundary, RootTextRange, TextBlockKindChange, TextBlockReplace,
        TextBlockSplice, TextRange,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::DocumentLimits,
    selection::RangeSelection,
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

fn path(index: u32) -> Result<NodePath, Box<dyn Error>> {
    Ok(NodePath::try_from_indices(vec![index])?)
}
fn root_range(
    first: u32,
    start: u64,
    last: u32,
    end: u64,
) -> Result<RootTextRange, Box<dyn Error>> {
    Ok(RootTextRange::try_new(
        RootTextBoundary::try_new(path(first)?, TextOffset::try_new(start)?)?,
        RootTextBoundary::try_new(path(last)?, TextOffset::try_new(end)?)?,
    )?)
}
fn base(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    state(
        context,
        vec![block(heading(2)?, "a🙂b", formats()?)?, block(heading(4)?, "e\u{301}z", formats()?)?],
        None,
        None,
    )
}
fn splice(base: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::TextBlockSplice(TextBlockSplice::capture(
        base.context(),
        base.document(),
        TextRange::try_new(path(0)?, TextOffset::try_new(1)?, TextOffset::try_new(3)?)?,
        TextFragment::from(TextRun::try_new(text, formats()?)?),
    )?))
}
fn split(base: &EditorState) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::TextBlockReplace(TextBlockReplace::capture(
        base.context(),
        base.document(),
        root_range(0, 1, 0, 1)?,
        vec![block(heading(2)?, "", FormatSet::default())?, block(heading(3)?, "!", formats()?)?],
    )?))
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn roundtrip_operation(base: &EditorState, operation: &Operation) -> TestResult {
    let codec = OperationJsonCodecV5::new(base.context().clone());
    let encoded = codec.encode(operation)?;
    let decoded = codec.decode(&encoded)?;
    assert_eq!(&decoded, operation);
    assert_eq!(codec.encode(&decoded)?, encoded);
    let commit = Transaction::new(base, vec![decoded])
        .apply(base.context(), base)?
        .into_commit()
        .ok_or("commit")?;
    let inverse = codec.decode(&codec.encode(&commit.inverse_operations()[0])?)?;
    let mut session = EditorSession::new(base.clone());
    session.apply_transaction(&Transaction::new(base, vec![operation.clone()]))?;
    session.apply_transaction(&Transaction::new(session.state(), vec![inverse]))?;
    exact(session.state(), base);
    Ok(())
}
fn chain(base: &EditorState) -> Result<Transaction, Box<dyn Error>> {
    let mut shadow = EditorSession::new(base.clone());
    let first = splice(base, "X")?;
    shadow.apply_transaction(&Transaction::new(shadow.state(), vec![first.clone()]))?;
    let second = split(shadow.state())?;
    shadow.apply_transaction(&Transaction::new(shadow.state(), vec![second.clone()]))?;
    let third = Operation::TextBlockKindChange(TextBlockKindChange::capture(
        base.context(),
        shadow.state().document(),
        1..2,
        TextBlockKind::Paragraph,
    )?);
    Ok(Transaction::new(base, vec![first, second, third]))
}

#[test]
fn v5_splice_and_replace_have_exact_distinct_shapes_and_replayable_inverses() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV5::new(context);
    for operation in [splice(&base, "X")?, split(&base)?] {
        roundtrip_operation(&base, &operation)?;
        let value: Value = serde_json::from_str(&codec.encode(&operation)?)?;
        assert_eq!(value["formatVersion"], json!(5));
        assert_eq!(value["operation"]["expected"]["children"].as_array().ok_or("guards")?.len(), 1);
        match operation {
            Operation::TextBlockSplice(_) => {
                assert_eq!(value["operation"]["kind"], json!("textBlockSplice"));
                assert_eq!(value["operation"]["block"], json!(0));
                assert_eq!(value["operation"]["start"], json!(1));
                assert_eq!(value["operation"]["end"], json!(3));
                assert_eq!(value["operation"]["replacement"]["runs"][0]["text"], json!("X"));
                assert_eq!(value["operation"].as_object().ok_or("operation")?.len(), 6);
            }
            Operation::TextBlockReplace(_) => {
                assert_eq!(value["operation"]["kind"], json!("textBlockReplace"));
                assert_eq!(value["operation"]["start"], json!({"block":0,"offset":1}));
                assert_eq!(value["operation"]["end"], json!({"block":0,"offset":1}));
                assert_eq!(
                    value["operation"]["replacement"]["children"]
                        .as_array()
                        .ok_or("replacement")?
                        .len(),
                    2
                );
                assert_eq!(value["operation"].as_object().ok_or("operation")?.len(), 5);
            }
            _ => return Err("wrong fixture operation".into()),
        }
    }
    Ok(())
}

#[test]
fn v5_cross_formatting_keeps_interior_selection_after_decode() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let point = |block, offset| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![block, 0])?,
            utf16_offset: offset,
            affinity: Affinity::Before,
        })
    };
    let before = state(
        &context,
        vec![block(heading(2)?, "a🙂b", formats()?)?, block(heading(4)?, "e\u{301}z", formats()?)?],
        crate::selection::Selection::from(RangeSelection::new(point(1, 2)?, point(0, 3)?)),
        None,
    )?;
    let operation = Operation::TextBlockReplace(TextBlockReplace::capture(
        &context,
        before.document(),
        root_range(0, 0, 1, 3)?,
        vec![
            block(heading(2)?, "a🙂b", FormatSet::default())?,
            block(heading(4)?, "e\u{301}z", FormatSet::default())?,
        ],
    )?);
    roundtrip_operation(&before, &operation)
}

#[test]
fn v5_old_codecs_reject_new_operations_even_under_relabelled_old_envelopes() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV5::new(context.clone());
    for op in [splice(&base, "X")?, split(&base)?] {
        let encoded = codec.encode(&op)?;
        assert!(OperationJsonCodec::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV2::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV3::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV4::new(context.clone()).encode(&op).is_err());
        for version in [1, 2, 3, 4] {
            let altered =
                encoded.replacen("\"formatVersion\":5", &format!("\"formatVersion\":{version}"), 1);
            assert!(codec.decode(&altered).is_err());
            let rejected = match version {
                1 => OperationJsonCodec::new(context.clone()).decode(&altered).is_err(),
                2 => OperationJsonCodecV2::new(context.clone()).decode(&altered).is_err(),
                3 => OperationJsonCodecV3::new(context.clone()).decode(&altered).is_err(),
                _ => OperationJsonCodecV4::new(context.clone()).decode(&altered).is_err(),
            };
            assert!(rejected);
        }
    }
    let kind = Operation::TextBlockKindChange(TextBlockKindChange::capture(
        &context,
        base.document(),
        0..1,
        heading(5)?,
    )?);
    let old = OperationJsonCodecV4::new(context).encode(&kind)?;
    assert_eq!(codec.encode(&kind)?.replacen("\"formatVersion\":5", "\"formatVersion\":4", 1), old);
    Ok(())
}

#[test]
fn v5_malformed_coordinates_guards_and_noncanonical_runs_fail_decode() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV5::new(context);
    let encoded = codec.encode(&splice(&base, "X")?)?;
    for (pointer, value) in [
        ("/operation/block", json!(u32::MAX)),
        ("/operation/start", json!(2)),
        ("/operation/end", json!(99)),
        ("/operation/start", json!(9_007_199_254_740_992_u64)),
        ("/operation/expected/children/0/properties/breditor~1level", json!(7)),
        ("/operation/replacement/runs/0/formats/1/properties/example~1href", json!(42)),
    ] {
        let mut value_json: Value = serde_json::from_str(&encoded)?;
        *value_json.pointer_mut(pointer).ok_or(pointer)? = value;
        assert!(codec.decode(&value_json.to_string()).is_err(), "accepted {pointer}");
    }
    let mut noncanonical: Value = serde_json::from_str(&encoded)?;
    let run = noncanonical["operation"]["replacement"]["runs"][0].clone();
    noncanonical["operation"]["replacement"]["runs"] = json!([run.clone(), run]);
    assert!(codec.decode(&noncanonical.to_string()).is_err());
    let mut too_many: Value = serde_json::from_str(&encoded)?;
    let guard = too_many["operation"]["expected"]["children"][0].clone();
    too_many["operation"]["expected"]["children"] = json!([guard.clone(), guard]);
    assert!(codec.decode(&too_many.to_string()).is_err());
    for malformed in [
        encoded.replacen("\"start\":1", "\"start\":1,\"start\":1", 1),
        encoded.replacen("\"start\":1", "\"start\":1.0", 1),
        encoded.replacen("\"start\":1", "\"start\":-0", 1),
        encoded.replacen("\"breditor/level\":2", "\"breditor/level\":2e0", 1),
        encoded.replacen(
            "\"kind\":\"textBlockSplice\"",
            "\"kind\":\"textBlockSplice\",\"surprise\":0",
            1,
        ),
        encoded.replacen("\"formatVersion\":5", "\"formatVersion\":5,\"formatVersion\":5", 1),
    ] {
        assert_ne!(malformed, encoded);
        assert!(codec.decode(&malformed).is_err());
    }
    let mut replaced: Value = serde_json::from_str(&codec.encode(&split(&base)?)?)?;
    replaced["operation"]["end"]["block"] = json!(1);
    assert!(codec.decode(&replaced.to_string()).is_err());
    replaced["operation"]["end"]["block"] = json!(0);
    replaced["operation"]["replacement"]["children"] = json!([]);
    assert!(codec.decode(&replaced.to_string()).is_err());
    Ok(())
}

#[test]
fn v5_operation_binding_and_exact_byte_limits_are_enforced() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let op = splice(&base, "X")?;
    let encoded = OperationJsonCodecV5::new(context.clone()).encode(&op)?;
    for difference in [0, 1] {
        let bounded = EditorContext::new(
            context.schema().clone(),
            DocumentLimits::default().with_max_json_bytes(encoded.len() - difference),
        );
        let codec = OperationJsonCodecV5::new(bounded);
        if difference == 0 {
            assert_eq!(codec.decode(&encoded)?, op);
            assert_eq!(codec.encode(&op)?, encoded);
        } else {
            assert!(matches!(
                codec.decode(&encoded),
                Err(OperationV5CodecError::InputTooLarge { .. })
            ));
            assert!(matches!(codec.encode(&op), Err(OperationV5CodecError::OutputTooLarge { .. })));
        }
    }
    let codec = OperationJsonCodecV5::new(context);
    let mut wrong: Value = serde_json::from_str(&encoded)?;
    wrong["schemaFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    wrong["operation"] = json!(null);
    assert_eq!(
        codec.decode(&wrong.to_string()).err().ok_or("binding")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    Ok(())
}

#[test]
fn v5_preserves_all_four_legacy_paragraph_payloads_without_reinterpreting_them() -> TestResult {
    use crate::operation::{ParagraphJoin, ParagraphSplit, RootTextReplace, TextSplice};
    let context = EditorContext::new(
        crate::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default(),
    );
    let codec = OperationJsonCodecV5::new(context.clone());
    let old = OperationJsonCodecV3::new(context);
    let fragment = TextFragment::from(TextRun::try_new("ab", FormatSet::default())?);
    let operations = [
        Operation::from(TextSplice::try_new(
            TextRange::try_new(path(0)?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            fragment.clone(),
        )?),
        ParagraphSplit::try_new(path(0)?, TextOffset::try_new(1)?, fragment.clone())?.into(),
        ParagraphJoin::try_new(path(0)?, fragment.clone(), fragment.clone())?.into(),
        RootTextReplace::try_new(
            root_range(0, 1, 1, 1)?,
            vec![fragment.clone(), fragment.clone()],
            vec![fragment],
        )?
        .into(),
    ];
    for operation in operations {
        let encoded = codec.encode(&operation)?;
        assert_eq!(codec.decode(&encoded)?, operation);
        assert_eq!(
            encoded.replacen("\"formatVersion\":5", "\"formatVersion\":3", 1),
            old.encode(&operation)?
        );
    }
    Ok(())
}

#[test]
fn v5_mixed_request_replays_in_an_independent_context_with_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let p = Point::Text {
        text_path: NodePath::try_from_indices(vec![1, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let request = chain(&before)?
        .with_selection_update(SelectionUpdate::Set(Some(RangeSelection::new(p.clone(), p).into())))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats()?)))
        .with_metadata(TransactionMetadata::new(
            Some(name("example/heading-edit")?),
            HistoryIntent::Record,
        ));
    let writer = TransactionJsonCodecV5::new(context.clone());
    let encoded = writer.encode(&request)?;
    let state_json = EditorStateJsonCodecV3::new(context).encode(&before)?;
    let independent_context = self::context(DocumentLimits::default())?;
    let independent =
        EditorStateJsonCodecV3::new(independent_context.clone()).decode(&state_json)?;
    assert!(matches!(
        writer.decode(&encoded, &independent),
        Err(TransactionV5CodecError::ContextConfigurationMismatch)
    ));
    let reader = TransactionJsonCodecV5::new(independent_context.clone());
    let decoded = reader.decode(&encoded, &independent)?;
    assert_eq!(reader.encode(&decoded)?, encoded);
    let mut session = EditorSession::new(independent.clone());
    session.apply_transaction(&decoded)?;
    let result = session.state().clone();
    let expected = state(
        &independent_context,
        vec![
            block(heading(2)?, "a", formats()?)?,
            block(TextBlockKind::Paragraph, "!Xb", formats()?)?,
            block(heading(4)?, "e\u{301}z", formats()?)?,
        ],
        result.selection().cloned(),
        Some(formats()?),
    )?;
    exact(&result, &expected);
    assert_eq!(session.undo_depth(), 1);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &independent);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &result);
    assert!(SessionCheckpointJsonCodecV4::new(independent_context).encode(&session).is_err());
    Ok(())
}

#[test]
fn v5_request_count_and_snapshot_checks_precede_payload_admission() -> TestResult {
    let context = context(DocumentLimits::default())?.with_max_operations_per_transaction(1);
    let before = base(&context)?;
    let codec = TransactionJsonCodecV5::new(context);
    let mut value: Value =
        serde_json::from_str(&codec.encode(&Transaction::new(&before, vec![]))?)?;
    value["operations"] = json!([null, null]);
    assert!(matches!(
        codec.decode(&value.to_string(), &before),
        Err(TransactionV5CodecError::OperationLimit { actual: 2, maximum: 1 })
    ));
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![splice(&before, "X")?]))?;
    assert!(matches!(
        codec.decode(&value.to_string(), session.state()),
        Err(TransactionV5CodecError::BaseSnapshotMismatch { .. })
    ));
    Ok(())
}

#[test]
fn v5_late_stale_guard_and_result_limits_roll_back_without_losing_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let op = splice(&before, "X")?;
    let codec = TransactionJsonCodecV5::new(context);
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![op.clone()]))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    let stale = Transaction::new(&current, vec![op.clone(), op]);
    let decoded = codec.decode(&codec.encode(&stale)?, &current)?;
    assert!(session.apply_transaction(&decoded).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    let bounded = self::context(DocumentLimits::default().with_max_nodes(5))?;
    let before = base(&bounded)?;
    let first = splice(&before, "X")?;
    let mut shadow = EditorSession::new(before.clone());
    shadow.apply_transaction(&Transaction::new(&before, vec![first.clone()]))?;
    let request = Transaction::new(&before, vec![first, split(shadow.state())?]);
    let codec = TransactionJsonCodecV5::new(bounded);
    let decoded = codec.decode(&codec.encode(&request)?, &before)?;
    let mut session = EditorSession::new(before.clone());
    assert!(matches!(
        session.apply_transaction(&decoded),
        Err(crate::transaction::TransactionApplyError::Operation {
            operation_index: 1,
            source: crate::operation::OperationApplyError::TextBlockReplace(
                crate::operation::TextBlockReplaceError::Validation(_)
            ),
        })
    ));
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn v5_indexed_payload_errors_and_older_transaction_rejection_are_explicit() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let request = chain(&before)?;
    let codec = TransactionJsonCodecV5::new(context.clone());
    let encoded = codec.encode(&request)?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["operations"][1]["replacement"]["children"][1]["properties"]["breditor/level"] = json!(7);
    assert!(matches!(
        codec.decode(&value.to_string(), &before),
        Err(TransactionV5CodecError::OperationPayload { operation_index: 1, .. })
    ));
    let old = TransactionJsonCodecV4::new(context.clone());
    assert!(old.encode(&request).is_err());
    assert!(old.decode(&encoded, &before).is_err());
    assert!(
        old.decode(&encoded.replacen("\"formatVersion\":5", "\"formatVersion\":4", 1), &before)
            .is_err()
    );
    let empty = Transaction::new(&before, vec![]);
    let old_json = old.encode(&empty)?;
    assert_eq!(
        codec.encode(&empty)?.replacen("\"formatVersion\":5", "\"formatVersion\":4", 1),
        old_json
    );
    assert!(codec.decode(&old_json, &before).is_err());
    Ok(())
}

proptest! {
    #[test]
    fn v5_unicode_edits_roundtrip_forward_and_inverse(text in "[a-z🙂א]{1,20}", rank in 1_u32..7) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let before = state(&context, vec![block(heading(rank)?, "a🙂b", formats()?)?], None, None)?;
            roundtrip_operation(&before, &splice(&before, &format!("X{text}"))?)?;
            let codec = TransactionJsonCodecV5::new(context.clone());
            let request = chain(&before)?;
            let decoded = codec.decode(&codec.encode(&request)?, &before)?;
            let mut session = EditorSession::new(before.clone());
            session.apply_transaction(&decoded)?;
            session.undo()?.ok_or("undo")?;
            exact(session.state(), &before);
            Ok(())
        })();
        prop_assert!(result.is_ok(), "{result:?}");
    }
}
