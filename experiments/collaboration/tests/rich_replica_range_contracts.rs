//! Shared range replacement follows core semantics while retaining source characters and history.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{
            InsertBlocks, InsertText, RangeTextRun, ReplaceTextRange, SetFormat, SplitTextBlock,
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
type TestResult = Result<(), Box<dyn std::error::Error>>;
fn codec() -> Result<DocumentJsonCodecV2, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn peers() -> Result<(RichReplica, RichReplica), Box<dyn std::error::Error>> {
    let codec = codec()?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    let a = RichReplica::new(codec.clone(), &input, "1".into())?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn range(a: (&str, u32), b: (&str, u32)) -> Selection {
    Selection::TextRange { anchor: point(a.0, a.1), focus: point(b.0, b.1) }
}
fn replace(a: (&str, u32), b: (&str, u32), runs: Vec<RangeTextRun>) -> Command {
    Command::ReplaceTextRange(ReplaceTextRange {
        anchor: point(a.0, a.1),
        focus: point(b.0, b.1),
        runs,
    })
}
fn plain(text: &str) -> Vec<RangeTextRun> {
    vec![RangeTextRun { text: text.into(), formats: vec![] }]
}
fn node<'a>(v: &'a Value, id: &str) -> Option<&'a Value> {
    if v.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(v);
    }
    v.get("children").and_then(Value::as_array)?.iter().find_map(|v| node(v, id))
}
fn value(a: &RichReplica) -> Value {
    serde_json::from_str(a.document_json()).expect("document")
}
fn text(a: &RichReplica, id: &str) -> Option<String> {
    node(&value(a)["root"], id).map(|v| {
        v["children"].as_array().expect("runs").iter().filter_map(|r| r["text"].as_str()).collect()
    })
}
fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn create(parent: Option<&str>, nodes: Vec<Value>) -> Command {
    Command::InsertBlocks(InsertBlocks { parent: parent.map(str::to_owned), before: None, nodes })
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
fn same_block_rich_replacement_retains_suffix_formats_and_exact_directional_history() -> TestResult
{
    let (mut a, _) = peers()?;
    a.set_selection(Some(&range(("p", 3), ("p", 1))))?;
    let before = a.document_json().to_owned();
    a.apply(vec![replace(("p", 3), ("p", 1), plain("X🙂"))])?;
    assert_eq!(text(&a, "p").as_deref(), Some("aX🙂b"));
    let v = value(&a);
    assert_eq!(node(&v["root"], "p").ok_or("p")?["children"][1]["formats"], json!([]));
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.document_json(), before);
        assert_eq!(a.selection()?, Some(range(("p", 3), ("p", 1))));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
#[test]
fn sibling_flow_replacement_removes_selected_media_and_retains_the_last_source_suffix() -> TestResult
{
    let (mut a, mut b) = peers()?;
    a.apply(vec![create(Some("cell"), vec![paragraph("end", "Tail🙂")])])?;
    b.receive(a.updates()?)?;
    let before = a.document_json().to_owned();
    a.apply(vec![replace(("p", 1), ("end", 2), plain("New"))])?;
    assert_eq!(text(&a, "p").as_deref(), Some("aNewil🙂"));
    assert!(node(&value(&a)["root"], "image-block").is_none());
    assert!(text(&a, "end").is_none());
    b.apply(vec![Command::InsertText(InsertText {
        block: "end".into(),
        offset: 2,
        text: "R".into(),
    })])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "p").as_deref(), Some("aNewRil🙂"));
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)["root"], "image-block").is_some());
    assert_eq!(text(&a, "end").as_deref(), Some("TaRil🙂"));
    assert_ne!(a.document_json(), before);
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&a, "p").as_deref(), Some("aNewRil🙂"));
    Ok(())
}
#[test]
fn selected_plain_typing_uses_logical_start_style_and_restores_both_saved_selections() -> TestResult
{
    let (mut a, _) = peers()?;
    a.set_selection(Some(&range(("p", 3), ("p", 1))))?;
    a.insert_plain_text("X🙂")?;
    assert_eq!(text(&a, "p").as_deref(), Some("aX🙂b"));
    assert_eq!(a.selection()?, Some(range(("p", 4), ("p", 4))));
    assert_eq!(
        node(&value(&a)["root"], "p").ok_or("p")?["children"].as_array().ok_or("runs")?.len(),
        1
    );
    a.undo()?;
    assert_eq!(a.selection()?, Some(range(("p", 3), ("p", 1))));
    a.redo()?;
    assert_eq!(a.selection()?, Some(range(("p", 4), ("p", 4))));
    Ok(())
}
#[test]
fn empty_plain_input_deletes_a_noncollapsed_selection_once() -> TestResult {
    let (mut a, _) = peers()?;
    a.set_selection(Some(&range(("p", 1), ("p", 3))))?;
    a.insert_plain_text("")?;
    assert_eq!(text(&a, "p").as_deref(), Some("ab"));
    a.undo()?;
    assert_eq!(text(&a, "p").as_deref(), Some("a🙂b"));
    Ok(())
}
#[test]
fn later_commands_in_one_atomic_group_override_inserted_format_intents() -> TestResult {
    let (mut a, _) = peers()?;
    let strong = json!({"type":"breditor/strong","properties":{}});
    let before = a.document_json().to_owned();
    a.apply(vec![
        replace(
            ("p", 1),
            ("p", 3),
            vec![RangeTextRun { text: "X".into(), formats: vec![strong.clone()] }],
        ),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 1,
            length: 1,
            format: strong,
            enabled: false,
        }),
    ])?;
    assert_eq!(node(&value(&a)["root"], "p").ok_or("p")?["children"][1]["formats"], json!([]));
    assert_eq!(a.undo_count(), 1);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    Ok(())
}
#[test]
fn unsupported_cross_container_and_half_scalar_ranges_are_atomic() -> TestResult {
    let (mut a, _) = peers()?;
    let before = a.checkpoint()?;
    let observed = a.observe()?;
    for command in
        [replace(("p", 2), ("p", 3), plain("X")), replace(("p", 1), ("caption", 1), plain("X"))]
    {
        assert!(
            a.apply_guarded(
                &observed,
                vec![command],
                SelectionUpdate::Map,
                PendingFormatsUpdate::Map
            )
            .is_err()
        );
        assert_eq!(a.checkpoint()?, before);
        a.check(&observed)?;
    }
    Ok(())
}
#[test]
fn list_head_replacement_keeps_the_last_items_media_tail_and_list_numbering() -> TestResult {
    let (mut a, _) = peers()?;
    let mut image = node(&value(&a)["root"], "image-block").ok_or("image")?.clone();
    image["properties"]["breditor/block-id"] = json!("tail-image");
    image["properties"]["breditor/image-id"] = json!("tail-image-id");
    image["children"] = json!([]);
    let list = json!({"kind":"element","type":"breditor/ordered-list","entityId":null,"properties":{"breditor/block-id":"list","breditor/start":3},"children":[{"kind":"element","type":"breditor/list-item","entityId":null,"properties":{"breditor/block-id":"item-a"},"children":[paragraph("head-a","First")]},{"kind":"element","type":"breditor/list-item","entityId":null,"properties":{"breditor/block-id":"item-b"},"children":[paragraph("head-b","Last🙂"),image]}]});
    a.apply(vec![create(None, vec![list])])?;
    let before = a.document_json().to_owned();
    a.apply(vec![replace(("head-a", 2), ("head-b", 2), plain("X"))])?;
    assert_eq!(text(&a, "head-a").as_deref(), Some("FiXst🙂"));
    assert_eq!(
        node(&value(&a)["root"], "item-a").ok_or("item")?["children"][1]["properties"]["breditor/block-id"],
        "tail-image"
    );
    assert_eq!(node(&value(&a)["root"], "list").ok_or("list")?["properties"]["breditor/start"], 3);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    assert_eq!(text(&a, "head-a").as_deref(), Some("FiXst🙂"));
    Ok(())
}

#[test]
fn multiple_inserted_runs_have_complete_formats_without_changing_the_suffix() -> TestResult {
    let (mut a, _) = peers()?;
    let selection = range(("p", 3), ("p", 1));
    a.set_selection(Some(&selection))?;
    let strong = json!({"type":"breditor/strong","properties":{}});
    a.apply(vec![replace(
        ("p", 1),
        ("p", 3),
        vec![
            RangeTextRun { text: "X".into(), formats: vec![] },
            RangeTextRun { text: "Y🙂".into(), formats: vec![strong] },
            RangeTextRun { text: "Z".into(), formats: vec![] },
        ],
    )])?;
    assert_eq!(text(&a, "p").as_deref(), Some("aXY🙂Zb"));
    let doc = value(&a);
    let runs = node(&doc["root"], "p").ok_or("p")?["children"].as_array().ok_or("runs")?;
    assert_eq!(runs.len(), 5);
    assert_eq!(runs[1]["formats"], json!([]));
    assert_eq!(runs[3]["formats"], json!([]));
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(text(&a, "p").as_deref(), Some("a🙂b"));
        assert_eq!(a.selection()?.as_ref(), Some(&selection));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
#[test]
fn caption_selection_replacement_uses_the_same_source_contract() -> TestResult {
    let (mut a, _) = peers()?;
    a.set_selection(Some(&range(("caption", 2), ("caption", 1))))?;
    a.insert_plain_text("Q")?;
    assert_eq!(text(&a, "caption").as_deref(), Some("xQ🙂"));
    assert_eq!(a.selection()?, Some(range(("caption", 2), ("caption", 2))));
    a.undo()?;
    assert_eq!(text(&a, "caption").as_deref(), Some("xy🙂"));
    Ok(())
}
#[test]
fn earlier_creation_and_range_replacement_share_one_exact_history_group() -> TestResult {
    let (mut a, _) = peers()?;
    let before = a.document_json().to_owned();
    a.apply(vec![
        create(Some("cell"), vec![paragraph("end", "Suffix")]),
        replace(("p", 1), ("end", 1), plain("New")),
    ])?;
    assert_eq!(text(&a, "p").as_deref(), Some("aNewuffix"));
    assert_eq!(a.undo_count(), 1);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    assert_eq!(text(&a, "p").as_deref(), Some("aNewuffix"));
    Ok(())
}
#[test]
fn an_earlier_split_and_cross_source_replacement_keep_one_undo_boundary() -> TestResult {
    let (mut a, _) = peers()?;
    let before = a.document_json().to_owned();
    a.set_selection(Some(&range(("p", 1), ("p", 3))))?;
    a.apply(vec![
        Command::SplitTextBlock(SplitTextBlock {
            block: "p".into(),
            offset: 1,
            right: "right".into(),
            right_heading: None,
        }),
        replace(("p", 0), ("right", 2), plain("New")),
    ])?;
    assert_eq!(text(&a, "p").as_deref(), Some("Newb"));
    a.undo()?;
    assert_eq!(a.document_json(), before);
    assert_eq!(a.selection()?, Some(range(("p", 1), ("p", 3))));
    a.redo()?;
    assert_eq!(text(&a, "p").as_deref(), Some("Newb"));
    Ok(())
}
