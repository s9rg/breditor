//! Native-created opaque presence, source routing and deferred causal catchup.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertText, SplitTextBlock},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
fn point(offset: u32) -> TextPoint {
    TextPoint { block: "p".into(), offset, affinity: Affinity::After }
}
fn packet(a: &RichReplica) -> Result<String> {
    Ok(a.presence_frame_guarded(&a.observe()?)?)
}
fn capture(a: &RichReplica, packet: &str) -> Result<Value> {
    let before = (a.checkpoint()?, a.view_json()?, a.update_frame()?);
    let resolution = a.resolve_presence_frame(packet)?;
    if before != (a.checkpoint()?, a.view_json()?, a.update_frame()?) {
        return Err("presence read mutated state".into());
    }
    Ok(json!({"resolution":resolution,"checkpoint":before.0,"view":before.1,"frame":before.2}))
}
pub fn generate(input: &str) -> Result<Value> {
    let raw: Value = serde_json::from_str(input)?;
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(raw["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let profile = SharedRichProfile::from_schema(schema, DocumentLimits::default())?;
    let mut a = profile.create(input, "9007199254740993".into())?;
    let mut b = profile.join_frame("room".into(), "9007199254740995".into(), &a.update_frame()?)?;
    b.set_selection(Some(&Selection::TextRange { anchor: point(4), focus: point(1) }))?;
    let presence = packet(&b)?;
    let checkpoint = a.checkpoint()?;
    let current = capture(&a, &presence)?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "X".into(),
    })])?;
    let typed = capture(&a, &presence)?;
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "presence-right".into(),
        right_heading: None,
    })])?;
    let split = capture(&a, &presence)?;
    a.undo()?;
    let undo = capture(&a, &presence)?;
    a.redo()?;
    let redo = capture(&a, &presence)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 4,
        text: "!".into(),
    })])?;
    b.set_selection(Some(&Selection::TextRange { anchor: point(5), focus: point(5) }))?;
    let future = packet(&b)?;
    let pending = capture(&a, &future)?;
    let remote = b.update_frame()?;
    a.receive_frame(&remote)?;
    let received = capture(&a, &future)?;
    Ok(
        json!({"checkpoint":checkpoint,"presence":presence,"current":current,"typed":typed,"split":split,"undo":undo,"redo":redo,"future":future,"pending":pending,"remote":remote,"received":received}),
    )
}
