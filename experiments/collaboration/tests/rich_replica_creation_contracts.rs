//! Functional shared creation, canonical intersections, owned visibility and exact restart.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica,
    actions::{
        InsertBlocks, InsertColumn, InsertRow, InsertText, MergeCells, ResizeColumn, SetHeader,
        SplitCell,
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
fn newly_created_column_width_undo_keeps_the_remote_contribution_visible() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![column("created-width")])?;
    b.receive(a.updates()?)?;
    let resize = |width| {
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "created-width".into(),
            width,
        })
    };
    a.apply(vec![resize(320)])?;
    b.receive(a.updates()?)?;
    b.apply(vec![resize(640)])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
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
    let x = a.updates()?;
    let y = b.updates()?;
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn value(replica: &RichReplica) -> Result<Value, serde_json::Error> {
    serde_json::from_str(replica.document_json())
}
fn node<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(value);
    }
    value.get("children").and_then(Value::as_array)?.iter().find_map(|value| node(value, block))
}
fn paragraph(block: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":block},"children":[{"kind":"text","text":text,"formats":[{"type":"breditor/strong","properties":{}}]}]})
}
fn create(parent: Option<&str>, before: Option<&str>, nodes: Vec<Value>) -> Command {
    Command::InsertBlocks(InsertBlocks {
        parent: parent.map(str::to_owned),
        before: before.map(str::to_owned),
        nodes,
    })
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn row(block: &str, id: &str) -> Command {
    Command::InsertRow(InsertRow {
        block: "table-block".into(),
        row_block: block.into(),
        row: id.into(),
        before: Some("row".into()),
    })
}
fn column(id: &str) -> Command {
    Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: id.into(),
        width: 240,
        before: Some("c".into()),
    })
}
fn cell(
    replica: &RichReplica,
    row: &str,
    column: &str,
) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(node(&value(replica)?["root"], row).ok_or("row")?["children"]
        .as_array()
        .ok_or("cells")?
        .iter()
        .find(|cell| cell["properties"]["breditor/column-id"] == column)
        .ok_or("cell")?
        .clone())
}
fn identity(node: &Value) -> Result<&str, Box<dyn std::error::Error>> {
    Ok(node["properties"]["breditor/block-id"].as_str().ok_or("block")?)
}
fn text(node: &Value) -> String {
    node["children"].as_array().map_or_else(String::new, |runs| {
        runs.iter().filter_map(|run| run["text"].as_str()).collect()
    })
}

fn rekey(node: &mut Value, prefix: &str) {
    if let Some(properties) = node["properties"].as_object_mut() {
        for key in [
            "breditor/block-id",
            "breditor/table-id",
            "breditor/image-id",
            "breditor/row-id",
            "breditor/column-id",
            "breditor/asset-generation",
        ] {
            if let Some(id) = properties.get_mut(key)
                && let Some(text) = id.as_str()
            {
                *id = json!(format!("{prefix}-{text}"));
            }
        }
        if let Some(columns) = properties.get_mut("breditor/columns").and_then(Value::as_array_mut)
        {
            for column in columns {
                column["id"] = json!(format!("{prefix}-{}", column["id"].as_str().unwrap_or("")));
            }
        }
    }
    if let Some(children) = node["children"].as_array_mut() {
        for child in children {
            if child["kind"] == "element" {
                rekey(child, prefix);
            }
        }
    }
}

fn grid() -> Result<(RichReplica, RichReplica), Box<dyn std::error::Error>> {
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("new-row", "r2"), column("c2")])?;
    sync(&mut a, &mut b)?;
    Ok((a, b))
}

fn merge(
    replica: &RichReplica,
    id: &str,
    first_row: &str,
    last_row: &str,
) -> Result<Command, Box<dyn std::error::Error>> {
    Ok(Command::MergeCells(MergeCells {
        block: "table-block".into(),
        merge: id.into(),
        anchor: identity(&cell(replica, first_row, "c2")?)?.into(),
        focus: identity(&cell(replica, last_row, "c")?)?.into(),
    }))
}
fn span(replica: &RichReplica) -> Result<(u32, u32), Box<dyn std::error::Error>> {
    let table = replica
        .document()
        .table(&breditor_core::rich_content::TableId::try_new("t")?)?
        .ok_or("table")?;
    let master = table.geometry().cell(0, 0).ok_or("master")?;
    Ok((master.row_span(), master.column_span()))
}

#[test]
fn complete_tables_images_headings_and_lists_create_as_one_selective_group() -> TestResult {
    let (mut a, mut b) = peers()?;
    let source = value(&a)?;
    let mut table = source["root"]["children"][0].clone();
    rekey(&mut table, "created");
    let mut image = node(&source["root"], "image-block").ok_or("source image")?.clone();
    rekey(&mut image, "standalone");
    let mut heading = paragraph("heading-new", "Title🙂");
    heading["type"] = json!("breditor/heading");
    heading["properties"]["breditor/level"] = json!(2);
    let list = json!({"kind":"element","type":"breditor/ordered-list","entityId":null,"properties":{"breditor/block-id":"list-new","breditor/start":3},"children":[{"kind":"element","type":"breditor/list-item","entityId":null,"properties":{"breditor/block-id":"item-new"},"children":[paragraph("list-p","Item")]}]});
    a.apply(vec![create(None, None, vec![table, image, heading, list])])?;
    assert_eq!(a.undo_count(), 1);
    b.receive(a.updates()?)?;
    b.apply(vec![insert("created-caption", "Remote caption "), insert("list-p", "Shared ")])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    for block in ["created-table-block", "standalone-image-block", "heading-new", "list-new"] {
        assert!(node(&value(&a)?["root"], block).is_none());
    }
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    Ok(())
}

#[test]
fn shared_merge_and_split_keep_covered_remote_text_and_exact_creator_history() -> TestResult {
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-a", "new-row", "new-row")?])?;
    let covered = cell(&b, "new-row", "c")?;
    b.apply(vec![insert(identity(&covered["children"][0])?, "Covered🙂")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 2));
    assert_eq!(text(&cell(&a, "new-row", "c")?["children"][0]), "Covered🙂");
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 1));
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 2));
    a.apply(vec![Command::SplitCell(SplitCell { cell: identity(&covered)?.into() })])?;
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 1));
    assert_eq!(text(&cell(&a, "new-row", "c")?["children"][0]), "Covered🙂");
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 2));
    Ok(())
}

#[test]
fn independent_splits_retract_winning_and_known_losing_intents_without_cross_writer_undo()
-> TestResult {
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-a", "new-row", "row")?])?;
    b.apply(vec![merge(&b, "m-b", "new-row", "new-row")?])?;
    sync(&mut a, &mut b)?;
    let target = identity(&cell(&a, "new-row", "c2")?)?.to_owned();
    let split = Command::SplitCell(SplitCell { cell: target });
    a.apply(vec![split.clone()])?;
    b.apply(vec![split])?;
    sync(&mut a, &mut b)?;
    let document = value(&a)?;
    let properties = &node(&document["root"], "table-block").ok_or("table")?["properties"];
    assert_eq!(properties["breditor/retracted-merges"], json!(["m-a", "m-b"]));
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 1));
    assert!(b.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?.1, 2);
    Ok(())
}

#[test]
fn creator_merge_undo_and_redo_cannot_retract_a_later_remote_split() -> TestResult {
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-a", "new-row", "row")?])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::SplitCell(SplitCell {
        cell: identity(&cell(&b, "row", "c")?)?.into(),
    })])?;
    a.receive(b.updates()?)?;
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 1));
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (1, 1));
    assert!(b.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (2, 2));
    Ok(())
}

#[test]
fn split_does_not_retract_a_concurrent_unobserved_merge() -> TestResult {
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-old", "new-row", "row")?])?;
    b.receive(a.updates()?)?;
    a.apply(vec![Command::SplitCell(SplitCell {
        cell: identity(&cell(&a, "new-row", "c")?)?.into(),
    })])?;
    b.apply(vec![merge(&b, "m-new", "new-row", "new-row")?])?;
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (2, 2));
    let document = value(&a)?;
    let properties = &node(&document["root"], "table-block").ok_or("table")?["properties"];
    assert_eq!(properties["breditor/retracted-merges"], json!(["m-old"]));
    assert_eq!(properties["breditor/merges"].as_array().ok_or("records")?.len(), 2);
    Ok(())
}

#[test]
fn interior_axis_creation_expands_existing_merge_without_reallocating_bodies() -> TestResult {
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-all", "new-row", "row")?])?;
    b.receive(a.updates()?)?;
    a.apply(vec![Command::InsertRow(InsertRow {
        block: "table-block".into(),
        row_block: "interior-row".into(),
        row: "ri".into(),
        before: Some("row".into()),
    })])?;
    b.apply(vec![column("ci")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(span(&a)?, (3, 3));
    assert_eq!(text(node(&value(&a)?["root"], "p").ok_or("original body")?), "a🙂b");
    Ok(())
}

#[test]
fn shared_headers_require_complete_merged_source_cells_and_keep_later_remote_values() -> TestResult
{
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-header", "new-row", "new-row")?])?;
    let first = identity(&cell(&a, "new-row", "c2")?)?.to_owned();
    let last = identity(&cell(&a, "new-row", "c")?)?.to_owned();
    let prior = a.checkpoint()?;
    for block in [&first, &last] {
        assert!(
            a.apply(vec![Command::SetHeader(SetHeader {
                cells: vec![block.clone()],
                header: true
            })])
            .is_err()
        );
        assert_eq!(a.checkpoint()?, prior);
    }
    let header = |value| {
        Command::SetHeader(SetHeader { cells: vec![first.clone(), last.clone()], header: value })
    };
    a.apply(vec![header(true)])?;
    b.receive(a.updates()?)?;
    b.apply(vec![header(false)])?;
    a.receive(b.updates()?)?;
    assert!(a.undo()?);
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(cell(&a, "new-row", "c2")?["properties"]["breditor/header"], false);
    assert_eq!(cell(&a, "new-row", "c")?["properties"]["breditor/header"], false);
    Ok(())
}

#[test]
fn merged_creation_and_observed_split_replay_with_identical_future_effects() -> TestResult {
    let (mut a, mut b) = grid()?;
    a.apply(vec![merge(&a, "m-reload", "new-row", "row")?])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::SplitCell(SplitCell {
        cell: identity(&cell(&b, "row", "c2")?)?.into(),
    })])?;
    a.receive(b.updates()?)?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    assert_eq!(a.document_json(), restored.document_json());
    assert!(a.undo()?);
    assert!(restored.undo()?);
    assert_eq!(a.updates()?, restored.updates()?);
    assert!(a.redo()?);
    assert!(restored.redo()?);
    assert_eq!(a.updates()?, restored.updates()?);
    assert_eq!(span(&a)?, (1, 1));
    Ok(())
}

#[test]
fn independent_flow_creation_converges_and_undo_keeps_the_other_created_block() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![create(None, Some("table-block"), vec![paragraph("a-new", "A🙂")])])?;
    b.apply(vec![create(None, Some("table-block"), vec![paragraph("b-new", "B")])])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(node(&value(&a)?["root"], "a-new").ok_or("A block")?), "A🙂");
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "a-new").is_none());
    assert_eq!(text(node(&value(&a)?["root"], "b-new").ok_or("B block")?), "B");
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&value(&a)?["root"], "a-new").ok_or("A restored")?["children"][0]["formats"],
        json!([{"type":"breditor/strong","properties":{}}])
    );
    Ok(())
}

#[test]
fn creator_undo_hides_but_does_not_erase_another_writers_text_in_the_new_block() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![create(None, None, vec![paragraph("new", "Initial🙂")])])?;
    b.receive(a.updates()?)?;
    b.apply(vec![insert("new", "Remote ")])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "new").is_none());
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    assert_eq!(text(node(&value(&a)?["root"], "new").ok_or("restored block")?), "Remote Initial🙂");
    Ok(())
}

#[test]
fn independently_added_row_and_column_share_one_editable_intersection() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("new-row", "r2")])?;
    b.apply(vec![column("c2")])?;
    sync(&mut a, &mut b)?;
    let intersection = cell(&a, "new-row", "c2")?;
    let block = identity(&intersection["children"][0])?.to_owned();
    a.apply(vec![insert(&block, "A")])?;
    b.apply(vec![insert(&block, "B🙂")])?;
    sync(&mut a, &mut b)?;
    let combined = text(&cell(&a, "new-row", "c2")?["children"][0]);
    assert!(combined.contains('A') && combined.contains("B🙂"));
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(text(&cell(&a, "new-row", "c2")?["children"][0]), "B🙂");
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "new-row").is_none());
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(text(&cell(&a, "new-row", "c2")?["children"][0]), "B🙂");
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(text(&cell(&a, "new-row", "c2")?["children"][0]), combined);
    Ok(())
}

#[test]
fn derived_cells_support_rich_children_and_owned_headers_with_selective_history() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("new-row", "r2")])?;
    sync(&mut a, &mut b)?;
    let derived = cell(&a, "new-row", "c")?;
    let cell_block = identity(&derived)?.to_owned();
    a.apply(vec![
        create(Some(&cell_block), None, vec![paragraph("cell-rich", "Hello")]),
        Command::SetHeader(SetHeader { cells: vec![cell_block.clone()], header: true }),
    ])?;
    b.receive(a.updates()?)?;
    b.apply(vec![insert("cell-rich", "Remote ")])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    let undone = cell(&a, "new-row", "c")?;
    assert_eq!(undone["properties"]["breditor/header"], false);
    assert!(node(&value(&a)?["root"], "cell-rich").is_none());
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    assert_eq!(cell(&a, "new-row", "c")?["properties"]["breditor/header"], true);
    Ok(())
}

#[test]
fn simultaneous_rows_and_columns_survive_selective_undo_and_original_order_redo() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("row-a", "ra"), column("ca")])?;
    b.apply(vec![row("row-b", "rb"), column("cb")])?;
    sync(&mut a, &mut b)?;
    let before = a.document_json().to_owned();
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], "row-a").is_none());
    assert!(node(&value(&a)?["root"], "row-b").is_some());
    let doc = value(&a)?;
    let table = node(&doc["root"], "table-block").ok_or("table")?;
    assert_eq!(table["properties"]["breditor/columns"].as_array().ok_or("columns")?.len(), 2);
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    Ok(())
}

#[test]
fn column_creation_undo_retains_remote_header_and_body_for_redo() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![column("c2")])?;
    b.receive(a.updates()?)?;
    let derived = cell(&b, "row", "c2")?;
    b.apply(vec![
        insert(identity(&derived["children"][0])?, "Retained🙂"),
        Command::SetHeader(SetHeader { cells: vec![identity(&derived)?.into()], header: true }),
    ])?;
    a.receive(b.updates()?)?;
    let before = a.document_json().to_owned();
    assert!(a.undo()?);
    sync(&mut a, &mut b)?;
    assert!(cell(&a, "row", "c2").is_err());
    assert!(a.redo()?);
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    Ok(())
}

#[test]
fn malformed_records_and_historical_identity_reuse_reject_without_partial_creation() -> TestResult {
    let (mut a, _) = peers()?;
    let initial = a.document_json().to_owned();
    let journal = a.checkpoint()?;
    let mut invalid = paragraph("new", "Invalid");
    invalid["unexpected"] = json!(true);
    assert!(a.apply(vec![create(None, None, vec![paragraph("first", "First"), invalid])]).is_err());
    assert_eq!(a.document_json(), initial);
    assert_eq!(a.checkpoint()?, journal);
    a.apply(vec![create(None, None, vec![paragraph("retained-id", "Initial")])])?;
    a.undo()?;
    let before = a.checkpoint()?;
    assert!(
        a.apply(vec![create(None, None, vec![paragraph("retained-id", "Replacement")])]).is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.redo()?;
    assert_eq!(text(node(&value(&a)?["root"], "retained-id").ok_or("old content")?), "Initial");
    Ok(())
}

#[test]
fn shared_creation_restart_keeps_exact_future_operation_bytes() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![
        row("new-row", "r2"),
        column("c2"),
        create(None, None, vec![paragraph("new", "Hello🙂")]),
    ])?;
    b.receive(a.updates()?)?;
    b.apply(vec![insert("new", "Remote ")])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    assert_eq!(restored.document_json(), a.document_json());
    assert!(a.redo()?);
    assert!(restored.redo()?);
    assert_eq!(restored.document_json(), a.document_json());
    assert_eq!(restored.updates()?, a.updates()?);
    assert!(a.undo()?);
    assert!(restored.undo()?);
    assert_eq!(restored.updates()?, a.updates()?);
    Ok(())
}
