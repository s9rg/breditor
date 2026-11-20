//! Shared AI rewrite / language-check Accept path (`SharedDomEditor::replacePlainTextRange`): exactly one guarded
//! native plain-text range replacement. It is ONE writer-local history group (never joined with typing), keeps the
//! logical start's style, leaves peers' concurrent edits elsewhere intact through Undo/Redo, and a publication that
//! raced the browser's target check is rejected by the observation guard without any partial publication.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn profile(kind: &str) -> Result<SharedRichProfile> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":if kind == "general" { 3 } else { 1 },
        "schema":{"name":"example/shared-ai","version":1},"extensions":[]})
    .to_string();
    Ok(if kind == "general" {
        SharedRichProfile::from_standard_configuration_json_v3(&config)?
    } else {
        SharedRichProfile::from_configuration_json(&config)?
    })
}
fn peers(kind: &str) -> Result<(RichReplica, RichReplica)> {
    let profile = profile(kind)?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-ai","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root})
    .to_string();
    let a = profile.create(&document, "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((a, b))
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn range(block: &str, start: u32, end: u32) -> Selection {
    Selection::TextRange { anchor: point(block, start), focus: point(block, end) }
}
fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node["children"].as_array()?.iter().find_map(|child| find(child, block))
}
fn block(owner: &RichReplica, id: &str) -> Result<Value> {
    let value: Value = serde_json::from_str(owner.document_json())?;
    Ok(find(&value["root"], id).ok_or("block")?.clone())
}
fn text(owner: &RichReplica, id: &str) -> Result<String> {
    Ok(block(owner, id)?["children"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
/// A peer edits the image caption (a different block) and the writer admits it.
fn peer_edit_elsewhere(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Peer ".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(text(a, "caption")?, "Peer xy🙂");
    Ok(())
}

#[test]
fn accept_after_typing_and_a_peer_edit_elsewhere_is_one_group_that_keeps_the_peer_edit() -> Result {
    let (mut a, mut b) = peers("typing")?;
    assert!(a.enable_typing_history_guarded(&a.observe()?)?);
    a.set_selection(Some(&range("p", 4, 4)))?;
    // Natural typing is its own (open) typing group.
    assert!(a.insert_typing_text_guarded(&a.observe()?, "!", 10)?);
    assert!(a.insert_typing_text_guarded(&a.observe()?, "?", 20)?);
    assert_eq!(text(&a, "p")?, "a🙂b!?");
    peer_edit_elsewhere(&mut a, &mut b)?;
    let typed = block(&a, "p")?;
    let groups = a.undo_count();
    // The exact native call behind Accept, with the current observation (revision).
    assert!(a.replace_plain_text_guarded(&a.observe()?, &range("p", 0, 6), "Rewritten")?);
    assert_eq!(a.undo_count(), groups + 1);
    let rewritten = block(&a, "p")?;
    assert_eq!(text(&a, "p")?, "Rewritten");
    // Logical start style (the fixture paragraph is bold) is kept; no JavaScript style inference.
    assert_eq!(
        rewritten["children"][0]["formats"],
        json!([{"type":"breditor/strong","properties":{}}])
    );
    assert_eq!(a.selection()?, Some(range("p", 9, 9)));
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    // One Undo restores exactly the typed text; the peer's caption edit is untouched throughout.
    a.undo()?;
    assert_eq!(block(&a, "p")?, typed);
    assert_eq!(text(&a, "caption")?, "Peer xy🙂");
    a.redo()?;
    assert_eq!(block(&a, "p")?, rewritten);
    a.undo()?;
    a.undo()?;
    assert_eq!(text(&a, "p")?, "a🙂b");
    assert_eq!(text(&a, "caption")?, "Peer xy🙂");
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn a_publication_that_races_the_target_check_is_rejected_without_publishing() -> Result {
    let (mut a, mut b) = peers("typing")?;
    let observed = a.observe()?;
    peer_edit_elsewhere(&mut a, &mut b)?;
    let exact = a.checkpoint()?;
    let groups = a.undo_count();
    assert!(a.replace_plain_text_guarded(&observed, &range("p", 0, 4), "Rewritten").is_err());
    assert_eq!(a.checkpoint()?, exact);
    assert_eq!(a.undo_count(), groups);
    // Re-observing after the browser re-verified the (untouched) target succeeds.
    assert!(a.replace_plain_text_guarded(&a.observe()?, &range("p", 0, 4), "Rewritten")?);
    assert_eq!(a.undo_count(), groups + 1);
    Ok(())
}

#[test]
fn general_range_plain_input_is_one_group_that_keeps_the_peer_edit() -> Result {
    let (mut a, mut b) = peers("general")?;
    assert!(a.enable_general_ranges_guarded(&a.observe()?)?);
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 4,
        text: "!".into(),
    })])?;
    peer_edit_elsewhere(&mut a, &mut b)?;
    let typed = block(&a, "p")?;
    let groups = a.undo_count();
    assert!(a.replace_general_range_plain_text_guarded(
        &a.observe()?,
        &range("p", 0, 5),
        "Rewritten",
        &[]
    )?);
    assert_eq!(a.undo_count(), groups + 1);
    assert_eq!(text(&a, "p")?, "Rewritten");
    a.undo()?;
    assert_eq!(block(&a, "p")?, typed);
    assert_eq!(text(&a, "caption")?, "Peer xy🙂");
    a.redo()?;
    assert_eq!(text(&a, "p")?, "Rewritten");
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
