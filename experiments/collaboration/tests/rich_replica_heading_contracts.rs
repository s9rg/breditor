//! Shared paragraph/heading intent, normalized text, concurrent editing and selective history.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{
            DeleteBlock, InsertBlocks, InsertColumn, InsertText, SetHeading, SplitTextBlock,
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
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    let a = RichReplica::new(codec.clone(), &input, "1".into())?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn heading(block: &str, level: Option<u8>) -> Command {
    Command::SetHeading(SetHeading { block: block.into(), level })
}
fn node<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(value);
    }
    value.get("children").and_then(Value::as_array)?.iter().find_map(|value| node(value, block))
}
fn value(owner: &RichReplica) -> Result<Value, serde_json::Error> {
    serde_json::from_str(owner.document_json())
}
fn block(owner: &RichReplica, id: &str) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(node(&value(owner)?["root"], id).ok_or("block")?.clone())
}
fn level(owner: &RichReplica, id: &str) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(block(owner, id)?["properties"]["breditor/level"].clone())
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> TestResult {
    let aa = a.updates()?;
    let bb = b.updates()?;
    a.receive(bb)?;
    b.receive(aa)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn fallback(owner: &RichReplica) -> Result<String, Box<dyn std::error::Error>> {
    Ok(block(owner, "cell")?["children"][0]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("normalized text")?
        .into())
}
fn empty_cell(owner: &mut RichReplica) -> TestResult {
    owner.apply(vec![
        Command::DeleteBlock(DeleteBlock { block: "p".into() }),
        Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
    ])?;
    Ok(())
}

#[test]
fn heading_conversion_retains_text_formats_identity_and_exact_history_after_restart() -> TestResult
{
    let (mut a, _) = peers()?;
    let before = a.document_json().to_owned();
    let original = block(&a, "p")?;
    a.set_selection(Some(&caret("p", 3)))?;
    a.set_pending_formats(Some(&[]))?;
    a.apply(vec![heading("p", Some(3))])?;
    assert_eq!(block(&a, "p")?["type"], "breditor/heading");
    assert_eq!(level(&a, "p")?, 3);
    assert_eq!(block(&a, "p")?["children"], original["children"]);
    assert_eq!(a.selection()?, Some(caret("p", 3)));
    assert!(a.pending_formats().is_none());
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.document_json(), before);
        assert_eq!(a.pending_formats(), Some(&[][..]));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(level(&a, "p")?, 3);
        assert_eq!(a.updates()?, restored.updates()?);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    a.apply(vec![heading("p", None)])?;
    assert_eq!(block(&a, "p")?, original);
    Ok(())
}

#[test]
fn concurrent_rank_intents_converge_and_masked_undo_cannot_revive_an_undone_rank() -> TestResult {
    for reverse in [false, true] {
        let (mut a, mut b) = peers()?;
        a.apply(vec![heading("p", Some(2))])?;
        b.apply(vec![heading("p", Some(5))])?;
        if reverse {
            sync(&mut b, &mut a)?;
        } else {
            sync(&mut a, &mut b)?;
        }
        assert_eq!(level(&a, "p")?, 5);
        a.undo()?;
        sync(&mut a, &mut b)?;
        assert_eq!(level(&a, "p")?, 5);
        b.undo()?;
        sync(&mut a, &mut b)?;
        assert_eq!(block(&a, "p")?["type"], "breditor/paragraph");
        assert!(level(&a, "p")?.is_null());
        a.redo()?;
        sync(&mut a, &mut b)?;
        assert_eq!(level(&a, "p")?, 2);
        b.redo()?;
        sync(&mut a, &mut b)?;
        assert_eq!(level(&a, "p")?, 5);
    }
    Ok(())
}

#[test]
fn offline_typing_and_caption_edits_survive_another_writers_heading_undo() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![heading("p", Some(4))])?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "p".into(), offset: 1, text: "X".into() }),
        Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "Remote ".into(),
        }),
    ])?;
    sync(&mut a, &mut b)?;
    let runs = block(&a, "p")?["children"].clone();
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(block(&a, "p")?["type"], "breditor/paragraph");
    assert_eq!(block(&a, "p")?["children"], runs);
    assert_eq!(block(&a, "caption")?["children"][0]["text"], "Remote xy🙂");
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(block(&a, "p")?["children"][0]["text"], "a🙂b");
    Ok(())
}

#[test]
fn bad_ranks_caption_headings_and_late_failures_keep_the_owner_and_guard_exact() -> TestResult {
    let (mut a, _) = peers()?;
    let observation = a.observe()?;
    let initial = a.checkpoint()?;
    for commands in [
        vec![heading("p", Some(0))],
        vec![heading("p", Some(7))],
        vec![heading("caption", Some(1))],
        vec![heading("p", Some(2)), heading("caption", Some(1))],
    ] {
        assert!(
            a.apply_guarded(
                &observation,
                commands,
                SelectionUpdate::Map,
                PendingFormatsUpdate::Map
            )
            .is_err()
        );
        assert_eq!(a.checkpoint()?, initial);
        a.check(&observation)?;
    }
    assert!(!a.apply(vec![heading("p", None)])?);
    assert_eq!(a.checkpoint()?, initial);
    assert!(!a.apply(vec![heading("caption", None)])?);
    Ok(())
}

#[test]
fn empty_normalized_heading_survives_flow_creation_and_undo_removes_only_its_kind_claim()
-> TestResult {
    let (mut a, _) = peers()?;
    empty_cell(&mut a)?;
    let id = fallback(&a)?;
    let before = a.document_json().to_owned();
    a.apply(vec![heading(&id, Some(2))])?;
    assert_eq!(level(&a, &id)?, 2);
    a.apply(vec![Command::InsertBlocks(InsertBlocks{parent:Some("cell".into()),before:None,nodes:vec![json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"new-p"},"children":[]})]})])?;
    assert_eq!(block(&a, "cell")?["children"].as_array().ok_or("children")?.len(), 2);
    a.undo()?;
    assert_eq!(level(&a, &id)?, 2);
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    assert_eq!(level(&a, &id)?, 2);
    Ok(())
}

#[test]
fn new_axis_derived_text_and_new_split_targets_can_change_kind_without_source_replacement()
-> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "new-column".into(),
        width: 140,
        before: None,
    })])?;
    let row = block(&a, "row")?;
    let id = row["children"][1]["children"][0]["properties"]["breditor/block-id"]
        .as_str()
        .ok_or("derived text")?
        .to_owned();
    a.apply(vec![heading(&id, Some(4))])?;
    assert_eq!(level(&a, &id)?, 4);
    a.apply(vec![
        Command::SplitTextBlock(SplitTextBlock {
            block: id.clone(),
            offset: 0,
            right: "right".into(),
            right_heading: None,
        }),
        heading("right", Some(3)),
        Command::InsertText(InsertText {
            block: "right".into(),
            offset: 0,
            text: "Typed🙂".into(),
        }),
    ])?;
    assert_eq!(level(&a, &id)?, 4);
    assert_eq!(level(&a, "right")?, 3);
    assert_eq!(block(&a, "right")?["children"][0]["text"], "Typed🙂");
    a.undo()?;
    assert_eq!(level(&a, &id)?, 4);
    a.redo()?;
    assert_eq!(level(&a, "right")?, 3);
    Ok(())
}

#[test]
fn concurrent_flow_creation_cannot_discard_a_normalized_heading_or_resurrect_its_undone_kind()
-> TestResult {
    let (mut a, mut b) = peers()?;
    empty_cell(&mut a)?;
    b.receive(a.updates()?)?;
    let id = fallback(&a)?;
    a.apply(vec![heading(&id, Some(5))])?;
    b.apply(vec![Command::InsertBlocks(InsertBlocks{parent:Some("cell".into()),before:None,nodes:vec![json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"remote-p"},"children":[{"kind":"text","text":"Remote🙂","formats":[]}]})]})])?;
    sync(&mut a, &mut b)?;
    assert_eq!(level(&a, &id)?, 5);
    assert_eq!(block(&a, "cell")?["children"].as_array().ok_or("children")?.len(), 2);
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert!(node(&value(&a)?["root"], &id).is_none());
    assert_eq!(block(&a, "remote-p")?["children"][0]["text"], "Remote🙂");
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(fallback(&a)?, id);
    assert_eq!(block(&a, &id)?["type"], "breditor/paragraph");
    Ok(())
}

#[test]
fn matching_heading_noop_preserves_a_previously_relocated_selection_outcome_and_live_guard()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("p", 1)))?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 1,
        text: "X".into(),
    })])?;
    a.receive(b.updates()?)?;
    assert_eq!(
        serde_json::from_str::<Value>(&a.view_json()?)?["selectionOutcome"]["kind"],
        "relocated"
    );
    let before = a.checkpoint()?;
    let observed = a.observe()?;
    assert!(!a.apply(vec![heading("p", None)])?);
    assert_eq!(a.checkpoint()?, before);
    a.check(&observed)?;
    Ok(())
}

#[test]
fn typing_into_a_normalized_heading_keeps_text_through_kind_undo_and_writer_recovery() -> TestResult
{
    let (mut a, mut b) = peers()?;
    empty_cell(&mut a)?;
    b.receive(a.updates()?)?;
    let id = fallback(&a)?;
    a.apply(vec![heading(&id, Some(2))])?;
    b.set_selection(Some(&caret(&id, 0)))?;
    b.insert_plain_text("Retained🙂")?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(block(&a, &id)?["type"], "breditor/paragraph");
    assert_eq!(block(&a, &id)?["children"][0]["text"], "Retained🙂");
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    a.redo()?;
    restored.redo()?;
    assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    assert_eq!(level(&a, &id)?, 2);
    Ok(())
}
