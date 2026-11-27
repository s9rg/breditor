//! Inline drag-and-drop (`dropText`) through the Wasm command boundary: one undo unit, exact
//! runs and mentions retained, and typed refusals that publish nothing.
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("read".into())
}
fn profile() -> Result<BreditorRichProfile> {
    let bootstrap = json!({"format":"breditor/profile-bootstrap","formatVersion":9,"schema":{"name":"example/layout","version":1},"extensions":[]});
    BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap.to_string())
        .take_profile()
        .ok_or("profile".into())
}
fn mention() -> Value {
    json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann"}})
}
fn bold() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
/// `p`: "ab" + bold "cd" + "ef"; `q`: "x" + mention "@Ann" + "y"; `c`: code "code".
fn root() -> Value {
    let mut p = fixture::paragraph("p", "");
    p["children"] = json!([{"kind":"text","text":"ab","formats":[]},{"kind":"text","text":"cd","formats":[bold()]},{"kind":"text","text":"ef","formats":[]}]);
    let mut q = fixture::paragraph("q", "");
    q["children"] = json!([{"kind":"text","text":"x","formats":[]},{"kind":"text","text":"@Ann","formats":[mention()]},{"kind":"text","text":"y","formats":[]}]);
    let code = fixture::element(
        "code-block",
        "c",
        vec![json!({"kind":"text","text":"code","formats":[]})],
    );
    let mut root = fixture::element("document", "unused", vec![p, q, code]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn owner() -> Result<BreditorRichEditor> {
    let p = profile()?;
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root()}).to_string(), "100").take_editor().ok_or("owner".into())
}
fn point(block: &str, offset: u32) -> Value {
    json!({"block":block,"offset":offset.to_string(),"affinity":"after"})
}
fn range(block: &str, start: u32, end: u32) -> Value {
    json!({"kind":"text","anchor":point(block, start),"focus":point(block, end)})
}
fn drop(source: Value, target: Value, effect: &str) -> Value {
    let mut command = json!({"kind":"dropText","data":{"effect":effect}});
    command["data"]["source"] = source;
    command["data"]["target"] = target;
    command
}
fn run(a: &mut BreditorRichEditor, c: &Value) -> String {
    a.execute(&a.observe(), &c.to_string()).status()
}
fn code(a: &mut BreditorRichEditor, c: &Value) -> Result<String> {
    let result = a.execute(&a.observe(), &c.to_string());
    Ok(result.error().ok_or("expected an error")?.code())
}
fn children(a: &BreditorRichEditor, index: usize) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"][index]["children"].clone())
}
fn view(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().view_json())?)?)
}

#[test]
fn move_is_one_undo_step_that_keeps_formats_and_selects_the_dropped_text() -> Result {
    let mut a = owner()?;
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":range("p", 2, 4)})),
        "selection"
    );
    let before = children(&a, 0)?;
    let depth = view(&a)?["undoDepth"].clone();
    // Same block, after the source: "ab|cd|ef" -> "abefcd" (target offset maps through the delete).
    assert_eq!(run(&mut a, &drop(range("p", 2, 4), point("p", 6), "move")), "content");
    assert_eq!(
        children(&a, 0)?,
        json!([{"kind":"text","text":"abef","formats":[]},{"kind":"text","text":"cd","formats":[bold()]}])
    );
    let after = view(&a)?;
    assert_eq!(after["selection"], range("p", 4, 6));
    assert_eq!(after["undoDepth"].as_u64(), depth.as_u64().map(|d| d + 1));
    assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
    assert_eq!(children(&a, 0)?, before);
    assert_eq!(view(&a)?["selection"], range("p", 2, 4));
    assert_eq!(run(&mut a, &json!({"kind":"redo"})), "redo");
    assert_eq!(children(&a, 0)?[1]["text"], "cd");
    Ok(())
}

#[test]
fn move_before_the_source_and_into_another_block() -> Result {
    let mut a = owner()?;
    assert_eq!(run(&mut a, &drop(range("p", 4, 2), point("p", 0), "move")), "content");
    assert_eq!(
        children(&a, 0)?,
        json!([{"kind":"text","text":"cd","formats":[bold()]},{"kind":"text","text":"abef","formats":[]}])
    );
    // A mention moves whole, with its entity identity, into another paragraph.
    assert_eq!(run(&mut a, &drop(range("q", 1, 5), point("p", 6), "move")), "content");
    assert_eq!(children(&a, 1)?, json!([{"kind":"text","text":"xy","formats":[]}]));
    assert_eq!(children(&a, 0)?[2], json!({"kind":"text","text":"@Ann","formats":[mention()]}));
    assert_eq!(view(&a)?["selection"], range("p", 6, 10));
    Ok(())
}

#[test]
fn copy_keeps_the_source_and_edges_of_a_move_are_unchanged() -> Result {
    let mut a = owner()?;
    let revision = view(&a)?["revision"].clone();
    assert_eq!(run(&mut a, &drop(range("p", 2, 4), point("p", 2), "move")), "unchanged");
    assert_eq!(run(&mut a, &drop(range("p", 2, 4), point("p", 4), "move")), "unchanged");
    assert_eq!(view(&a)?["revision"], revision);
    assert_eq!(run(&mut a, &drop(range("p", 2, 4), point("p", 4), "copy")), "content");
    assert_eq!(
        children(&a, 0)?,
        json!([{"kind":"text","text":"ab","formats":[]},{"kind":"text","text":"cdcd","formats":[bold()]},{"kind":"text","text":"ef","formats":[]}])
    );
    // A target inside a mention snaps to its nearest edge, never splitting it.
    assert_eq!(run(&mut a, &drop(range("p", 0, 1), point("q", 2), "copy")), "content");
    assert_eq!(children(&a, 1)?[0]["text"], "xa");
    Ok(())
}

#[test]
fn refusals_publish_nothing() -> Result {
    let mut a = owner()?;
    let checkpoint = read(a.checkpoint_json())?;
    for (command, expected) in [
        (drop(range("p", 1, 5), point("p", 3), "move"), "breditor_rich.text_drop"),
        (drop(range("p", 1, 5), point("p", 3), "copy"), "breditor_rich.text_drop"),
        (drop(range("p", 2, 2), point("q", 0), "move"), "breditor_rich.text_drop"),
        (
            drop(
                json!({"kind":"text","anchor":point("p", 1),"focus":point("q", 1)}),
                point("c", 0),
                "move",
            ),
            "breditor_rich.text_drop",
        ),
        (
            drop(json!({"kind":"node","block":"p"}), point("q", 0), "move"),
            "breditor_rich.text_drop",
        ),
        // Formatted text and mentions are refused by the code block's admission.
        (drop(range("p", 2, 4), point("c", 1), "move"), "breditor_rich.command_rejected"),
        (drop(range("q", 1, 5), point("c", 0), "copy"), "breditor_rich.command_rejected"),
        (drop(range("p", 0, 1), point("missing", 0), "move"), "breditor_rich.command_rejected"),
        (drop(range("p", 0, 1), point("p", 99), "move"), "breditor_rich.command_rejected"),
        (
            json!({"kind":"dropText","data":{"source":range("p", 0, 1),"target":point("q", 0),"effect":"link"}}),
            "breditor_rich.command_json",
        ),
    ] {
        assert_eq!(code(&mut a, &command)?, expected, "{command}");
        assert_eq!(read(a.checkpoint_json())?, checkpoint);
    }
    // Plain text from a code block may move into prose.
    assert_eq!(run(&mut a, &drop(range("c", 0, 2), point("q", 0), "copy")), "content");
    assert_eq!(read(a.set_read_only(&a.observe(), true))?, "true");
    assert_eq!(
        code(&mut a, &drop(range("p", 0, 1), point("q", 0), "move"))?,
        "breditor_rich.read_only"
    );
    Ok(())
}
