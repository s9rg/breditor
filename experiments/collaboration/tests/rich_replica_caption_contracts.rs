//! Shared whole-caption choices keep hidden text causal and selective history writer-owned.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{
            DeleteBlock, DeleteText, InsertBlocks, InsertText, JoinTextBlocks, MoveBlock,
            SetImageCaption,
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
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn native_deleted_gap_control_demonstrates_why_creation_must_retain_seed_characters() -> Result {
    // This is the engine's reinsert-at-gap behavior, not the creation contract.
    // Breditor creation must hide/reveal a retained source instead of invoking it.
    use loro::{ExportMode, LoroDoc, UndoManager};
    let a = LoroDoc::new();
    a.set_peer_id(1)?;
    let mut undo = UndoManager::new(&a);
    a.get_text("text").push_str("A🙂")?;
    a.commit();
    let b = LoroDoc::new();
    b.set_peer_id(2)?;
    b.import(&a.export(ExportMode::all_updates())?)?;
    undo.undo()?;
    a.commit();
    b.get_text("text").insert_utf16(0, "Remote ")?;
    b.commit();
    a.import(&b.export(ExportMode::all_updates())?)?;
    undo.redo()?;
    a.commit();
    assert_eq!(a.get_text("text").to_string(), "A🙂Remote ");
    Ok(())
}
fn codec() -> Result<DocumentJsonCodecV2> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new("example/shared-captions")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn peers() -> Result<(RichReplica, RichReplica)> {
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
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let (x, y) = (a.updates()?, b.updates()?);
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn node<'a>(value: &'a Value, id: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(value);
    }
    value.get("children")?.as_array()?.iter().find_map(|n| node(n, id))
}
fn caption(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn visible_caption(a: &RichReplica) -> Result<Option<Value>> {
    let raw: Value = serde_json::from_str(a.document_json())?;
    Ok(node(&raw["root"], "image-block").ok_or("image")?["children"]
        .as_array()
        .ok_or("captions")?
        .first()
        .cloned())
}
fn set(value: Option<Value>) -> Command {
    Command::SetImageCaption(SetImageCaption { block: "image-block".into(), caption: value })
}
fn text(node: &Value) -> String {
    node["children"].as_array().map_or_else(String::new, |children| {
        children.iter().filter_map(|n| n["text"].as_str()).collect()
    })
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn insert(block: &str, value: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: value.into() })
}
#[test]
fn remove_retains_offline_caption_text_and_causal_selection_for_exact_future_history() -> Result {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("caption", 2)))?;
    a.apply(vec![set(None)])?;
    assert!(visible_caption(&a)?.is_none());
    // Existing shared selection policy may relocate to a safe original neighbour.
    if let Some(Selection::TextRange { anchor, focus }) = a.selection()? {
        assert_ne!(anchor.block, "caption");
        assert_ne!(focus.block, "caption");
    }
    b.apply(vec![insert("caption", "R🙂")])?;
    sync(&mut a, &mut b)?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.selection()?, Some(caret("caption", 5)));
        assert_eq!(text(&visible_caption(&a)?.ok_or("caption")?), "R🙂xy🙂");
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert!(visible_caption(&a)?.is_none());
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}
#[test]
fn concurrent_replacements_select_one_owned_source_and_undo_reveals_the_other() -> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![set(Some(caption("replacement-a", "Alice🙂")))])?;
    b.apply(vec![set(Some(caption("replacement-b", "Bob🙂")))])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("winner")?), "Bob🙂");
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("other choice")?), "Alice🙂");
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("original")?), "xy🙂");
    a.redo()?;
    b.redo()?;
    sync(&mut a, &mut b)?;
    assert!(visible_caption(&a)?.is_some());
    Ok(())
}
#[test]
fn creator_caption_undo_hides_but_never_erases_later_remote_text_or_its_future_caret() -> Result {
    let (mut a, mut b) = peers()?;
    a.apply_with_state(
        vec![set(Some(caption("shared-fresh", "A🙂")))],
        SelectionUpdate::Set(Some(caret("shared-fresh", 3))),
        PendingFormatsUpdate::Map,
    )?;
    b.receive(a.updates()?)?;
    a.undo()?;
    b.apply(vec![insert("shared-fresh", "Remote ")])?;
    a.receive(b.updates()?)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("original")?), "xy🙂");
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.redo()?;
        restored.redo()?;
        assert_eq!(text(&visible_caption(&a)?.ok_or("remote caption")?), "Remote A🙂");
        assert_eq!(a.selection()?, Some(caret("shared-fresh", 10)));
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.undo()?;
        restored.undo()?;
        assert_eq!(text(&visible_caption(&a)?.ok_or("original")?), "xy🙂");
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}

#[test]
fn creation_redo_preserves_remote_insertions_at_every_scalar_seed_boundary() -> Result {
    for (offset, expected) in [(0, "Remote A🙂"), (1, "ARemote 🙂"), (3, "A🙂Remote ")] {
        let (mut a, mut b) = peers()?;
        a.apply(vec![set(Some(caption("fresh", "A🙂")))])?;
        b.receive(a.updates()?)?;
        a.undo()?;
        b.apply(vec![Command::InsertText(InsertText {
            block: "fresh".into(),
            offset,
            text: "Remote ".into(),
        })])?;
        a.receive(b.updates()?)?;
        let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
        for _ in 0..3 {
            a.redo()?;
            restored.redo()?;
            assert_eq!(text(&visible_caption(&a)?.ok_or("caption")?), expected);
            assert_eq!(a.checkpoint()?, restored.checkpoint()?);
            a.undo()?;
            restored.undo()?;
            assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        }
    }
    Ok(())
}

#[test]
fn restored_seed_provenance_retracts_after_remote_join_but_keeps_remote_interior_text() -> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: Some("cell".into()),
        before: Some("image-block".into()),
        nodes: vec![caption("fresh", "A🙂")],
    })])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::DeleteText(DeleteText { block: "fresh".into(), offset: 0, length: 1 })])?;
    b.undo()?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "fresh".into(),
        offset: 1,
        text: "Remote ".into(),
    })])?;
    b.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "p".into(),
        right: "fresh".into(),
    })])?;
    a.receive(b.updates()?)?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        let raw: Value = serde_json::from_str(a.document_json())?;
        assert_eq!(text(node(&raw["root"], "p").ok_or("joined")?), "a🙂bRemote ");
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        let raw: Value = serde_json::from_str(a.document_json())?;
        assert_eq!(text(node(&raw["root"], "p").ok_or("joined")?), "a🙂bARemote 🙂");
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}

#[test]
fn a_third_writers_interior_text_is_not_recategorized_when_the_inherited_writer_undoes() -> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![set(Some(caption("fresh", "A🙂")))])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "fresh".into(),
        offset: 1,
        text: "BC".into(),
    })])?;
    let mut c = RichReplica::join(codec()?, "room".into(), "3".into(), b.updates()?)?;
    c.apply(vec![Command::InsertText(InsertText {
        block: "fresh".into(),
        offset: 2,
        text: "Third".into(),
    })])?;
    b.receive(c.updates()?)?;
    b.undo()?;
    a.receive(b.updates()?)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("caption")?), "AThird🙂");
    a.undo()?;
    a.redo()?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("caption")?), "AThird🙂");
    Ok(())
}
#[test]
fn fresh_caption_keeps_rich_formats_and_every_image_binding_property_unchanged() -> Result {
    let (mut a, mut b) = peers()?;
    let before: Value = serde_json::from_str(a.document_json())?;
    let properties = node(&before["root"], "image-block").ok_or("image")?["properties"].clone();
    let mut fresh = caption("rich-caption", "Fresh🙂");
    fresh["children"][0]["formats"] = json!([{"type":"breditor/strong","properties":{}}]);
    a.apply_with_state(
        vec![set(Some(fresh.clone()))],
        SelectionUpdate::Set(Some(caret("rich-caption", 7))),
        PendingFormatsUpdate::Set(Some(vec![])),
    )?;
    b.apply(vec![insert("caption", "Remote ")])?;
    sync(&mut a, &mut b)?;
    assert_eq!(visible_caption(&a)?, Some(fresh));
    let after: Value = serde_json::from_str(a.document_json())?;
    assert_eq!(node(&after["root"], "image-block").ok_or("image")?["properties"], properties);
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("old caption")?), "Remote xy🙂");
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(a.selection()?, Some(caret("rich-caption", 7)));
    Ok(())
}
#[test]
fn explicit_absence_authors_intent_even_when_already_absent_without_hiding_a_later_remote_choice()
-> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![set(None)])?;
    sync(&mut a, &mut b)?;
    let depth = a.undo_count();
    let original = a.document_json().to_owned();
    assert!(a.apply(vec![set(None)])?);
    assert_eq!(a.document_json(), original);
    assert_eq!(a.undo_count(), depth + 1);
    b.receive(a.updates()?)?;
    b.apply(vec![set(Some(caption("later-caption", "Later")))])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("later")?), "Later");
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("later")?), "Later");
    Ok(())
}
#[test]
fn a_new_image_caption_and_typing_compose_in_one_history_group() -> Result {
    let (mut a, _) = peers()?;
    let original = a.document_json().to_owned();
    let image = json!({"kind":"element","type":"breditor/image","entityId":null,"properties":{"breditor/block-id":"fresh-image-block","breditor/image-id":"fresh-image","breditor/asset-id":"asset","breditor/asset-generation":"fresh-generation","breditor/alt-text":"New diagram","breditor/decorative":false},"children":[]});
    a.apply_with_state(
        vec![
            Command::InsertBlocks(InsertBlocks { parent: None, before: None, nodes: vec![image] }),
            Command::SetImageCaption(SetImageCaption {
                block: "fresh-image-block".into(),
                caption: Some(caption("fresh-caption", "Caption")),
            }),
            insert("fresh-caption", "Typed "),
        ],
        SelectionUpdate::Set(Some(caret("fresh-caption", 6))),
        PendingFormatsUpdate::Map,
    )?;
    assert_eq!(a.undo_count(), 1);
    let after = a.document_json().to_owned();
    let mut r = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.document_json(), original);
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    a.redo()?;
    r.redo()?;
    assert_eq!(a.document_json(), after);
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    Ok(())
}
#[test]
fn invalid_caption_kind_identity_formats_or_late_failure_preserve_the_live_owner() -> Result {
    let (mut a, _) = peers()?;
    let observed = a.observe()?;
    let before = a.checkpoint()?;
    let mut heading = caption("invalid-heading", "No");
    heading["type"] = json!("breditor/heading");
    heading["properties"]["breditor/level"] = json!(2);
    let mut format = caption("invalid-format", "No");
    format["children"][0]["formats"] = json!([{"type":"unknown/format","properties":{}}]);
    for command in [
        set(Some(heading)),
        set(Some(caption("caption", "Reused"))),
        set(Some(format)),
        Command::SetImageCaption(SetImageCaption { block: "p".into(), caption: None }),
    ] {
        assert!(a.apply(vec![command]).is_err());
        assert_eq!(a.checkpoint()?, before);
        a.check(&observed)?;
    }
    assert!(
        a.apply(vec![set(Some(caption("discarded-caption", "No"))), insert("missing", "No")])
            .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.check(&observed)?;
    for input in [
        r#"{"kind":"set_image_caption","data":{"block":"image-block"}}"#,
        r#"{"kind":"set_image_caption","data":{"block":"image-block","caption":null,"clock":"forged"}}"#,
    ] {
        assert!(serde_json::from_str::<Command>(input).is_err());
    }
    Ok(())
}
#[test]
fn moving_paragraphs_into_an_empty_image_uses_the_same_owned_caption_choice() -> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![
        set(None),
        Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![caption("move-a", "A"), caption("move-b", "B")],
        }),
    ])?;
    sync(&mut a, &mut b)?;
    for (owner, block) in [(&mut a, "move-a"), (&mut b, "move-b")] {
        owner.apply(vec![Command::MoveBlock(MoveBlock {
            block: block.into(),
            parent: Some("image-block".into()),
            before: None,
        })])?;
    }
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("winner")?), "B");
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(&visible_caption(&a)?.ok_or("retained A")?), "A");
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert!(visible_caption(&a)?.is_none());
    Ok(())
}
#[test]
fn simultaneous_caption_insertions_project_one_choice_without_rejecting_valid_remote_state()
-> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "caption".into() })])?;
    sync(&mut a, &mut b)?;
    for (owner, id, text) in [(&mut a, "caption-a", "A"), (&mut b, "caption-b", "B")] {
        owner.apply(vec![Command::InsertBlocks(InsertBlocks {
            parent: Some("image-block".into()),
            before: None,
            nodes: vec![caption(id, text)],
        })])?;
    }
    sync(&mut a, &mut b)?;
    assert!(visible_caption(&a)?.is_some());
    let before = a.document_json().to_owned();
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(a.document_json(), before);
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert!(visible_caption(&a)?.is_none());
    Ok(())
}
