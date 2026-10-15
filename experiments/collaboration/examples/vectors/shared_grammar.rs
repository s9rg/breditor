//! Independent grammar-conflict journals and eight exact future native/Wasm states each.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{InsertBlocks, InsertText, MoveBlock, SetHeading},
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
fn capture(a: &RichReplica) -> Result<Value> {
    Ok(json!({"checkpoint":a.checkpoint()?,"view":a.view_json()?,"bytes":a.updates()?}))
}
fn moved(block: &str, parent: Option<&str>, before: Option<&str>) -> Command {
    Command::MoveBlock(MoveBlock {
        block: block.into(),
        parent: parent.map(str::to_owned),
        before: before.map(str::to_owned),
    })
}
fn caret(block: &str, offset: u32) -> Selection {
    let p = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
fn insert(parent: Option<&str>, node: Value) -> Command {
    Command::InsertBlocks(InsertBlocks {
        parent: parent.map(str::to_owned),
        before: None,
        nodes: vec![node],
    })
}
pub fn generate(input: &str) -> Result<Value> {
    let raw: Value = serde_json::from_str(input)?;
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(raw["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    Ok(json!({"caption":caption(input,&codec)?,"table":table(input,&codec)?}))
}
fn caption(input: &str, codec: &DocumentJsonCodecV2) -> Result<Value> {
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    a.apply(vec![moved("caption", Some("cell"), None)])?;
    let mut b =
        RichReplica::join(codec.clone(), "room".into(), "9007199254740995".into(), a.updates()?)?;
    b.set_selection(Some(&caret("caption", 2)))?;
    a.undo()?;
    b.apply(vec![
        Command::SetHeading(SetHeading { block: "caption".into(), level: Some(3) }),
        Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "Remote ".into(),
        }),
    ])?;
    b.receive(a.updates()?)?;
    let checkpoint = b.checkpoint()?;
    let current = capture(&b)?;
    b.undo()?;
    let undo = capture(&b)?;
    b.redo()?;
    let redo = capture(&b)?;
    b.insert_plain_text("!")?;
    let typed = capture(&b)?;
    b.undo()?;
    let undo_typed = capture(&b)?;
    b.undo()?;
    let undo_heading = capture(&b)?;
    b.redo()?;
    let redo_heading = capture(&b)?;
    b.redo()?;
    let redo_typed = capture(&b)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"undo":undo,"redo":redo,"typed":typed,"undo_typed":undo_typed,"undo_heading":undo_heading,"redo_heading":redo_heading,"redo_typed":redo_typed}),
    )
}
fn table(input: &str, codec: &DocumentJsonCodecV2) -> Result<Value> {
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    let list = json!({"kind":"element","type":"breditor/bullet-list","entityId":null,"properties":{"breditor/block-id":"list"},"children":[{"kind":"element","type":"breditor/list-item","entityId":null,"properties":{"breditor/block-id":"item"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"head"},"children":[{"kind":"text","text":"List","formats":[]}]}]}]});
    a.apply(vec![insert(Some("cell"), list)])?;
    a.apply(vec![moved("list", None, None)])?;
    let mut b =
        RichReplica::join(codec.clone(), "room".into(), "9007199254740995".into(), a.updates()?)?;
    b.set_selection(Some(&caret("caption", 2)))?;
    let table = json!({"kind":"element","type":"breditor/table","entityId":null,"properties":{"breditor/block-id":"inner-table","breditor/table-id":"inner","breditor/columns":[{"id":"column","width":140}],"breditor/merges":[],"breditor/retracted-merges":[]},"children":[{"kind":"element","type":"breditor/table-row","entityId":null,"properties":{"breditor/block-id":"inner-row","breditor/row-id":"row"},"children":[{"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":"inner-cell","breditor/column-id":"column","breditor/header":false},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"inner-text"},"children":[{"kind":"text","text":"Inner🙂","formats":[]}]}]}]}]});
    b.apply_with_state(
        vec![insert(Some("item"), table)],
        SelectionUpdate::Set(Some(Selection::Node { block: "inner-table".into() })),
        PendingFormatsUpdate::Map,
    )?;
    a.undo()?;
    b.receive(a.updates()?)?;
    let checkpoint = b.checkpoint()?;
    let current = capture(&b)?;
    b.undo()?;
    let undo = capture(&b)?;
    b.redo()?;
    let redo = capture(&b)?;
    b.apply(vec![moved("inner-table", None, Some("table-block"))])?;
    let moved = capture(&b)?;
    b.undo()?;
    let undo_move = capture(&b)?;
    b.redo()?;
    let redo_move = capture(&b)?;
    b.undo()?;
    let undo_move_again = capture(&b)?;
    b.undo()?;
    let undo_table_again = capture(&b)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"undo":undo,"redo":redo,"moved":moved,"undo_move":undo_move,"redo_move":redo_move,"undo_move_again":undo_move_again,"undo_table_again":undo_table_again}),
    )
}
