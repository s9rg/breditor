//! Independent native caption journal with hidden remote edits and exact future history.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{InsertText, SetImageAlt, SetImageCaption},
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
    let raw: Value = serde_json::from_str(input)?;
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(raw["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let creation = creation_case(input, &codec)?;
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    let caret = |block: &str, offset| {
        let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
        Selection::TextRange { anchor: point.clone(), focus: point }
    };
    a.set_selection(Some(&caret("caption", 2)))?;
    let caption = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"native-caption"},"children":[{"kind":"text","text":"New🙂","formats":[{"type":"breditor/strong","properties":{}}]}]});
    a.apply(vec![Command::SetImageCaption(SetImageCaption {
        block: "image-block".into(),
        caption: Some(caption),
    })])?;
    b.apply(vec![
        Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "Remote ".into(),
        }),
        Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Remote diagram".into(),
            decorative: false,
        }),
    ])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = capture(&a)?;
    a.redo()?;
    let redo = capture(&a)?;
    a.set_selection(Some(&caret("native-caption", 5)))?;
    a.insert_plain_text("!")?;
    let typed = capture(&a)?;
    a.apply(vec![Command::SetImageCaption(SetImageCaption {
        block: "image-block".into(),
        caption: None,
    })])?;
    let clear = capture(&a)?;
    a.undo()?;
    let undo_clear = capture(&a)?;
    a.undo()?;
    let undo_typed = capture(&a)?;
    a.redo()?;
    let redo_typed = capture(&a)?;
    a.redo()?;
    let redo_clear = capture(&a)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"typed":typed,"clear":clear,"undo_clear":undo_clear,"undo_typed":undo_typed,"redo_typed":redo_typed,"redo_clear":redo_clear,"creation":creation}),
    )
}

fn creation_case(input: &str, codec: &DocumentJsonCodecV2) -> Result<Value> {
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    let mut b =
        RichReplica::join(codec.clone(), "room".into(), "9007199254740995".into(), a.updates()?)?;
    let point = TextPoint { block: "seed-caption".into(), offset: 3, affinity: Affinity::After };
    a.apply_with_state(
        vec![Command::SetImageCaption(SetImageCaption {
            block: "image-block".into(),
            caption: Some(json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"seed-caption"},"children":[{"kind":"text","text":"A🙂","formats":[]}]})),
        })],
        SelectionUpdate::Set(Some(Selection::TextRange { anchor: point.clone(), focus: point })),
        PendingFormatsUpdate::Map,
    )?;
    b.receive(a.updates()?)?;
    a.undo()?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "seed-caption".into(),
        offset: 0,
        text: "Remote ".into(),
    })])?;
    a.receive(b.updates()?)?;
    let checkpoint = a.checkpoint()?;
    let current = capture(&a)?;
    a.redo()?;
    let redo = capture(&a)?;
    a.undo()?;
    let undo = capture(&a)?;
    a.redo()?;
    let redo_again = capture(&a)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"undo":undo,"redo_again":redo_again}),
    )
}
