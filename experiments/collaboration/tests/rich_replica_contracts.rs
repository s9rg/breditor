//! Shared rich AST, not probe JSON: independent content, structural visibility and selective history.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica,
    actions::{
        DeleteBlock, DeleteColumn, InsertText, MoveBlock, MoveColumn, ResizeColumn, ResizeImage,
        SetFormat, SetImageAlt,
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn original_update_envelope_checks_room_schema_engine_and_model_before_import() -> TestResult {
    let (mut a, mut b) = peers()?;
    let frame = a.update_frame()?;
    let joined = RichReplica::join_frame(codec()?, "room".into(), "3".into(), &frame)?;
    assert_eq!(joined.document_json(), a.document_json());
    let before = b.document_json().to_owned();
    let journal = b.checkpoint()?;
    for (field, value) in [
        ("document", json!("other-room")),
        ("schemaFingerprint", json!("other-fingerprint")),
        ("modelVersion", json!(7)),
        ("engine", json!({"name":"loro","version":"other-version"})),
    ] {
        let mut wrong: Value = serde_json::from_str(&frame)?;
        wrong[field] = value;
        wrong["bytes"] = json!([255]);
        let failure = b.receive_frame(&wrong.to_string());
        assert!(matches!(failure, Err(breditor_collab_feasibility::Error::Contract(_))));
        assert_eq!(b.document_json(), before);
        assert_eq!(b.checkpoint()?, journal);
    }
    a.apply(vec![insert("p", 1, "framed")])?;
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn stale_shared_causal_versions_reject_before_target_admission_without_publication() -> TestResult {
    let (mut a, mut b) = peers()?;
    let old = a.causal_version();
    b.apply(vec![insert("p", 1, "remote")])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    let checkpoint = a.checkpoint()?;
    assert!(matches!(
        a.apply_at(&old, vec![insert("missing", u32::MAX, "ignored")]),
        Err(breditor_collab_feasibility::Error::Contract("stale shared causal version"))
    ));
    assert_eq!(a.document_json(), before);
    assert_eq!(a.checkpoint()?, checkpoint);
    let current = a.causal_version();
    let parsed: Value = serde_json::from_str(&current)?;
    assert!(parsed.as_object().ok_or("version object")?.values().all(Value::is_string));
    assert!(a.apply_at(&current, vec![insert("p", 0, "Current ")])?);
    Ok(())
}
fn codec() -> Result<DocumentJsonCodecV2, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn source(codec: &DocumentJsonCodecV2) -> Result<String, Box<dyn std::error::Error>> {
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    Ok(json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string())
}
fn peers() -> Result<(RichReplica, RichReplica), Box<dyn std::error::Error>> {
    let codec = codec()?;
    let a = RichReplica::new(codec.clone(), &source(&codec)?, "1".into())?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> TestResult {
    let a_bytes = a.updates()?;
    let b_bytes = b.updates()?;
    a.receive(b_bytes)?;
    b.receive(a_bytes)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn node<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(value);
    }
    value.get("children").and_then(Value::as_array)?.iter().find_map(|value| node(value, block))
}
fn value(replica: &RichReplica) -> Result<Value, serde_json::Error> {
    serde_json::from_str(replica.document_json())
}
fn block_text(replica: &RichReplica, block: &str) -> Result<String, Box<dyn std::error::Error>> {
    Ok(node(&value(replica)?["root"], block).ok_or("missing text block")?["children"]
        .as_array()
        .ok_or("missing runs")?
        .iter()
        .map(|run| run["text"].as_str().unwrap_or(""))
        .collect())
}

#[test]
fn seeded_shared_primitives_export_the_exact_admitted_rich_ast() -> TestResult {
    let codec = codec()?;
    let input = source(&codec)?;
    let expected = codec.encode(&codec.decode(&input)?)?;
    let a = RichReplica::new(codec.clone(), &input, "1".into())?;
    assert_eq!(a.document_json(), expected);
    assert_eq!(a.undo_count(), 0);
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(b.undo_count(), 0);
    Ok(())
}

#[test]
fn concurrent_cell_caption_and_metadata_edits_converge_and_selective_undo_preserves_remote_work()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![
        insert("p", 1, "A"),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 240,
        }),
    ])?;
    b.apply(vec![
        insert("p", 1, "B"),
        insert("caption", 0, "Caption "),
        Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Remote alt".into(),
            decorative: false,
        }),
    ])?;
    sync(&mut a, &mut b)?;
    let text = block_text(&a, "p")?;
    assert!(text.contains('A') && text.contains('B') && text.contains('🙂'));
    assert_eq!(block_text(&a, "caption")?, "Caption xy🙂");
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "p")?, "aB🙂b");
    assert_eq!(block_text(&a, "caption")?, "Caption xy🙂");
    let doc = value(&a)?;
    assert_eq!(
        node(&doc["root"], "image-block").ok_or("missing image")?["properties"]["breditor/alt-text"],
        "Remote alt"
    );
    assert_eq!(
        node(&doc["root"], "table-block").ok_or("missing table")?["properties"]["breditor/columns"]
            [0]["width"],
        120
    );
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "p")?, text);
    Ok(())
}

#[test]
fn same_field_metadata_undo_and_redo_do_not_impersonate_a_newer_remote_value() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "image-block".into(),
        text: "A".into(),
        decorative: false,
    })])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "image-block".into(),
        text: "B".into(),
        decorative: false,
    })])?;
    a.receive(b.updates()?)?;
    assert!(a.undo()?);
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&value(&a)?["root"], "image-block").ok_or("missing image")?["properties"]["breditor/alt-text"],
        "B"
    );
    Ok(())
}

#[test]
fn owned_typed_format_undo_keeps_the_other_writers_mark_and_original_runs() -> TestResult {
    let (mut a, mut b) = peers()?;
    let change = |enabled| {
        Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled,
        })
    };
    a.apply(vec![change(true)])?;
    b.apply(vec![change(true)])?;
    sync(&mut a, &mut b)?;
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    let doc = value(&a)?;
    let caption = node(&doc["root"], "caption").ok_or("missing caption")?;
    assert_eq!(
        caption["children"][0]["formats"],
        json!([{"type":"breditor/strong","properties":{}}])
    );
    b.apply(vec![change(false)])?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&value(&a)?["root"], "caption").ok_or("missing caption")?["children"][0]["formats"],
        json!([])
    );
    assert!(b.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&value(&a)?["root"], "caption").ok_or("missing caption")?["children"][0]["formats"],
        json!([{"type":"breditor/strong","properties":{}}])
    );
    Ok(())
}

#[test]
fn paired_image_size_converges_without_mixed_dimensions() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::ResizeImage(ResizeImage {
        block: "image-block".into(),
        size: Some([320, 180]),
    })])?;
    b.apply(vec![Command::ResizeImage(ResizeImage {
        block: "image-block".into(),
        size: Some([640, 360]),
    })])?;
    sync(&mut a, &mut b)?;
    let doc = value(&a)?;
    let properties = &node(&doc["root"], "image-block").ok_or("missing image")?["properties"];
    let pair = [
        properties["breditor/width"].as_u64().ok_or("width")?,
        properties["breditor/height"].as_u64().ok_or("height")?,
    ];
    assert!(pair == [320, 180] || pair == [640, 360]);
    Ok(())
}

#[test]
fn deleted_row_hides_offline_text_without_erasing_it_and_undo_recovers_the_remote_edit()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "row".into() })])
        .map_err(|error| format!("delete row: {error}"))?;
    b.apply(vec![insert("p", 1, "survives")])?;
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "p").is_none());
    assert!(a.undo().map_err(|error| format!("row undo: {error}"))?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "p")?, "asurvives🙂b");
    Ok(())
}

#[test]
fn deleting_column_hides_bodies_and_undo_retains_the_remote_cell_edit() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::DeleteColumn(DeleteColumn {
        block: "table-block".into(),
        column: "c".into(),
    })])?;
    b.apply(vec![insert("p", 1, "remote")])?;
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "p").is_none());
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "p")?, "aremote🙂b");
    Ok(())
}

#[test]
fn shared_restart_preserves_future_selective_undo_and_redo_operation_identities() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![insert("p", 1, "local")])?;
    b.apply(vec![insert("caption", 0, "remote")])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    let saved = a.checkpoint()?;
    let mut restored = RichReplica::restore(codec()?, "room", &saved)?;
    assert_eq!(a.document_json(), restored.document_json());
    assert_eq!(a.redo_count(), restored.redo_count());
    assert_eq!(a.redo()?, restored.redo()?);
    assert_eq!(a.updates()?, restored.updates()?);
    assert_eq!(a.document_json(), restored.document_json());
    assert_eq!(a.undo()?, restored.undo()?);
    assert_eq!(a.updates()?, restored.updates()?);
    assert_eq!(block_text(&restored, "caption")?, "remotexy🙂");
    Ok(())
}

#[test]
fn structural_moves_and_failed_groups_preserve_existing_ownership_and_exact_document() -> TestResult
{
    let (mut a, mut b) = peers()?;
    let before = a.document_json().to_owned();
    let saved = a.checkpoint()?;
    assert!(
        a.apply(vec![
            insert("p", 1, "partial"),
            Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([0, 12]) })
        ])
        .is_err()
    );
    assert_eq!(a.document_json(), before);
    assert_eq!(a.checkpoint()?, saved);
    assert!(a.apply(vec![Command::MoveBlock(MoveBlock {
        block: "image-block".into(),
        parent: None,
        before: Some("table-block".into())
    })])?);
    b.apply(vec![insert("caption", 0, "moved ")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(value(&a)?["root"]["children"][0]["properties"]["breditor/block-id"], "image-block");
    assert_eq!(block_text(&a, "caption")?, "moved xy🙂");
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "caption")?, "moved xy🙂");
    assert!(!a.apply(vec![Command::MoveColumn(MoveColumn {
        block: "table-block".into(),
        column: "c".into(),
        before: None
    })])?);
    Ok(())
}

#[test]
fn undoing_one_writers_row_deletion_cannot_retract_an_independent_deletion() -> TestResult {
    let (mut a, mut b) = peers()?;
    let deletion = || Command::DeleteBlock(DeleteBlock { block: "row".into() });
    a.apply(vec![deletion()])?;
    b.apply(vec![deletion()])?;
    sync(&mut a, &mut b)?;
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "row").is_none());
    assert!(b.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "p")?, "a🙂b");
    Ok(())
}

#[test]
fn undoing_one_writers_column_deletion_cannot_retract_an_independent_deletion() -> TestResult {
    let (mut a, mut b) = peers()?;
    let deletion =
        || Command::DeleteColumn(DeleteColumn { block: "table-block".into(), column: "c".into() });
    a.apply(vec![deletion()])?;
    b.apply(vec![deletion()])?;
    sync(&mut a, &mut b)?;
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "p").is_none());
    assert!(b.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, "p")?, "a🙂b");
    Ok(())
}

#[test]
fn selective_move_undo_preserves_a_later_remote_move_of_the_same_node() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::MoveBlock(MoveBlock {
        block: "image-block".into(),
        parent: None,
        before: Some("table-block".into()),
    })])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::MoveBlock(MoveBlock {
        block: "image-block".into(),
        parent: None,
        before: None,
    })])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    a.undo()?;
    assert_eq!(a.document_json(), before);
    sync(&mut a, &mut b)?;
    a.redo()?;
    assert_eq!(a.document_json(), before);
    Ok(())
}

#[test]
fn selective_column_move_undo_and_redo_preserve_a_later_remote_placement() -> TestResult {
    let codec = codec()?;
    let mut input: Value = serde_json::from_str(&source(&codec)?)?;
    let table = &mut input["root"]["children"][0];
    for (index, column) in [(2, "c2"), (3, "c3")] {
        table["properties"]["breditor/columns"]
            .as_array_mut()
            .ok_or("columns")?
            .push(json!({"id":column,"width":120}));
        table["children"][0]["children"].as_array_mut().ok_or("cells")?.push(json!({"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":format!("cell{index}"),"breditor/column-id":column,"breditor/header":false},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":format!("p{index}")},"children":[{"kind":"text","text":format!("body {index}"),"formats":[]}]}]}));
    }
    let mut a = RichReplica::new(codec.clone(), &input.to_string(), "1".into())?;
    let mut b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    a.apply(vec![Command::MoveColumn(MoveColumn {
        block: "table-block".into(),
        column: "c".into(),
        before: None,
    })])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::MoveColumn(MoveColumn {
        block: "table-block".into(),
        column: "c".into(),
        before: Some("c3".into()),
    })])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    a.undo()?;
    assert_eq!(a.document_json(), before);
    sync(&mut a, &mut b)?;
    a.redo()?;
    assert_eq!(a.document_json(), before);
    assert_eq!(block_text(&a, "p2")?, "body 2");
    Ok(())
}

#[test]
fn remote_text_in_a_normalized_empty_document_survives_undoing_the_deletion() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "table-block".into() })])?;
    b.receive(a.updates()?)?;
    let empty = value(&b)?;
    let block = empty["root"]["children"][0]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("normalized root text")?;
    b.apply(vec![insert(block, 0, "Keep this remote text")])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(block_text(&a, block)?, "Keep this remote text");
    assert!(node(&value(&a)?["root"], "table-block").is_some());
    let checkpoint = a.checkpoint()?;
    let restored = RichReplica::restore(codec()?, "room", &checkpoint)?;
    assert_eq!(a.document_json(), restored.document_json());
    Ok(())
}

#[test]
fn hidden_subtree_image_metadata_updates_survive_local_deletion_undo() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "row".into() })])?;
    b.apply(vec![
        Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Hidden remote metadata".into(),
            decorative: false,
        }),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([400, 250]) }),
    ])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    sync(&mut a, &mut b)?;
    let doc = value(&a)?;
    let image = node(&doc["root"], "image-block").ok_or("restored image")?;
    assert_eq!(image["properties"]["breditor/alt-text"], "Hidden remote metadata");
    assert_eq!(image["properties"]["breditor/width"], 400);
    assert_eq!(image["properties"]["breditor/height"], 250);
    Ok(())
}

#[test]
fn typed_extension_formats_keep_their_values_across_shared_editing_and_writer_restart() -> TestResult
{
    use breditor_core::{
        extension::{
            ExtensionId, ExtensionManifest, ExtensionVersion, InlineFormatPropertyContractV1,
            InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, InlineFormatSpecV1,
            PropertyPresenceV1,
        },
        schema::PersistedTypeRevision,
    };
    let kind = QualifiedName::try_new("example/link")?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(QualifiedName::try_new("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::try_new(1)?)],
        vec![InlineFormatPropertyContractV1::try_new(
            kind,
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2048)?,
            )],
        )?],
    )?;
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-links")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?,
    )?);
    let mut a = RichReplica::new(codec.clone(), &source(&codec)?, "1".into())?;
    let mut b = RichReplica::join(codec.clone(), "room".into(), "2".into(), a.updates()?)?;
    let first =
        json!({"type":"example/link","properties":{"example/href":"https://example.test/a🙂"}});
    let second =
        json!({"type":"example/link","properties":{"example/href":"https://example.test/b🙂"}});
    a.apply(vec![Command::SetFormat(SetFormat {
        block: "caption".into(),
        offset: 0,
        length: 2,
        format: first,
        enabled: true,
    })])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::SetFormat(SetFormat {
        block: "caption".into(),
        offset: 0,
        length: 2,
        format: second.clone(),
        enabled: true,
    })])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&value(&a)?["root"], "caption").ok_or("caption")?["children"][0]["formats"],
        json!([second])
    );
    let original = a.checkpoint()?;
    let saved = a.document_json().to_owned();
    assert!(
        a.apply(vec![Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"example/link","properties":{"example/href":12}}),
            enabled: true
        })])
        .is_err()
    );
    assert_eq!(a.checkpoint()?, original);
    let recovered = RichReplica::restore(codec, "room", &original)?;
    assert_eq!(recovered.document_json(), saved);
    Ok(())
}
