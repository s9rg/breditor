//! Shared native letter-case change: one guarded command, one writer-local Undo step, exact
//! format runs and mentions, convergence with concurrent peers and exact checkpoint replay.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const SCHEMA: &str = "example/shared-case-change";
fn config(revision: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":SCHEMA,"version":1},"extensions":[]}).to_string()
}
fn el(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn run(text: &str, formats: Vec<Value>) -> Value {
    let mut run = json!({"kind":"text","text":text,"formats":[]});
    run["formats"] = Value::Array(formats);
    run
}
fn para(id: &str, text: &str) -> Value {
    el("paragraph", id, if text.is_empty() { vec![] } else { vec![run(text, vec![])] })
}
fn mention(label: &str) -> Value {
    json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":label}})
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn root(v4: bool) -> Value {
    let first = if v4 {
        el(
            "paragraph",
            "p",
            vec![
                run("straße ", vec![strong()]),
                run("@Ann", vec![mention("Ann")]),
                run(" and more", vec![]),
            ],
        )
    } else {
        el("paragraph", "p", vec![run("straße ", vec![strong()]), run("and more", vec![])])
    };
    let mut root = el("document", "unused", vec![first, para("q", "the lord of the rings")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn source(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":SCHEMA,"version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn setup(v4: bool) -> Result<(SharedRichProfile, RichReplica, RichReplica, RichReplica)> {
    let p = if v4 {
        SharedRichProfile::from_standard_configuration_json_v4(&config(4))?
    } else {
        SharedRichProfile::from_standard_configuration_json_v1(&config(1))?
    };
    let a = p.create(&source(&p, &root(v4)), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let c = p.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    Ok((p, a, b, c))
}
fn ast(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(a.document_json())?["root"].clone())
}
fn runs(a: &RichReplica, index: usize) -> Result<Value> {
    Ok(ast(a)?["children"][index]["children"].clone())
}
fn plain(a: &RichReplica, index: usize) -> Result<String> {
    Ok(runs(a, index)?
        .as_array()
        .ok_or("runs")?
        .iter()
        .filter_map(|r| r["text"].as_str())
        .collect())
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn range(anchor: (&str, u32), focus: (&str, u32)) -> Selection {
    Selection::TextRange { anchor: point(anchor.0, anchor.1), focus: point(focus.0, focus.1) }
}
fn change(a: &mut RichReplica, selection: &Selection, mode: &str) -> Result<bool> {
    a.set_selection(Some(selection))?;
    Ok(a.change_selection_case_json_guarded(&a.observe()?, &json!({ "change": mode }).to_string())?)
}
fn sync(peers: &mut [&mut RichReplica]) -> Result {
    let frames =
        peers.iter().map(|p| p.update_frame()).collect::<std::result::Result<Vec<_>, _>>()?;
    for (i, peer) in peers.iter_mut().enumerate() {
        for (j, frame) in frames.iter().enumerate() {
            if i != j {
                peer.receive_frame(frame)?;
            }
        }
    }
    for peer in peers.iter() {
        assert_eq!(peer.document_json(), peers[0].document_json());
    }
    Ok(())
}

#[test]
fn upper_across_blocks_is_one_undo_step_keeps_runs_and_mentions() -> Result {
    let (_p, mut a, mut b, _c) = setup(true)?;
    let before = a.undo_count();
    let original = a.document_json().to_owned();
    assert!(change(&mut a, &range(("p", 0), ("q", 3)), "upper")?);
    assert_eq!(a.undo_count(), before + 1);
    assert_eq!(
        runs(&a, 0)?,
        json!([
            run("STRASSE ", vec![strong()]),
            run("@Ann", vec![mention("Ann")]),
            run(" AND MORE", vec![])
        ])
    );
    assert_eq!(plain(&a, 1)?, "THE lord of the rings");
    // The selection follows the longer text (ß → SS) and keeps covering the change.
    assert_eq!(a.selection()?, Some(range(("p", 0), ("q", 3))));
    sync(&mut [&mut a, &mut b])?;
    // One Undo restores the exact original; Redo reapplies.
    assert!(a.undo()?);
    assert_eq!(a.document_json(), original);
    assert!(a.redo()?);
    assert_eq!(plain(&a, 0)?, "STRASSE @Ann AND MORE");
    // Nothing to change: no publication and no history step.
    let count = a.undo_count();
    assert!(!change(&mut a, &range(("p", 0), ("p", 8)), "upper")?);
    assert_eq!(a.undo_count(), count);
    Ok(())
}

#[test]
fn title_and_cycle_match_the_local_semantics_and_v1_rooms_work() -> Result {
    let (_p, mut a, ..) = setup(true)?;
    assert!(change(&mut a, &range(("q", 4), ("q", 4)), "title")?);
    assert_eq!(plain(&a, 1)?, "The Lord of the Rings");
    let mut seen = Vec::new();
    for _ in 0..3 {
        assert!(change(&mut a, &range(("q", 0), ("q", 21)), "cycle")?);
        seen.push(plain(&a, 1)?);
    }
    assert_eq!(seen, ["THE LORD OF THE RINGS", "the lord of the rings", "The Lord of the Rings"]);
    let (_p, mut old, ..) = setup(false)?;
    assert!(change(&mut old, &range(("p", 0), ("p", 6)), "upper")?);
    assert_eq!(runs(&old, 0)?[0], run("STRASSE ", vec![strong()]));
    assert!(
        old.change_selection_case_json_guarded(&old.observe()?, "{\"change\":\"loud\"}").is_err()
    );
    Ok(())
}

#[test]
fn concurrent_typing_and_case_change_converge_and_undo_is_writer_local() -> Result {
    let (profile, mut a, mut b, mut c) = setup(true)?;
    assert!(change(&mut a, &range(("q", 0), ("q", 21)), "upper")?);
    // B types inside the same block concurrently; C changes another block.
    b.apply_with_state(
        vec![Command::InsertText(InsertText {
            block: "q".into(),
            offset: 4,
            text: "best ".into(),
        })],
        SelectionUpdate::Map,
        PendingFormatsUpdate::Map,
    )?;
    assert!(change(&mut c, &range(("p", 0), ("p", 6)), "title")?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    let q = plain(&a, 1)?;
    assert!(q.contains("best "), "{q}");
    assert_eq!(q.replace("best ", ""), "THE LORD OF THE RINGS");
    assert_eq!(runs(&a, 0)?[0], run("Straße ", vec![strong()]));
    // A's Undo removes only A's case change; B's text survives on every peer.
    assert!(a.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    // The restored characters are fresh insertions, so the peer text keeps its content but may
    // order on either side of an adjacent restored word (the CRDT's concurrent-insert order).
    let q = plain(&a, 1)?;
    assert_eq!(q.matches("best ").count(), 1, "{q}");
    assert_eq!(q.replace("best ", ""), "the lord of the rings");
    // Checkpoint restore replays exactly with identical future history.
    let mut restored = profile.restore("room", &a.checkpoint()?)?;
    assert_eq!(restored.document_json(), a.document_json());
    assert_eq!(restored.redo()?, a.redo()?);
    assert_eq!(restored.document_json(), a.document_json());
    Ok(())
}
