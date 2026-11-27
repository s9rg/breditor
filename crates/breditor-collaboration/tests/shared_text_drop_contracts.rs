//! Shared inline drag-and-drop: the browser lowers one same-editor drop to ONE guarded batch of two
//! existing `replace_text_range` commands (delete the source, insert its exact runs at the target
//! offset mapped through the deletion). These contracts pin that the batch is one writer-local Undo
//! step, keeps run formats, converges with a concurrent peer edit and is refused atomically when stale.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{InsertBlocks, InsertText, RangeTextRun, ReplaceTextRange},
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
type TestResult = Result<(), Box<dyn std::error::Error>>;
fn peers() -> Result<(RichReplica, RichReplica), Box<dyn std::error::Error>> {
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    let mut a = RichReplica::new(codec.clone(), &input, "1".into())?;
    // `d`: "ab" + strong "cd" + "ef", appended to the fixture's table cell flow.
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: Some("cell".into()),
        before: None,
        nodes: vec![
            json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"d"},"children":[{"kind":"text","text":"ab","formats":[]},{"kind":"text","text":"cd","formats":[strong()]},{"kind":"text","text":"ef","formats":[]}]}),
        ],
    })])?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn replace(block: &str, start: u32, end: u32, runs: Vec<RangeTextRun>) -> Command {
    Command::ReplaceTextRange(ReplaceTextRange {
        anchor: point(block, start),
        focus: point(block, end),
        runs,
    })
}
fn cd() -> Vec<RangeTextRun> {
    vec![RangeTextRun { text: "cd".into(), formats: vec![strong()] }]
}
/** The batch `sharedTextDrop` produces for moving d[2,4) to the end of d (offset 6 -> 4). */
fn moved() -> Vec<Command> {
    vec![replace("d", 2, 4, vec![]), replace("d", 4, 4, cd())]
}
fn selected() -> SelectionUpdate {
    SelectionUpdate::Set(Some(Selection::TextRange { anchor: point("d", 4), focus: point("d", 6) }))
}
fn runs(a: &RichReplica) -> Result<Value, Box<dyn std::error::Error>> {
    let value: Value = serde_json::from_str(a.document_json())?;
    let cell = &value["root"]["children"][0]["children"][0]["children"][0]["children"];
    Ok(cell.as_array().ok_or("cell")?.last().ok_or("d")?["children"].clone())
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> TestResult {
    let x = a.updates()?;
    let y = b.updates()?;
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn a_drop_batch_is_one_undo_step_that_keeps_formats_and_selects_the_dropped_runs() -> TestResult {
    let (mut a, _) = peers()?;
    let before = a.document_json().to_owned();
    let undo = a.undo_count();
    let observed = a.observe()?;
    assert!(a.apply_guarded(&observed, moved(), selected(), PendingFormatsUpdate::Map)?);
    assert_eq!(
        runs(&a)?,
        json!([{"kind":"text","text":"abef","formats":[]},{"kind":"text","text":"cd","formats":[strong()]}])
    );
    assert_eq!(
        a.selection()?,
        Some(Selection::TextRange { anchor: point("d", 4), focus: point("d", 6) })
    );
    assert_eq!(a.undo_count(), undo + 1);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    Ok(())
}

#[test]
fn a_drop_converges_with_a_concurrent_edit_and_undo_keeps_the_peer_text() -> TestResult {
    let (mut a, mut b) = peers()?;
    let observed = a.observe()?;
    assert!(a.apply_guarded(&observed, moved(), selected(), PendingFormatsUpdate::Map)?);
    b.apply(vec![Command::InsertText(InsertText {
        block: "d".into(),
        offset: 0,
        text: "Z".into(),
    })])?;
    sync(&mut a, &mut b)?;
    let text = |a: &RichReplica| -> Result<String, Box<dyn std::error::Error>> {
        Ok(runs(a)?
            .as_array()
            .ok_or("runs")?
            .iter()
            .filter_map(|run| run["text"].as_str())
            .collect())
    };
    assert_eq!(text(&a)?, "Zabefcd");
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a)?, "Zabcdef");
    Ok(())
}

#[test]
fn a_stale_drop_batch_publishes_nothing() -> TestResult {
    let (mut a, _) = peers()?;
    let observed = a.observe()?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "d".into(),
        offset: 0,
        text: "Z".into(),
    })])?;
    let checkpoint = a.checkpoint()?;
    assert!(a.apply_guarded(&observed, moved(), selected(), PendingFormatsUpdate::Map).is_err());
    assert_eq!(a.checkpoint()?, checkpoint);
    Ok(())
}
