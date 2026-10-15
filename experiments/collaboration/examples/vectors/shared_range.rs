//! Independent native selected-range/history vector, including remote edits to retained sources.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica,
        actions::{
            InsertText, RangeTextRun, ReplaceTextRange, SetFormat, SetHeading, SplitTextBlock,
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

pub fn generate(input: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let value: Value = serde_json::from_str(input)?;
    let id = SchemaId::new(
        QualifiedName::try_new(value["schema"]["name"].as_str().ok_or("shared schema")?)?,
        SchemaVersion::try_new(u32::try_from(
            value["schema"]["version"].as_u64().ok_or("shared schema version")?,
        )?)?,
    );
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        id,
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let point =
        |block: &str, offset| TextPoint { block: block.into(), offset, affinity: Affinity::After };
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "p".into(),
        offset: 1,
        right: "right".into(),
        right_heading: None,
    })])?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    a.set_selection(Some(&Selection::TextRange {
        anchor: point("right", 2),
        focus: point("p", 0),
    }))?;
    let strong = json!({"type":"breditor/strong","properties":{}});
    a.apply(vec![
        Command::ReplaceTextRange(ReplaceTextRange {
            anchor: point("right", 2),
            focus: point("p", 0),
            runs: vec![
                RangeTextRun { text: "X".into(), formats: vec![] },
                RangeTextRun { text: "Y🙂".into(), formats: vec![strong.clone()] },
            ],
        }),
        Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) }),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 0,
            length: 1,
            format: strong,
            enabled: true,
        }),
    ])?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "right".into(), offset: 2, text: "R".into() }),
        Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "remote".into(),
        }),
    ])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let snapshot = |a: &RichReplica| -> Result<Value, Box<dyn std::error::Error>> {
        Ok(json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?}))
    };
    let checkpoint = a.checkpoint()?;
    let current = snapshot(&a)?;
    a.redo()?;
    let redo = snapshot(&a)?;
    a.set_selection(Some(&Selection::TextRange { anchor: point("p", 4), focus: point("p", 4) }))?;
    a.insert_plain_text("!")?;
    let typed = snapshot(&a)?;
    a.undo()?;
    let undo = snapshot(&a)?;
    a.redo()?;
    let retyped = snapshot(&a)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"typed":typed,"undo":undo,"retyped":retyped}),
    )
}
