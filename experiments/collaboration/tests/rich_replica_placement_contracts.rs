//! Valid concurrent structure edits must project a complete forest, never an invisible cycle.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica,
    actions::{InsertColumn, MoveBlock},
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
            QualifiedName::try_new("example/shared-placement")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let children = Value::Array(children);
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":children})
}
fn list(id: &str, item: &str, text: &str, content: &str) -> Value {
    element(
        "bullet-list",
        id,
        vec![element(
            "list-item",
            item,
            vec![element(
                "paragraph",
                text,
                vec![json!({"kind":"text","text":content,"formats":[]})],
            )],
        )],
    )
}
fn seed(writer: &str) -> Result<RichReplica> {
    seeded(
        writer,
        vec![
            list("list-a", "item-a", "text-a", "Alpha🙂"),
            list("list-b", "item-b", "text-b", "Beta"),
        ],
    )
}
fn seeded(writer: &str, children: Vec<Value>) -> Result<RichReplica> {
    let children = Value::Array(children);
    let codec = codec()?;
    let schema = codec.schema();
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":children});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":1},"schemaFingerprint":schema.fingerprint().to_string(),"root":root});
    Ok(RichReplica::new(codec, &input.to_string(), writer.into())?)
}
fn moved(block: &str, parent: &str) -> Command {
    Command::MoveBlock(MoveBlock { block: block.into(), parent: Some(parent.into()), before: None })
}
fn text(value: &Value) -> String {
    value["text"].as_str().map_or_else(
        || {
            value["children"]
                .as_array()
                .map_or_else(String::new, |children| children.iter().map(text).collect())
        },
        str::to_owned,
    )
}
fn root(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(a.document_json())?["root"].clone())
}

#[test]
fn reciprocal_moves_demote_the_lower_priority_edge_without_losing_either_list() -> Result {
    for (left, right, expected) in [("1", "2", "list-a"), ("2", "1", "list-b")] {
        for reverse in [false, true] {
            let mut a = seed(left)?;
            let mut b = RichReplica::join(codec()?, "room".into(), right.into(), a.updates()?)?;
            a.apply(vec![moved("list-a", "item-b")])?;
            b.apply(vec![moved("list-b", "item-a")])?;
            let (x, y) = (a.updates()?, b.updates()?);
            if reverse {
                b.receive(x)?;
                a.receive(y)?;
            } else {
                a.receive(y)?;
                b.receive(x)?;
            }
            assert_eq!(a.document_json(), b.document_json());
            let root = root(&a)?;
            assert_eq!(root["children"][0]["properties"]["breditor/block-id"], expected);
            let content = text(&root);
            assert_eq!(content.matches("Alpha🙂").count(), 1);
            assert_eq!(content.matches("Beta").count(), 1);
        }
    }
    Ok(())
}

#[test]
fn suspended_move_reappears_after_winner_undo_and_future_history_restarts_exactly() -> Result {
    let mut a = seed("1")?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    a.apply(vec![moved("list-a", "item-b")])?;
    b.apply(vec![moved("list-b", "item-a")])?;
    let (x, y) = (a.updates()?, b.updates()?);
    a.receive(y)?;
    b.receive(x)?;
    let mut restored = RichReplica::restore(codec()?, "room", &b.checkpoint()?)?;
    for _ in 0..3 {
        b.undo()?;
        restored.undo()?;
        assert_eq!(root(&b)?["children"][0]["properties"]["breditor/block-id"], "list-b");
        assert_eq!(text(&root(&b)?), "BetaAlpha🙂");
        assert_eq!(b.checkpoint()?, restored.checkpoint()?);
        b.redo()?;
        restored.redo()?;
        assert_eq!(root(&b)?["children"][0]["properties"]["breditor/block-id"], "list-a");
        assert_eq!(text(&root(&b)?), "Alpha🙂Beta");
        assert_eq!(b.checkpoint()?, restored.checkpoint()?);
    }
    // Undo/Redo of the masked lower-priority move does not erase the winner.
    let current = a.document_json().to_owned();
    a.undo()?;
    assert_eq!(a.document_json(), current);
    a.redo()?;
    assert_eq!(a.document_json(), current);
    Ok(())
}

#[test]
fn a_local_move_into_its_own_descendant_rejects_without_changing_history_or_authority() -> Result {
    let mut a = seed("1")?;
    let checkpoint = a.checkpoint()?;
    let observation = a.observe()?;
    for parent in ["list-a", "item-a", "text-a"] {
        assert!(a.apply(vec![moved("list-a", parent)]).is_err());
        assert_eq!(a.checkpoint()?, checkpoint);
        a.check(&observation)?;
    }
    Ok(())
}

#[test]
fn three_writer_cycle_resolves_identically_in_each_delivery_order() -> Result {
    for order in [[0, 1, 2], [2, 1, 0], [1, 2, 0]] {
        let mut a = seeded(
            "1",
            vec![
                list("list-a", "item-a", "text-a", "Alpha🙂"),
                list("list-b", "item-b", "text-b", "Beta"),
                list("list-c", "item-c", "text-c", "Gamma"),
            ],
        )?;
        let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
        let mut c = RichReplica::join(codec()?, "room".into(), "3".into(), a.updates()?)?;
        a.apply(vec![moved("list-a", "item-b")])?;
        b.apply(vec![moved("list-b", "item-c")])?;
        c.apply(vec![moved("list-c", "item-a")])?;
        let frames = [a.updates()?, b.updates()?, c.updates()?];
        for peer in [&mut a, &mut b, &mut c] {
            for index in order {
                peer.receive(frames[index].clone())?;
            }
        }
        assert_eq!(a.document_json(), b.document_json());
        assert_eq!(b.document_json(), c.document_json());
        assert_eq!(root(&a)?["children"][0]["properties"]["breditor/block-id"], "list-a");
        assert_eq!(text(&root(&a)?), "Alpha🙂GammaBeta");
    }
    Ok(())
}

#[test]
fn concurrent_table_and_list_moves_keep_axes_media_and_both_rich_bodies_visible() -> Result {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let mut children = fixture["children"].as_array().ok_or("fixture root")?.clone();
    children.push(list("list-b", "item-b", "text-b", "Beta"));
    let mut a = seeded("1", children)?;
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    a.apply(vec![moved("table-block", "item-b")])?;
    b.apply(vec![moved("list-b", "cell")])?;
    let (x, y) = (a.updates()?, b.updates()?);
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(root(&a)?["children"][0]["type"], "breditor/table");
    assert_eq!(text(&root(&a)?), "a🙂bxy🙂Beta");
    b.undo()?;
    assert_eq!(root(&b)?["children"][0]["type"], "breditor/bullet-list");
    assert_eq!(text(&root(&b)?), "Betaa🙂bxy🙂");
    b.redo()?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn derived_axis_cells_participate_in_the_placement_ancestor_graph() -> Result {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let mut children = fixture["children"].as_array().ok_or("fixture root")?.clone();
    children.push(list("list-b", "item-b", "text-b", "Beta"));
    let mut a = seeded("1", children)?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "new-column".into(),
        width: 100,
        before: None,
    })])?;
    let raw = root(&a)?;
    let cell = raw["children"][0]["children"][0]["children"][1]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("derived cell")?
        .to_owned();
    let mut b = RichReplica::join(codec()?, "room".into(), "2".into(), a.updates()?)?;
    a.apply(vec![moved("table-block", "item-b")])?;
    b.apply(vec![moved("list-b", &cell)])?;
    let (x, y) = (a.updates()?, b.updates()?);
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(root(&a)?["children"][0]["type"], "breditor/table");
    assert_eq!(text(&root(&a)?), "a🙂bxy🙂Beta");
    Ok(())
}
