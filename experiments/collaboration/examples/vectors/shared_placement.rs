//! Independent native cycle resolution and exact future selective-history operations.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica,
        actions::{InsertText, MoveBlock},
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
fn el(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let children = Value::Array(children);
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":children})
}
fn list(id: &str, item: &str, text: &str, content: &str) -> Value {
    el(
        "bullet-list",
        id,
        vec![el(
            "list-item",
            item,
            vec![el("paragraph", text, vec![json!({"kind":"text","text":content,"formats":[]})])],
        )],
    )
}
fn capture(a: &RichReplica) -> Result<Value> {
    Ok(json!({"checkpoint":a.checkpoint()?,"view":a.view_json()?,"bytes":a.updates()?}))
}
pub fn generate(input: &str) -> Result<Value> {
    let mut input: Value = serde_json::from_str(input)?;
    input["root"]["children"] = json!([
        list("list-a", "item-a", "text-a", "Alpha🙂"),
        list("list-b", "item-b", "text-b", "Beta")
    ]);
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(input["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let input = input.to_string();
    let mut a = RichReplica::new(codec.clone(), &input, "9007199254740993".into())?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    let point = TextPoint { block: "text-b".into(), offset: 1, affinity: Affinity::After };
    b.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    a.apply(vec![
        Command::MoveBlock(MoveBlock {
            block: "list-a".into(),
            parent: Some("item-b".into()),
            before: None,
        }),
        Command::InsertText(InsertText {
            block: "text-a".into(),
            offset: 0,
            text: "Offline ".into(),
        }),
    ])?;
    b.apply(vec![Command::MoveBlock(MoveBlock {
        block: "list-b".into(),
        parent: Some("item-a".into()),
        before: None,
    })])?;
    b.receive(a.updates()?)?;
    let checkpoint = b.checkpoint()?;
    let current = capture(&b)?;
    b.undo()?;
    let undo = capture(&b)?;
    b.redo()?;
    let redo = capture(&b)?;
    b.undo()?;
    let undo_again = capture(&b)?;
    Ok(
        json!({"input":input,"checkpoint":checkpoint,"current":current,"undo":undo,"redo":redo,"undo_again":undo_again}),
    )
}
