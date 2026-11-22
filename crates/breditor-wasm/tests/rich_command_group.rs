//! `commandGroup`: several allowlisted commands (the agent tool contract's staged Accept) are
//! ONE native history unit through the Wasm command boundary; refusals publish nothing.
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
fn profile(language: u32) -> Result<BreditorRichProfile> {
    let bootstrap = |version: u32| {
        json!({"format":"breditor/profile-bootstrap","formatVersion":version,"schema":{"name":"example/layout","version":1},"extensions":[]}).to_string()
    };
    let mut result = match language {
        1 => BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        2 => BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        3 => BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
        _ => BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap(9)),
    };
    result.take_profile().ok_or("profile".into())
}
/// `p`: "Hello world", `q`: "Second line", `r`: "Third".
fn root() -> Value {
    let mut root = fixture::element(
        "document",
        "unused",
        vec![
            fixture::paragraph("p", "Hello world"),
            fixture::paragraph("q", "Second line"),
            fixture::paragraph("r", "Third"),
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn owner(p: &BreditorRichProfile) -> Result<BreditorRichEditor> {
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let mut a = p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root()}).to_string(), "100").take_editor().ok_or("owner")?;
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("q", 0, 0)})),
        "selection"
    );
    Ok(a)
}
fn run(a: &mut BreditorRichEditor, c: &Value) -> String {
    a.execute(&a.observe(), &c.to_string()).status()
}
fn text(block: &str, start: u32, end: u32) -> Value {
    json!({"kind":"text","anchor":{"block":block,"offset":start.to_string(),"affinity":"after"},"focus":{"block":block,"offset":end.to_string(),"affinity":"after"}})
}
fn data(kind: &str, data: Value) -> Value {
    let mut command = json!({"kind": kind});
    command["data"] = data;
    command
}
fn group(commands: &[Value]) -> Value {
    data("commandGroup", json!({ "commands": commands }))
}
fn view(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().view_json())?)?)
}
fn document(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(&read(a.observe().document_json())?)?["root"].clone())
}
fn texts(a: &BreditorRichEditor) -> Result<Vec<(String, String)>> {
    let root = document(a)?;
    Ok(root["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .map(|block| {
            (
                block["properties"]["breditor/block-id"].as_str().unwrap_or("").to_owned(),
                block["children"]
                    .as_array()
                    .map(|runs| runs.iter().filter_map(|run| run["text"].as_str()).collect())
                    .unwrap_or_default(),
            )
        })
        .collect())
}
/// Replacement, bold, heading, insertion and deletion in one group (later offsets first).
fn mixed() -> Vec<Value> {
    vec![
        data("replaceTextRange", json!({"selection":text("p", 6, 11),"text":"there"})),
        data(
            "setInlineFormat",
            json!({"change":{"kind":"set","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"},"targets":[{"block":"p","start":"0","end":"5"}]}),
        ),
        json!({"kind":"setHeading","block":"q","level":2}),
        data(
            "insertBlocks",
            json!({"position":{"parent":{"kind":"document"},"before":"r"},"blocks":[{"kind":"paragraph","block":"n","text":"Inserted","formatsJson":"[]"}]}),
        ),
        data("replaceBlocks", json!({"first":"r","last":"r","blocks":[]})),
    ]
}

#[test]
fn a_mixed_group_is_one_exact_undo_redo_and_restore_unit() -> Result {
    for language in 1..=4 {
        let p = profile(language)?;
        let mut a = owner(&p)?;
        assert_eq!(a.command_group_version(), "1");
        let original = document(&a)?;
        let before = view(&a)?;
        assert_eq!(run(&mut a, &group(&mixed())), "content", "V{language}");
        let after = document(&a)?;
        assert_eq!(
            texts(&a)?,
            vec![
                ("p".into(), "Hello there".into()),
                ("q".into(), "Second line".into()),
                ("n".into(), "Inserted".into())
            ]
        );
        assert_eq!(after["children"][1]["type"], "breditor/heading");
        assert_eq!(after["children"][0]["children"][0]["formats"][0]["type"], "breditor/strong");
        assert_eq!(view(&a)?["undoDepth"], 1);
        // Exactly the commands' own effect, as if they ran separately.
        let mut separate = owner(&p)?;
        for command in mixed() {
            assert_eq!(run(&mut separate, &command), "content", "{command}");
        }
        assert_eq!(document(&separate)?, after);
        assert_eq!(view(&separate)?["undoDepth"], 5);
        // One Undo restores everything and the caret; one Redo replays it.
        assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
        assert_eq!(document(&a)?, original);
        assert_eq!(view(&a)?["selection"], before["selection"]);
        assert_eq!(view(&a)?["undoDepth"], 0);
        assert_eq!(run(&mut a, &json!({"kind":"redo"})), "redo");
        assert_eq!(document(&a)?, after);
        // A restored checkpoint undoes the same single unit.
        let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
        assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
        assert_eq!(document(&b)?, original);
        assert_eq!(run(&mut b, &json!({"kind":"undo"})), "unchanged");
    }
    Ok(())
}

#[test]
fn a_group_without_effect_publishes_nothing() -> Result {
    let p = profile(4)?;
    let mut a = owner(&p)?;
    let checkpoint = read(a.checkpoint_json())?;
    // `q` is already a paragraph.
    assert_eq!(
        run(&mut a, &group(&[json!({"kind":"setHeading","block":"q","level":null})])),
        "unchanged"
    );
    assert_eq!(read(a.checkpoint_json())?, checkpoint);
    Ok(())
}

#[test]
fn refusals_publish_nothing() -> Result {
    let p = profile(4)?;
    let mut a = owner(&p)?;
    let checkpoint = read(a.checkpoint_json())?;
    let heading = json!({"kind":"setHeading","block":"q","level":1});
    let too_many: Vec<Value> = (0..65).map(|_| heading.clone()).collect();
    let valid = data("replaceTextRange", json!({"selection":text("p", 0, 5),"text":"Howdy"}));
    for bad in [
        // Outside the bounded allowlist, nested groups and history/selection/typing commands.
        group(&[json!({"kind":"insertPlainText","text":"x"})]),
        group(&[json!({"kind":"undo"})]),
        group(&[json!({"kind":"setSelection","selection":text("q", 0, 0)})]),
        group(&[group(std::slice::from_ref(&heading))]),
        group(&[data(
            "replaceTriggerThen",
            json!({"selection":text("p", 0, 5),"command":heading}),
        )]),
        group(&[valid.clone(), data("pasteInlineClipboard", json!({"clipboardJson":"{}"}))]),
        // A later failing step after valid ones (unknown block, out-of-range offset, missing field).
        group(&[valid.clone(), json!({"kind":"setHeading","block":"missing","level":1})]),
        group(&[
            valid.clone(),
            data("replaceTextRange", json!({"selection":text("q", 0, 99),"text":""})),
        ]),
        group(&[valid.clone(), json!({"kind":"setHeading","block":"q"})]),
        // Deleting the only remaining blocks leaves an empty document.
        group(&[valid.clone(), data("replaceBlocks", json!({"first":"p","last":"r","blocks":[]}))]),
        // Size and envelope.
        group(&[]),
        group(&too_many),
        data("commandGroup", json!({"commands":[heading],"extra":1})),
        data("commandGroup", json!({})),
        json!({"kind":"commandGroup","commands":[]}),
    ] {
        assert_eq!(run(&mut a, &bad), "error", "{bad}");
        assert_eq!(read(a.checkpoint_json())?, checkpoint, "{bad}");
    }
    // A stale observation and a read-only owner are refused before any step.
    let stale = a.observe();
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("p", 1, 1)})),
        "selection"
    );
    let checkpoint = read(a.checkpoint_json())?;
    assert_eq!(
        a.execute(&stale, &group(std::slice::from_ref(&valid)).to_string()).status(),
        "error"
    );
    assert_eq!(read(a.checkpoint_json())?, checkpoint);
    read(a.set_read_only(&a.observe(), true))?;
    let checkpoint = read(a.checkpoint_json())?;
    assert_eq!(run(&mut a, &group(std::slice::from_ref(&valid))), "error");
    assert_eq!(read(a.checkpoint_json())?, checkpoint);
    read(a.set_read_only(&a.observe(), false))?;
    assert_eq!(run(&mut a, &group(&[valid])), "content");
    Ok(())
}
