//! Independent native journal for atomic selected flow paste and unseen original-source appends.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        ClipboardNamespace, Command, RichReplica,
        actions::{InsertText, SetFormat},
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
pub fn generate(input: &str) -> Result<Value> {
    let value: Value = serde_json::from_str(input)?;
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(value["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    a.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    let fragment = a.copy_clipboard_guarded(&a.observe()?)?.ok_or("copy")?.rich_json;
    let point = |offset| TextPoint { block: "p".into(), offset, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point(3), focus: point(1) }))?;
    a.paste_flow_at_text_guarded(
        &a.observe()?,
        &fragment,
        "native-flow-suffix",
        &mut ClipboardNamespace::try_new("native-selected-flow")?,
    )?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "p".into(), offset: 4, text: "!".into() }),
        Command::InsertText(InsertText { block: "caption".into(), offset: 0, text: "R".into() }),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 3,
            length: 1,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: false,
        }),
    ])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = capture(&a)?;
    a.redo()?;
    let redo = capture(&a)?;
    let point =
        TextPoint { block: "native-flow-suffix".into(), offset: 2, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    a.insert_plain_text(" typed")?;
    let typed = capture(&a)?;
    a.undo()?;
    let undo = capture(&a)?;
    a.redo()?;
    let repeated = capture(&a)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"typed":typed,"undo":undo,"repeated":repeated}),
    )
}
