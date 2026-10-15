//! Independently valid kind/placement edits must merge without invalid ASTs or copied content.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica,
    actions::{DeleteColumn, InsertBlocks, InsertText, MoveBlock, SetHeading, SetImageCaption},
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn codec() -> Result<DocumentJsonCodecV2> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new("example/shared-grammar")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn seed() -> Result<RichReplica> {
    let codec = codec()?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":1},"schemaFingerprint":schema.fingerprint().to_string(),"root":root});
    Ok(RichReplica::new(codec, &input.to_string(), "1".into())?)
}
fn node<'a>(value: &'a Value, id: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(value);
    }
    value["children"].as_array()?.iter().find_map(|n| node(n, id))
}
fn root(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(a.document_json())?["root"].clone())
}
fn moved(block: &str, parent: Option<&str>) -> Command {
    Command::MoveBlock(MoveBlock {
        block: block.into(),
        parent: parent.map(str::to_owned),
        before: None,
    })
}
fn heading(block: &str, level: Option<u8>) -> Command {
    Command::SetHeading(SetHeading { block: block.into(), level })
}
fn insert(parent: Option<&str>, before: Option<&str>, nodes: Vec<Value>) -> Command {
    Command::InsertBlocks(InsertBlocks {
        parent: parent.map(str::to_owned),
        before: before.map(str::to_owned),
        nodes,
    })
}
fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn list() -> Value {
    json!({"kind":"element","type":"breditor/bullet-list","entityId":null,"properties":{"breditor/block-id":"list"},"children":[{"kind":"element","type":"breditor/list-item","entityId":null,"properties":{"breditor/block-id":"item"},"children":[paragraph("list-text","List body")]}]})
}
fn table() -> Value {
    json!({"kind":"element","type":"breditor/table","entityId":null,"properties":{"breditor/block-id":"inner-table","breditor/table-id":"inner","breditor/columns":[{"id":"inner-column","width":140}],"breditor/merges":[],"breditor/retracted-merges":[]},"children":[{"kind":"element","type":"breditor/table-row","entityId":null,"properties":{"breditor/block-id":"inner-row","breditor/row-id":"inner-row-id"},"children":[{"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":"inner-cell","breditor/column-id":"inner-column","breditor/header":false},"children":[paragraph("inner-text","Inner🙂")]}]}]})
}
fn root_ids(a: &RichReplica) -> Result<Vec<String>> {
    Ok(root(a)?["children"]
        .as_array()
        .ok_or("root children")?
        .iter()
        .map(|node| {
            node["properties"]["breditor/block-id"].as_str().map(str::to_owned).ok_or("block")
        })
        .collect::<std::result::Result<_, _>>()?)
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let (x, y) = (a.updates()?, b.updates()?);
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn concurrent_heading_and_caption_move_keep_the_kind_and_expose_a_compatible_placement() -> Result {
    let mut a = seed()?;
    a.apply(vec![Command::SetImageCaption(SetImageCaption {
        block: "image-block".into(),
        caption: None,
    })])?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    a.apply(vec![moved("p", Some("image-block"))])?;
    b.apply(vec![heading("p", Some(2))])?;
    sync(&mut a, &mut b)?;
    let current = root(&a)?;
    assert_eq!(node(&current, "p").ok_or("heading")?["type"], "breditor/heading");
    assert_eq!(
        node(&current, "cell").ok_or("cell")?["children"][0]["properties"]["breditor/block-id"],
        "p"
    );
    assert_eq!(node(&current, "image-block").ok_or("image")?["children"], json!([]));
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&root(&a)?, "image-block").ok_or("image")?["children"][0]["properties"]["breditor/block-id"],
        "p"
    );
    b.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(root(&a)?, current);
    Ok(())
}

#[test]
fn incompatible_caption_origin_escapes_to_a_real_root_occurrence_with_exact_future_history()
-> Result {
    let mut a = seed()?;
    a.apply(vec![moved("caption", Some("cell"))])?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    a.undo()?;
    b.apply(vec![
        heading("caption", Some(3)),
        Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "Remote ".into(),
        }),
    ])?;
    sync(&mut a, &mut b)?;
    assert_eq!(root_ids(&a)?, ["table-block", "caption"]);
    assert_eq!(node(&root(&a)?, "caption").ok_or("escaped")?["type"], "breditor/heading");
    let mut restored = RichReplica::restore(codec()?, "room", &b.checkpoint()?)?;
    for _ in 0..3 {
        b.undo()?;
        restored.undo()?;
        assert_eq!(root_ids(&b)?, ["table-block"]);
        assert_eq!(
            node(&root(&b)?, "image-block").ok_or("image")?["children"][0]["properties"]["breditor/block-id"],
            "caption"
        );
        assert_eq!(b.checkpoint()?, restored.checkpoint()?);
        b.redo()?;
        restored.redo()?;
        assert_eq!(root_ids(&b)?, ["table-block", "caption"]);
        assert_eq!(
            node(&root(&b)?, "caption").ok_or("caption")?["children"][0]["text"],
            "Remote xy🙂"
        );
        assert_eq!(b.checkpoint()?, restored.checkpoint()?);
    }
    a.apply(vec![insert(None, None, vec![paragraph("tail", "Tail")])])?;
    assert_eq!(root_ids(&a)?, ["table-block", "caption", "tail"]);
    a.apply(vec![insert(None, Some("caption"), vec![paragraph("before", "Before")])])?;
    assert_eq!(root_ids(&a)?, ["table-block", "before", "caption", "tail"]);
    a.apply(vec![Command::MoveBlock(MoveBlock {
        block: "tail".into(),
        parent: None,
        before: Some("caption".into()),
    })])?;
    assert_eq!(root_ids(&a)?, ["table-block", "before", "tail", "caption"]);
    Ok(())
}

#[test]
fn concurrent_table_creation_suspends_an_ancestor_move_until_creation_is_undone() -> Result {
    let mut a = seed()?;
    a.apply(vec![insert(None, None, vec![list()])])?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    a.apply(vec![insert(Some("item"), None, vec![table()])])?;
    b.apply(vec![moved("list", Some("cell"))])?;
    sync(&mut a, &mut b)?;
    assert_eq!(root_ids(&a)?, ["table-block", "list"]);
    assert!(node(node(&root(&a)?, "list").ok_or("list")?, "inner-table").is_some());
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(root_ids(&a)?, ["table-block"]);
    assert!(node(node(&root(&a)?, "cell").ok_or("cell")?, "list").is_some());
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(root_ids(&a)?, ["table-block", "list"]);
    assert_eq!(
        node(&root(&a)?, "inner-text").ok_or("inner body")?["children"][0]["text"],
        "Inner🙂"
    );
    Ok(())
}

#[test]
fn a_foreign_table_created_after_relocation_survives_ancestor_undo_at_root() -> Result {
    let mut a = seed()?;
    a.apply(vec![insert(Some("cell"), None, vec![list()])])?;
    a.apply(vec![moved("list", None)])?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    b.apply(vec![insert(Some("item"), None, vec![table()])])?;
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(root_ids(&a)?, ["table-block", "inner-table"]);
    assert!(node(node(&root(&a)?, "cell").ok_or("cell")?, "list").is_some());
    let mut restored = RichReplica::restore(codec()?, "room", &b.checkpoint()?)?;
    for _ in 0..3 {
        b.undo()?;
        restored.undo()?;
        assert_eq!(root_ids(&b)?, ["table-block"]);
        assert_eq!(b.checkpoint()?, restored.checkpoint()?);
        b.redo()?;
        restored.redo()?;
        assert_eq!(root_ids(&b)?, ["table-block", "inner-table"]);
        assert_eq!(b.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}

#[test]
fn a_masked_caption_source_cannot_escape_and_reappear_over_the_chosen_caption() -> Result {
    let mut a = seed()?;
    a.apply(vec![moved("caption", Some("cell"))])?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    let mut c = RichReplica::join(codec()?, "room".into(), "3".into(), a.updates()?)?;
    c.apply(vec![Command::SetImageCaption(SetImageCaption {
        block: "image-block".into(),
        caption: Some(paragraph("chosen", "Chosen")),
    })])?;
    a.receive(c.updates()?)?;
    a.undo()?;
    b.apply(vec![heading("caption", Some(4))])?;
    a.receive(b.updates()?)?;
    assert_eq!(root_ids(&a)?, ["table-block"]);
    assert!(node(&root(&a)?, "caption").is_none());
    assert_eq!(
        node(&root(&a)?, "image-block").ok_or("image")?["children"][0]["properties"]["breditor/block-id"],
        "chosen"
    );
    Ok(())
}

#[test]
fn invalid_local_move_is_not_silently_reinterpreted_as_a_root_escape() -> Result {
    let mut a = seed()?;
    a.apply(vec![
        Command::SetImageCaption(SetImageCaption { block: "image-block".into(), caption: None }),
        heading("p", Some(2)),
    ])?;
    let before = a.checkpoint()?;
    let observation = a.observe()?;
    assert!(a.apply(vec![moved("p", Some("image-block"))]).is_err());
    assert_eq!(a.checkpoint()?, before);
    a.check(&observation)?;
    Ok(())
}

#[test]
fn a_column_hidden_caption_does_not_escape_until_its_axis_becomes_visible_again() -> Result {
    let mut a = seed()?;
    a.apply(vec![moved("caption", Some("cell"))])?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    let mut c = RichReplica::join(codec()?, "room".into(), "3".into(), a.updates()?)?;
    a.undo()?;
    b.apply(vec![heading("caption", Some(3))])?;
    c.apply(vec![Command::DeleteColumn(DeleteColumn {
        block: "table-block".into(),
        column: "c".into(),
    })])?;
    a.receive(c.updates()?)?;
    a.receive(b.updates()?)?;
    assert_eq!(root_ids(&a)?, ["table-block"]);
    assert!(node(&root(&a)?, "caption").is_none());
    c.undo()?;
    a.receive(c.updates()?)?;
    assert_eq!(root_ids(&a)?, ["table-block", "caption"]);
    b.undo()?;
    a.receive(b.updates()?)?;
    assert_eq!(root_ids(&a)?, ["table-block"]);
    assert!(node(&root(&a)?, "caption").is_some());
    Ok(())
}
