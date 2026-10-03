//! Regression tests for the experimental heading-operation wire boundary.

use crate::{
    block::{HeadingLevel, TextBlockKind},
    codec::{
        CodecErrorCode, DocumentJsonCodecV2, OperationJsonCodec, OperationJsonCodecV2,
        OperationJsonCodecV3, OperationJsonCodecV4, OperationV4CodecError,
        SessionCheckpointJsonCodecV3, TransactionJsonCodecV3,
    },
    document::{
        Document, ElementNode, Format, FormatSet, NodeRef, PropertyInteger, PropertyMap,
        PropertyValue, TextFragment, TextNode, TextRun,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{
        Operation, ParagraphJoin, ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace,
        TextBlockKindChange, TextRange, TextSplice,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::Transaction,
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

type TestResult = Result<(), Box<dyn Error>>;

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    Ok(QualifiedName::try_new(value)?)
}
fn heading(rank: u32) -> Result<TextBlockKind, Box<dyn Error>> {
    Ok(TextBlockKind::Heading(HeadingLevel::try_new(rank)?))
}
fn extensions() -> Result<ExtensionSet, Box<dyn Error>> {
    let kind = name("example/link")?;
    let contract = InlineFormatPropertyContractV1::try_new(
        kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name("example/href")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 2048)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    Ok(ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?)
}
fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    let schema = CompiledSchema::try_compile_text_block_profile(
        SchemaId::new(name("example/headings")?, SchemaVersion::one()),
        &extensions()?,
    )?;
    Ok(EditorContext::new(schema, limits))
}
fn formats() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![
        Format::new(name("breditor/strong")?, PropertyMap::default()),
        Format::new(
            name("example/link")?,
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string("https://example.com/🙂"),
            )])?,
        ),
    ])?)
}
fn block(kind: TextBlockKind, text: &str, formats: FormatSet) -> Result<NodeRef, Box<dyn Error>> {
    let (kind, properties) = match kind {
        TextBlockKind::Paragraph => ("breditor/paragraph", PropertyMap::default()),
        TextBlockKind::Heading(level) => (
            "breditor/heading",
            PropertyMap::try_from_sorted(vec![(
                name("breditor/level")?,
                PropertyValue::from_integer(PropertyInteger::try_new(i64::from(level.get()))?),
            )])?,
        ),
    };
    let children = if text.is_empty() {
        vec![]
    } else {
        vec![NodeRef::text(TextNode::try_new(text.to_owned(), formats)?)]
    };
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, properties, children)?))
}
fn state(
    context: &EditorContext,
    blocks: Vec<NodeRef>,
    selection: impl Into<Option<Selection>>,
    pending: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let root = NodeRef::element(ElementNode::try_new(
        name("breditor/document")?,
        None,
        PropertyMap::default(),
        blocks,
    )?);
    let document = Document::try_new(context.schema(), root, context.limits())?;
    Ok(EditorState::try_new(
        context,
        LineageId::try_new("heading-tests")?,
        document,
        selection.into(),
        pending,
    )?)
}

fn fixture() -> Result<(EditorContext, EditorState, Operation), Box<dyn Error>> {
    let context = context(DocumentLimits::default())?;
    let selected = Selection::Range(RangeSelection::new(
        Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::Before,
        },
        Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::Before,
        },
    ));
    let state = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "a🙂e\u{301}", formats()?)?],
        selected,
        Some(formats()?),
    )?;
    let operation = Operation::TextBlockKindChange(TextBlockKindChange::capture(
        &context,
        state.document(),
        0..1,
        heading(2)?,
    )?);
    Ok((context, state, operation))
}

fn encoded_fixture() -> Result<(OperationJsonCodecV4, String), Box<dyn Error>> {
    let (context, _, operation) = fixture()?;
    let codec = OperationJsonCodecV4::new(context);
    let json = codec.encode(&operation)?;
    Ok((codec, json))
}

#[test]
fn deterministic_v4_envelope_has_an_exact_closed_heading_recipe() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = block(TextBlockKind::Paragraph, "", FormatSet::default())?;
    let operation = Operation::TextBlockKindChange(TextBlockKindChange::try_new(
        0,
        vec![source],
        vec![heading(2)?],
    )?);
    let codec = OperationJsonCodecV4::new(context.clone());
    let encoded = codec.encode(&operation)?;
    let expected = format!(
        r#"{{"format":"breditor/operation","formatVersion":4,"schema":{{"name":"example/headings","version":1}},"schemaFingerprint":"{}","operation":{{"kind":"textBlockKindChange","start":0,"expected":{{"kind":"element","type":"breditor/document","entityId":null,"properties":{{}},"children":[{{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{{}},"children":[]}}]}},"replacement":[{{"kind":"heading","level":2}}]}}}}"#,
        context.schema().fingerprint(),
    );
    assert_eq!(encoded, expected);
    assert_eq!(codec.decode(&encoded)?, operation);
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);
    Ok(())
}

#[test]
fn decoded_forward_and_inverse_replay_under_an_independent_context() -> TestResult {
    let (context, before, operation) = fixture()?;
    let writer = OperationJsonCodecV4::new(context.clone());
    let reader_context = self::context(DocumentLimits::default())?;
    let reader = OperationJsonCodecV4::new(reader_context.clone());
    let document_json =
        DocumentJsonCodecV2::new(context.schema().clone()).encode(before.document())?;
    let document =
        DocumentJsonCodecV2::new(reader_context.schema().clone()).decode(&document_json)?;
    let independent = EditorState::try_new(
        &reader_context,
        before.snapshot().lineage().clone(),
        document,
        before.selection().cloned(),
        before.pending_formats().cloned(),
    )?;
    let decoded = reader.decode(&writer.encode(&operation)?)?;
    let mut session = EditorSession::new(independent.clone());
    let transaction = Transaction::new(&independent, vec![decoded]);
    let commit = session.apply_transaction(&transaction)?.into_commit().ok_or("commit")?;
    assert_eq!(session.state().selection(), independent.selection());
    assert_eq!(session.state().pending_formats(), independent.pending_formats());
    let inverse = reader.decode(&reader.encode(&commit.inverse_operations()[0])?)?;
    let inverse_transaction = Transaction::new(session.state(), vec![inverse]);
    session.apply_transaction(&inverse_transaction)?;
    assert_eq!(session.state().document(), independent.document());
    assert_eq!(session.state().selection(), independent.selection());
    assert_eq!(session.state().pending_formats(), independent.pending_formats());
    // A singular durable operation is not a durable session-history format.
    assert!(TransactionJsonCodecV3::new(reader_context.clone()).encode(&transaction).is_err());
    assert!(SessionCheckpointJsonCodecV3::new(reader_context).encode(&session).is_err());
    Ok(())
}

#[test]
fn old_envelopes_and_new_envelopes_do_not_silently_cross_generations() -> TestResult {
    let (context, _, operation) = fixture()?;
    let codec = OperationJsonCodecV4::new(context.clone());
    let encoded = codec.encode(&operation)?;
    assert!(OperationJsonCodec::new(context.clone()).decode(&encoded).is_err());
    assert!(OperationJsonCodecV2::new(context.clone()).decode(&encoded).is_err());
    assert!(OperationJsonCodecV3::new(context).decode(&encoded).is_err());
    for version in [0, 1, 2, 3, 5, u32::MAX] {
        let altered =
            encoded.replacen("\"formatVersion\":4", &format!("\"formatVersion\":{version}"), 1);
        assert!(matches!(
            codec.decode(&altered),
            Err(OperationV4CodecError::UnsupportedFormatVersion { .. })
        ));
    }
    Ok(())
}

#[test]
fn legacy_four_payloads_remain_exact_under_the_new_explicit_envelope() -> TestResult {
    let schema = CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/base")?, SchemaVersion::one()),
        &extensions()?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let codec = OperationJsonCodecV4::new(context.clone());
    let old = OperationJsonCodecV3::new(context);
    let fragment = TextFragment::try_from_runs(vec![TextRun::try_new("ab", formats()?)?])?;
    let path = NodePath::try_from_indices(vec![0])?;
    let boundary = |block, offset| -> Result<RootTextBoundary, Box<dyn Error>> {
        Ok(RootTextBoundary::try_new(
            NodePath::try_from_indices(vec![block])?,
            TextOffset::try_new(offset)?,
        )?)
    };
    let operations = [
        Operation::from(TextSplice::try_new(
            TextRange::try_new(path.clone(), TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            fragment.clone(),
        )?),
        ParagraphSplit::try_new(path.clone(), TextOffset::try_new(1)?, fragment.clone())?.into(),
        ParagraphJoin::try_new(path, fragment.clone(), fragment.clone())?.into(),
        RootTextReplace::try_new(
            RootTextRange::try_new(boundary(0, 1)?, boundary(1, 1)?)?,
            vec![fragment.clone(), fragment.clone()],
            vec![fragment],
        )?
        .into(),
    ];
    for operation in operations {
        let encoded = codec.encode(&operation)?;
        assert_eq!(codec.decode(&encoded)?, operation);
        assert_eq!(
            encoded.replacen("\"formatVersion\":4", "\"formatVersion\":3", 1),
            old.encode(&operation)?
        );
        assert_eq!(
            codec.decode(&old.encode(&operation)?).err().ok_or("version error")?.code(),
            CodecErrorCode::UnsupportedFormatVersion
        );
    }
    Ok(())
}

#[test]
fn strict_target_rank_and_start_numbers_reject_coercion_and_overflow() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    for value in
        ["0", "7", "-1", "1.0", "1e0", "\"2\"", "true", "null", "4294967296", "9007199254740992"]
    {
        let malformed = encoded.replace("\"level\":2", &format!("\"level\":{value}"));
        assert!(codec.decode(&malformed).is_err(), "level accepted: {value}");
    }
    for value in ["-1", "0.0", "0e0", "\"0\"", "true", "null", "4294967295", "4294967296"] {
        let malformed = encoded.replace("\"start\":0", &format!("\"start\":{value}"));
        assert!(codec.decode(&malformed).is_err(), "start accepted: {value}");
    }
    Ok(())
}

#[test]
fn duplicate_and_unknown_fields_are_rejected_at_every_new_layer() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    for malformed in [
        encoded.replacen('{', "{\"extra\":0,", 1),
        encoded.replace("\"formatVersion\":4", "\"formatVersion\":4,\"formatVersion\":4"),
        encoded.replace("\"start\":0", "\"start\":0,\"start\":0"),
        encoded.replace("\"start\":0", "\"start\":0,\"extra\":0"),
        encoded.replace(
            "\"kind\":\"textBlockKindChange\"",
            "\"kind\":\"textBlockKindChange\",\"kind\":\"textBlockKindChange\"",
        ),
        encoded.replace("\"level\":2", "\"level\":2,\"level\":2"),
        encoded.replace("\"level\":2", "\"level\":2,\"extra\":0"),
        encoded.replace("\"level\":2", "\"level\":2,\"kind\":\"heading\""),
        encoded.replace("\"entityId\":null", "\"entityId\":null,\"entityId\":null"),
        encoded.replace("\"properties\":{}", "\"properties\":{\"bad\":1}"),
        encoded.replace("\"textBlockKindChange\"", "\"wrapList\""),
    ] {
        assert!(codec.decode(&malformed).is_err(), "accepted malformed record: {malformed}");
    }
    Ok(())
}

#[test]
fn replacement_count_and_paragraph_shape_are_exact() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    for replacement in [
        json!([]),
        json!([{"kind":"paragraph","level":2}]),
        json!([{"kind":"paragraph","level":null}]),
        json!([{"kind":"heading"}]),
        json!([{"kind":"paragraph"},{"kind":"heading","level":1}]),
        json!([{"kind":"list"}]),
        json!({"kind":"paragraph"}),
    ] {
        let mut value: Value = serde_json::from_str(&encoded)?;
        value["operation"]["replacement"] = replacement;
        assert!(codec.decode(&value.to_string()).is_err());
    }
    Ok(())
}

#[test]
fn guard_root_and_semantic_source_validation_cannot_be_bypassed() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    for source in [
        json!({"kind":"text","text":"bad","formats":[]}),
        json!({"kind":"element","type":"breditor/heading","entityId":null,"properties":{},"children":[]}),
        json!({"kind":"element","type":"breditor/heading","entityId":null,"properties":{"breditor/level":7},"children":[]}),
        json!({"kind":"element","type":"breditor/paragraph","entityId":"example/id","properties":{},"children":[]}),
    ] {
        let mut value: Value = serde_json::from_str(&encoded)?;
        value["operation"]["expected"]["children"][0] = source;
        assert!(codec.decode(&value.to_string()).is_err());
    }
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["operation"]["expected"]["children"] = json!([]);
    assert!(codec.decode(&value.to_string()).is_err());
    value["operation"]["expected"] = json!({"kind":"text","text":"bad","formats":[]});
    assert!(codec.decode(&value.to_string()).is_err());
    Ok(())
}

#[test]
fn fingerprint_admission_precedes_guard_materialization() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["schemaFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    value["operation"] = json!({"kind":"textBlockKindChange","expected":"invalid"});
    assert_eq!(
        codec.decode(&value.to_string()).err().ok_or("binding error")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    value["schema"]["name"] = json!("other/schema");
    assert_eq!(
        codec.decode(&value.to_string()).err().ok_or("binding error")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    Ok(())
}

#[test]
fn byte_budget_accepts_exact_boundary_and_rejects_one_less_on_both_paths() -> TestResult {
    let (context, _, operation) = fixture()?;
    let encoded = OperationJsonCodecV4::new(context.clone()).encode(&operation)?;
    let exact = OperationJsonCodecV4::new(EditorContext::new(
        context.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    ));
    assert_eq!(exact.encode(&operation)?, encoded);
    assert_eq!(exact.decode(&encoded)?, operation);
    let short = OperationJsonCodecV4::new(EditorContext::new(
        context.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    ));
    assert!(matches!(short.encode(&operation), Err(OperationV4CodecError::OutputTooLarge { .. })));
    assert!(matches!(short.decode(&encoded), Err(OperationV4CodecError::InputTooLarge { .. })));
    Ok(())
}

#[test]
fn guard_node_text_format_and_property_budgets_apply_to_decode_and_encode() -> TestResult {
    let (context, _, operation) = fixture()?;
    let encoded = OperationJsonCodecV4::new(context.clone()).encode(&operation)?;
    for limits in [
        DocumentLimits::default().with_max_nodes(2),
        DocumentLimits::default().with_max_node_depth(1),
        DocumentLimits::default().with_max_children_per_element(0),
        DocumentLimits::default().with_max_text_bytes(1),
        DocumentLimits::default().with_max_total_text_bytes(1),
        DocumentLimits::default().with_max_formats_per_text(1),
        DocumentLimits::default().with_max_properties_per_owner(0),
        DocumentLimits::default().with_max_property_values(0),
        DocumentLimits::default().with_max_property_string_bytes(1),
        DocumentLimits::default().with_max_total_property_string_bytes(1),
    ] {
        let codec = OperationJsonCodecV4::new(EditorContext::new(context.schema().clone(), limits));
        assert!(codec.decode(&encoded).is_err());
        assert!(codec.encode(&operation).is_err());
    }
    Ok(())
}

#[test]
fn decoded_stale_guard_rejects_atomically_without_erasing_redo() -> TestResult {
    let (context, before, operation) = fixture()?;
    let codec = OperationJsonCodecV4::new(context.clone());
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![operation.clone()]))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    let mut value: Value = serde_json::from_str(&codec.encode(&operation)?)?;
    value["operation"]["expected"]["children"][0]["children"][0]["text"] = json!("different");
    let stale = codec.decode(&value.to_string())?;
    assert!(session.apply_transaction(&Transaction::new(&current, vec![stale])).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo retained")?;
    Ok(())
}

#[test]
fn guard_fragment_covers_only_its_declared_span_not_unselected_siblings() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let selected = block(heading(3)?, "", FormatSet::default())?;
    let operation = Operation::TextBlockKindChange(TextBlockKindChange::try_new(
        1,
        vec![selected.clone()],
        vec![TextBlockKind::Paragraph],
    )?);
    let codec = OperationJsonCodecV4::new(context.clone());
    let decoded = codec.decode(&codec.encode(&operation)?)?;
    let before = state(
        &context,
        vec![
            block(
                TextBlockKind::Paragraph,
                "unselected sibling changed independently",
                formats()?,
            )?,
            selected,
        ],
        None,
        None,
    )?;
    let retained_path = NodePath::try_from_indices(vec![0])?;
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![decoded]))?;
    assert_eq!(
        session.state().document().node_at(&retained_path)?,
        before.document().node_at(&retained_path)?
    );
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), before.document());
    Ok(())
}

#[test]
fn decoded_fragment_cannot_bypass_whole_result_property_budget() -> TestResult {
    let context = context(DocumentLimits::default().with_max_property_values(1))?;
    let before = state(
        &context,
        vec![
            block(heading(1)?, "", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        ],
        None,
        None,
    )?;
    let operation = Operation::TextBlockKindChange(TextBlockKindChange::capture(
        &context,
        before.document(),
        1..2,
        heading(2)?,
    )?);
    let codec = OperationJsonCodecV4::new(context);
    let decoded = codec.decode(&codec.encode(&operation)?)?;
    let mut session = EditorSession::new(before.clone());
    assert!(session.apply_transaction(&Transaction::new(&before, vec![decoded])).is_err());
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn legacy_schema_cannot_gain_structural_capability_by_rebinding_an_envelope() -> TestResult {
    let (_, encoded) = encoded_fixture()?;
    let base = CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/headings")?, SchemaVersion::one()),
        &extensions()?,
    )?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["schemaFingerprint"] = json!(base.fingerprint().to_string());
    let codec = OperationJsonCodecV4::new(EditorContext::new(base, DocumentLimits::default()));
    assert_eq!(
        codec.decode(&value.to_string()).err().ok_or("capability rejection")?.code(),
        CodecErrorCode::ValidationFailed
    );
    Ok(())
}

#[test]
fn source_properties_keep_duplicate_and_key_order_rejection() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    let property = "\"example/href\":\"https://example.com/🙂\"";
    assert!(encoded.contains(property));
    let duplicate = encoded.replace(property, &format!("{property},{property}"));
    assert!(codec.decode(&duplicate).is_err());
    let unsorted = encoded.replace(property, &format!("{property},\"example/aaa\":false"));
    assert!(codec.decode(&unsorted).is_err());
    Ok(())
}

#[test]
fn excess_replacement_items_stop_before_owned_target_reconstruction() -> TestResult {
    let (codec, encoded) = encoded_fixture()?;
    let excess = encoded.replace(
        "\"replacement\":[{\"kind\":\"heading\",\"level\":2}]",
        "\"replacement\":[{\"kind\":\"heading\",\"level\":2},{\"unknown\":\"not a valid target\"}]",
    );
    assert_ne!(excess, encoded);
    let Err(OperationV4CodecError::InvalidJson(error)) = codec.decode(&excess) else {
        return Err("expected count failure".into());
    };
    assert!(error.message().contains("too many block-kind replacements"));
    Ok(())
}

proptest! {
    #[test]
    fn v4_randomized_mixed_kind_wire_and_inverse_roundtrip(ranks in prop::collection::vec(0_u32..=6, 1..12), target in 0_u32..=6, start in 0_usize..12) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let kind = |rank| if rank == 0 { Ok(TextBlockKind::Paragraph) } else { heading(rank) };
            let blocks = ranks.iter().map(|rank| block(kind(*rank)?, "a🙂e\u{301}", formats()?)).collect::<Result<Vec<_>, _>>()?;
            let before = state(&context, blocks, None, None)?;
            let start = u32::try_from(start % ranks.len())?;
            let operation = Operation::TextBlockKindChange(TextBlockKindChange::capture(&context, before.document(), start..u32::try_from(ranks.len())?, kind(target)?)?);
            let codec = OperationJsonCodecV4::new(context);
            let encoded = codec.encode(&operation)?;
            let decoded = codec.decode(&encoded)?;
            assert_eq!(operation, decoded);
            assert_eq!(codec.encode(&decoded)?, encoded);
            let mut session = EditorSession::new(before.clone());
            if let Some(commit) = session.apply_transaction(&Transaction::new(&before, vec![decoded]))?.into_commit() {
                let inverse = codec.decode(&codec.encode(&commit.inverse_operations()[0])?)?;
                session.apply_transaction(&Transaction::new(session.state(), vec![inverse]))?;
                assert_eq!(session.state().document(), before.document());
                assert_eq!(session.state().pending_formats(), before.pending_formats());
            }
            Ok(())
        })();
        result.map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
