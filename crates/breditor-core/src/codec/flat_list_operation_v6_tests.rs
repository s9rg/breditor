//! V6 list operation persistence: exact records, closed admission and inverse replay.
use super::structural_codec_test_support::{
    TestResult, block, extensions, formats, heading, name, state,
};
use super::*;
use crate::{
    block::{ListKind, OrderedListStart, TextBlockKind},
    document::{
        ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue, TextFragment, TextRun,
    },
    operation::{
        FlatListReframe, FlatListRootShape, FlatListTextRange, FlatListTextReplace,
        FlatListTextSplice, Operation, TextBlockSplice, TextRange,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::Transaction,
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-wire")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn path(indices: &[u32]) -> Result<NodePath, Box<dyn Error>> {
    Ok(NodePath::try_from_indices(indices.to_vec())?)
}
fn list(blocks: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    let items = blocks
        .into_iter()
        .map(|block| {
            Ok(NodeRef::element(ElementNode::try_new(
                name("breditor/list-item")?,
                None,
                PropertyMap::default(),
                vec![block],
            )?))
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    Ok(NodeRef::element(ElementNode::try_new(
        name("breditor/ordered-list")?,
        None,
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(8)?),
        )])?,
        items,
    )?))
}
fn base(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let a =
        Point::Text { text_path: path(&[1, 0, 0, 0])?, utf16_offset: 1, affinity: Affinity::After };
    let b = Point::Text {
        text_path: path(&[1, 1, 0, 0])?,
        utf16_offset: 2,
        affinity: Affinity::Before,
    };
    state(
        context,
        vec![
            block(TextBlockKind::Paragraph, "before", formats()?)?,
            list(vec![
                block(heading(2)?, "a🙂b", formats()?)?,
                block(heading(4)?, "e\u{301}z", formats()?)?,
            ])?,
            block(TextBlockKind::Paragraph, "after", formats()?)?,
        ],
        Selection::Range(RangeSelection::new(b, a)),
        None,
    )
}
fn splice(base: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::FlatListTextSplice(FlatListTextSplice::capture(
        base.context(),
        base.document(),
        TextRange::try_new(path(&[1, 0, 0])?, TextOffset::try_new(1)?, TextOffset::try_new(3)?)?,
        TextFragment::from(TextRun::try_new(text, formats()?)?),
    )?))
}
fn reframe(base: &EditorState) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::FlatListReframe(FlatListReframe::capture(
        base.context(),
        base.document(),
        1,
        1,
        vec![block(heading(2)?, "a🙂b", formats()?)?, block(heading(4)?, "e\u{301}z", formats()?)?],
    )?))
}
fn replace(base: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::FlatListTextReplace(FlatListTextReplace::capture(
        base.context(),
        base.document(),
        FlatListTextRange::try_new(
            path(&[1, 0, 0])?,
            TextOffset::try_new(1)?,
            path(&[1, 1, 0])?,
            TextOffset::try_new(2)?,
        )?,
        vec![
            block(heading(2)?, text, formats()?)?,
            block(TextBlockKind::Paragraph, "Y", formats()?)?,
        ],
        vec![FlatListRootShape::List {
            kind: ListKind::Ordered(OrderedListStart::try_new(8)?),
            items: 2,
        }],
    )?))
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn roundtrip(base: &EditorState, operation: &Operation) -> TestResult {
    let codec = OperationJsonCodecV6::new(base.context().clone());
    let encoded = codec.encode(operation)?;
    let decoded = codec.decode(&encoded)?;
    assert_eq!(&decoded, operation);
    assert_eq!(codec.encode(&decoded)?, encoded);
    let direct =
        Transaction::new(base, vec![operation.clone()]).apply(base.context(), base)?.into_commit();
    let commit = Transaction::new(base, vec![decoded]).apply(base.context(), base)?.into_commit();
    assert_eq!(direct.is_none(), commit.is_none());
    let Some(direct) = direct else {
        let mut session = EditorSession::new(base.clone());
        session.apply_transaction(&Transaction::new(base, vec![operation.clone()]))?;
        assert_eq!(session.state(), base);
        assert_eq!(session.undo_depth(), 0);
        return Ok(());
    };
    let commit = commit.ok_or("decoded commit")?;
    exact(direct.after(), commit.after());
    assert_eq!(direct.inverse_operations(), commit.inverse_operations());
    let inverse = codec.decode(&codec.encode(&commit.inverse_operations()[0])?)?;
    let mut session = EditorSession::new(base.clone());
    session.apply_transaction(&Transaction::new(base, vec![operation.clone()]))?;
    let after = session.state().clone();
    session.undo()?.ok_or("undo")?;
    exact(session.state(), base);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &after);
    session.apply_transaction(&Transaction::new(session.state(), vec![inverse]))?;
    assert_eq!(session.state().document(), base.document());
    Ok(())
}

#[test]
fn every_list_primitive_has_closed_deterministic_shape_and_replayable_inverse() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV6::new(context);
    for op in [splice(&base, "X")?, reframe(&base)?, replace(&base, "X")?] {
        roundtrip(&base, &op)?;
        let value: Value = serde_json::from_str(&codec.encode(&op)?)?;
        assert_eq!(value["formatVersion"], 6);
        assert_eq!(value.as_object().ok_or("envelope")?.len(), 5);
        match op {
            Operation::FlatListTextSplice(_) => {
                assert_eq!(value["operation"]["kind"], "flatListTextSplice");
                assert_eq!(value["operation"]["block"], json!([1, 0, 0]));
                assert_eq!(value["operation"].as_object().ok_or("record")?.len(), 6);
            }
            Operation::FlatListReframe(_) => {
                assert_eq!(value["operation"]["kind"], "flatListReframe");
                assert_eq!(value["operation"]["start"], 1);
                assert_eq!(value["operation"].as_object().ok_or("record")?.len(), 4);
            }
            Operation::FlatListTextReplace(_) => {
                assert_eq!(value["operation"]["kind"], "flatListTextReplace");
                assert_eq!(value["operation"]["guardStart"], 1);
                assert_eq!(value["operation"]["start"], json!({"block":[1,0,0],"offset":1}));
                assert_eq!(
                    value["operation"]["layout"],
                    json!([{"kind":"ordered","start":8,"items":2}])
                );
                assert_eq!(value["operation"].as_object().ok_or("record")?.len(), 7);
            }
            _ => return Err("fixture".into()),
        }
    }
    Ok(())
}

#[test]
fn unchanged_splice_roundtrips_without_creating_a_history_entry() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    roundtrip(&before, &splice(&before, "🙂")?)
}

#[test]
fn independent_context_replay_works_but_old_sessions_do_not_admit_list_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let independent_context = self::context(DocumentLimits::default())?;
    let saved = EditorStateJsonCodecV3::new(context.clone()).encode(&before)?;
    let independent = EditorStateJsonCodecV3::new(independent_context.clone()).decode(&saved)?;
    exact(&independent, &before);
    let writer = OperationJsonCodecV6::new(context.clone());
    let reader = OperationJsonCodecV6::new(independent_context.clone());
    for operation in [splice(&before, "X")?, reframe(&before)?, replace(&before, "X")?] {
        let decoded = reader.decode(&writer.encode(&operation)?)?;
        let mut direct = EditorSession::new(before.clone());
        direct.apply_transaction(&Transaction::new(&before, vec![operation]))?;
        let mut restored = EditorSession::new(independent.clone());
        let request = Transaction::new(&independent, vec![decoded]);
        restored.apply_transaction(&request)?;
        exact(restored.state(), direct.state());
        assert!(TransactionJsonCodecV5::new(independent_context.clone()).encode(&request).is_err());
        assert!(
            SessionCheckpointJsonCodecV5::new(independent_context.clone())
                .encode(&restored)
                .is_err()
        );
        restored.undo()?.ok_or("undo")?;
        exact(restored.state(), &independent);
        restored.redo()?.ok_or("redo")?;
        exact(restored.state(), direct.state());
    }
    Ok(())
}

#[test]
fn old_envelopes_and_payload_languages_stay_closed() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV6::new(context.clone());
    for op in [splice(&base, "X")?, reframe(&base)?, replace(&base, "X")?] {
        let encoded = codec.encode(&op)?;
        assert!(OperationJsonCodec::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV2::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV3::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV4::new(context.clone()).encode(&op).is_err());
        assert!(OperationJsonCodecV5::new(context.clone()).encode(&op).is_err());
        for version in 1..6 {
            let old =
                encoded.replacen("\"formatVersion\":6", &format!("\"formatVersion\":{version}"), 1);
            assert!(codec.decode(&old).is_err());
            let rejected = match version {
                1 => OperationJsonCodec::new(context.clone()).decode(&old).is_err(),
                2 => OperationJsonCodecV2::new(context.clone()).decode(&old).is_err(),
                3 => OperationJsonCodecV3::new(context.clone()).decode(&old).is_err(),
                4 => OperationJsonCodecV4::new(context.clone()).decode(&old).is_err(),
                _ => OperationJsonCodecV5::new(context.clone()).decode(&old).is_err(),
            };
            assert!(rejected);
        }
    }
    Ok(())
}

#[test]
fn earlier_heading_payload_bytes_and_capabilities_are_unchanged() -> TestResult {
    let context = structural_codec_test_support::context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(2)?, "ab", formats()?)?], None, None)?;
    let op = Operation::TextBlockSplice(TextBlockSplice::capture(
        &context,
        before.document(),
        TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::try_new(1)?)?,
        TextFragment::from(TextRun::try_new("X", formats()?)?),
    )?);
    let old = OperationJsonCodecV5::new(context.clone()).encode(&op)?;
    let codec = OperationJsonCodecV6::new(context);
    let encoded = codec.encode(&op)?;
    assert_eq!(encoded.replacen("\"formatVersion\":6", "\"formatVersion\":5", 1), old);
    assert_eq!(codec.decode(&encoded)?, op);
    let flat = self::context(DocumentLimits::default())?;
    let base = base(&flat)?;
    let op = splice(&base, "X")?;
    let old_schema = structural_codec_test_support::context(DocumentLimits::default())?;
    let mut value: Value = serde_json::from_str(&OperationJsonCodecV6::new(flat).encode(&op)?)?;
    let binding: Value = serde_json::from_str(&old)?;
    value["schema"] = binding["schema"].clone();
    value["schemaFingerprint"] = binding["schemaFingerprint"].clone();
    assert!(OperationJsonCodecV6::new(old_schema).decode(&value.to_string()).is_err());
    Ok(())
}

#[test]
fn malformed_paths_scalars_guards_properties_and_fragments_reject() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV6::new(context);
    let encoded = codec.encode(&splice(&base, "X")?)?;
    for (pointer, value) in [
        ("/operation/block", json!([])),
        ("/operation/block", json!([1, 0])),
        ("/operation/block", json!([1, 0, 1])),
        ("/operation/block", json!([1, 0, 0, 0])),
        ("/operation/block", json!([1, 99, 0])),
        ("/operation/start", json!(2)),
        ("/operation/end", json!(99)),
        ("/operation/start", json!(9_007_199_254_740_992_u64)),
        ("/operation/expected/children/0/properties/breditor~1start", json!(0)),
        ("/operation/replacement/runs/0/formats/1/properties/example~1href", json!(42)),
    ] {
        let mut value_json: Value = serde_json::from_str(&encoded)?;
        *value_json.pointer_mut(pointer).ok_or(pointer)? = value;
        assert!(codec.decode(&value_json.to_string()).is_err(), "accepted {pointer}");
    }
    let mut value: Value = serde_json::from_str(&encoded)?;
    let run = value["operation"]["replacement"]["runs"][0].clone();
    value["operation"]["replacement"]["runs"] = json!([run.clone(), run]);
    assert!(codec.decode(&value.to_string()).is_err());
    let mut value: Value = serde_json::from_str(&encoded)?;
    let guard = value["operation"]["expected"]["children"][0].clone();
    value["operation"]["expected"]["children"] = json!([guard.clone(), guard]);
    assert!(codec.decode(&value.to_string()).is_err());
    for malformed in [
        encoded.replacen("\"start\":1", "\"start\":1,\"start\":1", 1),
        encoded.replacen("\"start\":1", "\"start\":1.0", 1),
        encoded.replacen("\"start\":1", "\"start\":-0", 1),
        encoded.replacen(
            "\"kind\":\"flatListTextSplice\"",
            "\"kind\":\"flatListTextSplice\",\"surprise\":0",
            1,
        ),
        encoded.replacen("\"formatVersion\":6", "\"formatVersion\":6,\"formatVersion\":6", 1),
    ] {
        assert_ne!(malformed, encoded);
        assert!(codec.decode(&malformed).is_err());
    }
    Ok(())
}

#[test]
fn replacement_layout_counts_numbering_and_coordinate_contracts_reject() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV6::new(context);
    let encoded = codec.encode(&replace(&base, "X")?)?;
    for (pointer, value) in [
        ("/operation/layout", json!([])),
        ("/operation/layout", json!([{"kind":"bullet","items":0}])),
        ("/operation/layout", json!([{"kind":"bullet","items":3}])),
        ("/operation/layout", json!([{"kind":"ordered","start":2_147_483_647,"items":2}])),
        ("/operation/layout", json!([{"kind":"ordered","start":0,"items":2}])),
        ("/operation/layout", json!([{"kind":"block","items":2}])),
        ("/operation/layout", json!([{"kind":"nested","items":2}])),
        ("/operation/start/block", json!([1, 2, 0])),
        ("/operation/end/offset", json!(99)),
        ("/operation/guardStart", json!(2)),
        ("/operation/inserted/children", json!([])),
    ] {
        let mut v: Value = serde_json::from_str(&encoded)?;
        *v.pointer_mut(pointer).ok_or(pointer)? = value;
        assert!(codec.decode(&v.to_string()).is_err(), "accepted {pointer}");
    }
    let bad = encoded.replacen("\"items\":2", "\"items\":2,\"items\":2", 1);
    assert_ne!(bad, encoded);
    assert!(codec.decode(&bad).is_err());
    let bounded = OperationJsonCodecV6::new(self::context(
        DocumentLimits::default().with_max_children_per_element(2),
    )?);
    let mut v: Value = serde_json::from_str(&encoded)?;
    v["operation"]["layout"] = json!([{"kind":"block"},{"kind":"block"},{"kind":"block"}]);
    assert!(bounded.decode(&v.to_string()).is_err());
    Ok(())
}

#[test]
fn reframe_cannot_change_contained_text_and_live_source_guards_still_apply() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let codec = OperationJsonCodecV6::new(context);
    let encoded = codec.encode(&reframe(&base)?)?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["operation"]["replacement"]["children"][0]["children"][0]["text"] = json!("changed");
    assert!(codec.decode(&value.to_string()).is_err());
    let decoded = codec.decode(&codec.encode(&splice(&base, "X")?)?)?;
    let mut session = EditorSession::new(base);
    session.apply_transaction(&Transaction::new(session.state(), vec![decoded.clone()]))?;
    let saved = session.state().clone();
    let history = session.history_status();
    assert!(session.apply_transaction(&Transaction::new(session.state(), vec![decoded])).is_err());
    assert_eq!(session.state(), &saved);
    assert_eq!(session.history_status(), history);
    Ok(())
}

#[test]
fn exact_json_budgets_binding_precedence_and_result_limits_are_enforced() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let base = base(&context)?;
    let op = replace(&base, "X")?;
    let codec = OperationJsonCodecV6::new(context.clone());
    let encoded = codec.encode(&op)?;
    for difference in [0, 1] {
        let bounded = OperationJsonCodecV6::new(EditorContext::new(
            context.schema().clone(),
            DocumentLimits::default().with_max_json_bytes(encoded.len() - difference),
        ));
        if difference == 0 {
            assert_eq!(bounded.encode(&op)?, encoded);
            assert_eq!(bounded.decode(&encoded)?, op);
        } else {
            assert!(matches!(
                bounded.encode(&op),
                Err(OperationV6CodecError::OutputTooLarge { .. })
            ));
            assert!(matches!(
                bounded.decode(&encoded),
                Err(OperationV6CodecError::InputTooLarge { .. })
            ));
        }
    }
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["schemaFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    value["operation"] = json!(null);
    assert_eq!(
        codec.decode(&value.to_string()).err().ok_or("binding")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    let bounded = OperationJsonCodecV6::new(EditorContext::new(
        context.schema().clone(),
        DocumentLimits::default().with_max_text_bytes(6),
    ));
    let long = splice(&base, "12345")?;
    let encoded = codec.encode(&long)?;
    assert!(bounded.encode(&long).is_err());
    assert!(bounded.decode(&encoded).is_err());
    Ok(())
}

#[test]
fn all_layout_families_and_wider_inverse_guards_roundtrip() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let blocks = vec![block(heading(1)?, "a", formats()?)?, block(heading(4)?, "b", formats()?)?];
    let before = state(&context, vec![list(blocks.clone())?], None, None)?;
    let layouts = vec![
        vec![FlatListRootShape::TextBlock, FlatListRootShape::TextBlock],
        vec![FlatListRootShape::List { kind: ListKind::Bullet, items: 2 }],
        vec![
            FlatListRootShape::TextBlock,
            FlatListRootShape::List {
                kind: ListKind::Ordered(OrderedListStart::try_new(9)?),
                items: 1,
            },
        ],
    ];
    for layout in layouts {
        let op = Operation::FlatListTextReplace(FlatListTextReplace::capture(
            &context,
            before.document(),
            FlatListTextRange::try_new(
                path(&[0, 0, 0])?,
                TextOffset::ZERO,
                path(&[0, 1, 0])?,
                TextOffset::try_new(1)?,
            )?,
            blocks.clone(),
            layout,
        )?);
        roundtrip(&before, &op)?;
    }
    Ok(())
}

proptest! {
    #[test]
    fn v6_unicode_splice_and_structural_replace_have_exact_roundtrip_and_inverses(
        text in "[a-z🙂é中]{1,24}",which in any::<bool>(),
    ) {
        let result=(||->TestResult {let context=context(DocumentLimits::default())?;let before=base(&context)?;let op=if which{splice(&before,&text)?}else{replace(&before,&text)?};roundtrip(&before,&op)})();
        prop_assert!(result.is_ok(),"{result:?}");
    }
}
