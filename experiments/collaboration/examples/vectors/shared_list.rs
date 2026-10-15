//! Native list and retained-normalization recovery vectors for independent Wasm replay.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica,
        actions::{
            DeleteBlock, IndentListItems, InsertBlocks, InsertText, JoinListItems, ListStyle,
            NestedList, OutdentListItems, SetListKind, SplitListItem, UnwrapList, WrapList,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
fn owner(input: &str) -> Result<(RichReplica, DocumentJsonCodecV2)> {
    let v: Value = serde_json::from_str(input)?;
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(v["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(u32::try_from(
                v["schema"]["version"].as_u64().ok_or("schema version")?,
            )?)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    Ok((RichReplica::new(codec.clone(), input, "9007199254740993".into())?, codec))
}
fn snapshot(a: &RichReplica) -> Result<Value> {
    Ok(json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?}))
}
fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn caret(block: &str, offset: u32) -> Selection {
    let p = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
fn wrap(first: &str, last: &str, container: &str, items: &[&str]) -> Command {
    Command::WrapList(WrapList {
        first: first.into(),
        last: last.into(),
        container: container.into(),
        items: items.iter().map(|v| (*v).into()).collect(),
        style: ListStyle::Ordered { start: 3 },
    })
}
fn normalized(a: &RichReplica) -> Result<String> {
    fn find<'a>(v: &'a Value, id: &str) -> Option<&'a Value> {
        if v.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
            return Some(v);
        }
        v["children"].as_array()?.iter().find_map(|v| find(v, id))
    }
    let value: Value = serde_json::from_str(a.document_json())?;
    Ok(find(&value["root"],"cell").ok_or("cell")?["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("normalized text")?.into())
}
pub fn generate(input: &str) -> Result<Value> {
    let (mut a, codec) = owner(input)?;
    a.set_selection(Some(&caret("caption", 2)))?;
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: Some("cell".into()),
        before: None,
        nodes: vec![paragraph("end", "Tail🙂"), paragraph("third", "Last")],
    })])?;
    a.apply(vec![wrap("p", "third", "list", &["item-1", "item-2", "item-3"])])?;
    a.apply(vec![Command::SplitListItem(SplitListItem {
        block: "p".into(),
        offset: 1,
        new_item: "right-item".into(),
        right: "right".into(),
        right_heading: Some(2),
    })])?;
    a.apply(vec![Command::JoinListItems(JoinListItems {
        container: "list".into(),
        left: "item-1".into(),
        right: "right-item".into(),
    })])?;
    a.apply(vec![Command::IndentListItems(IndentListItems {
        container: "list".into(),
        first: "item-2".into(),
        last: "item-2".into(),
        new_nested: Some(NestedList {
            block: "nested".into(),
            style: ListStyle::Ordered { start: 7 },
        }),
    })])?;
    a.apply(vec![Command::IndentListItems(IndentListItems {
        container: "list".into(),
        first: "item-3".into(),
        last: "item-3".into(),
        new_nested: None,
    })])?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    a.set_selection(Some(&caret("end", 3)))?;
    a.apply(vec![Command::OutdentListItems(OutdentListItems {
        container: "nested".into(),
        first: "item-2".into(),
        last: "item-2".into(),
        fresh_tail: None,
    })])?;
    a.apply(vec![Command::UnwrapList(UnwrapList { container: "list".into() })])?;
    a.apply(vec![Command::SetListKind(SetListKind {
        container: "nested".into(),
        style: ListStyle::Bullet,
    })])?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "end".into(), offset: 0, text: "Remote".into() }),
        Command::InsertText(InsertText { block: "p".into(), offset: 3, text: "R".into() }),
    ])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = snapshot(&a)?;
    a.redo()?;
    let redo = snapshot(&a)?;
    a.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "third".into() }),
        Command::UnwrapList(UnwrapList { container: "nested".into() }),
    ])?;
    let unwrapped = snapshot(&a)?;
    a.undo()?;
    let undo = snapshot(&a)?;
    a.redo()?;
    let repeated = snapshot(&a)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"unwrapped":unwrapped,"undo":undo,"repeated":repeated}),
    )
}
pub fn empty(input: &str) -> Result<Value> {
    let (mut a, _) = owner(input)?;
    a.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "p".into() }),
        Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
    ])?;
    let original = normalized(&a)?;
    a.apply(vec![wrap(&original, &original, "old-list", &["old-item"])])?;
    a.set_selection(Some(&caret(&original, 0)))?;
    a.insert_plain_text("Old")?;
    let older_document = a.document_json().to_owned();
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "old-list".into() })])?;
    let spare = normalized(&a)?;
    a.set_selection(Some(&caret(&spare, 0)))?;
    a.apply(vec![wrap(&spare, &spare, "new-list", &["new-item"])])?;
    a.set_selection(Some(&caret(&spare, 0)))?;
    a.insert_plain_text("New")?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = snapshot(&a)?;
    a.redo()?;
    let redo = snapshot(&a)?;
    a.undo()?;
    let undo = snapshot(&a)?;
    a.undo()?;
    let unwrapped = snapshot(&a)?;
    a.undo()?;
    let older = snapshot(&a)?;
    if a.document_json() != older_document {
        return Err("retained normalization leaked into older history".into());
    }
    Ok(
        json!({"checkpoint":checkpoint,"original":original,"spare":spare,"current":current,"redo":redo,"undo":undo,"unwrapped":unwrapped,"older":older}),
    )
}
