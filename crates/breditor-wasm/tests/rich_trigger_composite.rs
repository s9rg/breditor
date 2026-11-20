//! `replaceTriggerThen`: every allowlisted slash command composed with trigger removal is ONE
//! native history unit through the Wasm command boundary.
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
/// `p`: "Intro /cmd", `q`: "Other".
fn root(first: Value) -> Value {
    let mut root =
        fixture::element("document", "unused", vec![first, fixture::paragraph("q", "Other")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn prose() -> Value {
    fixture::paragraph("p", "Intro /cmd")
}
fn owner(p: &BreditorRichProfile, root: &Value) -> Result<BreditorRichEditor> {
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let mut a = p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(), "100").take_editor().ok_or("owner")?;
    let length = find(root, "p")
        .and_then(|p| p.pointer("/children/0/text"))
        .and_then(Value::as_str)
        .map_or(0, |text| u32::try_from(text.len()).unwrap_or(0));
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("p", length, length)})),
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
fn composite(command: &Value) -> Value {
    json!({"kind":"replaceTriggerThen","data":{"selection":text("p", 6, 10),"command":command}})
}
fn data(kind: &str, data: Value) -> Value {
    let mut command = json!({"kind": kind});
    command["data"] = data;
    command
}
fn view(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().view_json())?)?)
}
fn document(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(&read(a.observe().document_json())?)?["root"].clone())
}
fn find<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(value);
    }
    value.get("children")?.as_array()?.iter().find_map(|child| find(child, block))
}
fn p_text(a: &BreditorRichEditor) -> Result<String> {
    let root = document(a)?;
    let p = find(&root, "p").ok_or("p")?;
    Ok(p["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .filter_map(|child| child["text"].as_str())
        .collect())
}
fn position() -> Value {
    json!({"parent":{"kind":"document"},"before":"q"})
}
/// Every allowlisted kind with the smallest language that admits it.
fn allowlisted() -> Vec<(u32, Value, Value)> {
    let list = fixture::element(
        "bullet-list",
        "list",
        vec![fixture::element("list-item", "item", vec![prose()])],
    );
    vec![
        (1, prose(), json!({"kind":"setHeading","block":"p","level":2})),
        (
            1,
            prose(),
            data(
                "wrapList",
                json!({"first":"p","last":"p","container":"list","items":["item"],"start":null}),
            ),
        ),
        (1, list, data("setListKind", json!({"list":"list","start":1}))),
        (
            1,
            prose(),
            data(
                "insertTable",
                json!({"position":position(),"table":{"block":"tb","table":"t","columns":[{"id":"col","width":160}],"rows":[{"block":"row","id":"r","cells":[{"block":"cell","column":"col","header":false,"body":[{"kind":"paragraph","block":"cp","text":"","formatsJson":"[]"}]}]}]}}),
            ),
        ),
        (
            1,
            prose(),
            data(
                "insertBlocks",
                json!({"position":position(),"blocks":[{"kind":"paragraph","block":"n","text":"","formatsJson":"[]"}]}),
            ),
        ),
        (
            2,
            prose(),
            data(
                "setCodeBlock",
                json!({"block":"p","language":null,"formatPolicy":"rejectFormatted"}),
            ),
        ),
        (
            2,
            prose(),
            data(
                "wrapTaskList",
                json!({"first":"p","last":"p","container":"tasks","items":[{"block":"task","checked":false}]}),
            ),
        ),
        (2, prose(), data("wrapBlockquote", json!({"first":"p","last":"p","wrapper":"quote"}))),
        (2, prose(), data("insertHorizontalRule", json!({"position":position(),"block":"rule"}))),
        (
            4,
            prose(),
            data(
                "wrapDetails",
                json!({"first":"p","last":"p","wrapper":"details","summary":"summary","open":true}),
            ),
        ),
        (4, prose(), data("insertPageBreak", json!({"position":position(),"block":"pb"}))),
    ]
}

#[test]
fn every_allowlisted_command_is_one_exact_undo_redo_and_restore_unit() -> Result {
    for (language, first, command) in allowlisted() {
        for language in language..=4 {
            let p = profile(language)?;
            let mut a = owner(&p, &root(first.clone()))?;
            assert_eq!(a.trigger_composite_version(), "1");
            let original = document(&a)?;
            let before = view(&a)?;
            assert_eq!(run(&mut a, &composite(&command)), "content", "V{language} {command}");
            let after = document(&a)?;
            let published = view(&a)?;
            assert_eq!(p_text(&a)?, "Intro ", "V{language} {command}");
            assert_ne!(after, original);
            assert_eq!(published["undoDepth"], 1);
            // The follow-up command maps the post-removal caret at the trigger start.
            assert_eq!(published["selection"]["focus"]["offset"], "6", "{command}");
            // Exactly the follow-up's own effect, as if both ran separately.
            let mut separate = owner(&p, &root(first.clone()))?;
            let removal = data("replaceTextRange", json!({"selection":text("p", 6, 10),"text":""}));
            assert_eq!(run(&mut separate, &removal), "content");
            assert_eq!(run(&mut separate, &command), "content");
            assert_eq!(document(&separate)?, after);
            assert_eq!(view(&separate)?["selection"], published["selection"]);
            assert_eq!(view(&separate)?["undoDepth"], 2);
            // One Undo restores `/cmd` and the caret; one Redo replays it.
            assert_eq!(run(&mut a, &json!({"kind":"undo"})), "undo");
            assert_eq!(document(&a)?, original);
            assert_eq!(view(&a)?["selection"], before["selection"]);
            assert_eq!(view(&a)?["undoDepth"], 0);
            assert_eq!(run(&mut a, &json!({"kind":"redo"})), "redo");
            assert_eq!(document(&a)?, after);
            assert_eq!(view(&a)?["selection"], published["selection"]);
            // A restored checkpoint undoes and redoes the same single unit.
            let mut b =
                p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
            assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
            assert_eq!(document(&b)?, original);
            assert_eq!(view(&b)?["selection"], before["selection"]);
            assert_eq!(run(&mut b, &json!({"kind":"undo"})), "unchanged");
            assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
            assert_eq!(document(&b)?, after);
            // The document-scope checkpoint family restores the same single unit.
            let mut d = p
                .restore_document_editor(&read(a.document_checkpoint_json())?)
                .take_editor()
                .ok_or("document restore")?;
            assert_eq!(run(&mut d, &json!({"kind":"undo"})), "undo");
            assert_eq!(document(&d)?, original);
            assert_eq!(run(&mut d, &json!({"kind":"undo"})), "unchanged");
        }
    }
    Ok(())
}

#[test]
fn refusals_publish_nothing() -> Result {
    let p = profile(4)?;
    let mut a = owner(&p, &root(prose()))?;
    let checkpoint = read(a.checkpoint_json())?;
    let heading = json!({"kind":"setHeading","block":"p","level":1});
    for bad in [
        // Outside the bounded allowlist, including a nested composite and history commands.
        composite(&json!({"kind":"insertPlainText","text":"x"})),
        composite(&json!({"kind":"undo"})),
        composite(&json!({"kind":"setSelection","selection":text("q", 0, 0)})),
        composite(&composite(&heading)),
        composite(&data(
            "insertMention",
            json!({"selection":text("p", 0, 0),"mention":{"kind":"user","id":"u","label":"U"}}),
        )),
        composite(&data("unwrapList", json!({"list":"list"}))),
        // A failing follow-up (unknown block, missing field) after a valid removal.
        composite(&json!({"kind":"setHeading","block":"missing","level":1})),
        composite(&json!({"kind":"setHeading","block":"p"})),
        // A follow-up that changes nothing (`p` is already a paragraph).
        composite(&json!({"kind":"setHeading","block":"p","level":null})),
        // Invalid trigger ranges and envelopes.
        json!({"kind":"replaceTriggerThen","data":{"selection":text("p", 6, 6),"command":heading}}),
        json!({"kind":"replaceTriggerThen","data":{"selection":{"kind":"text","anchor":{"block":"p","offset":"6","affinity":"after"},"focus":{"block":"q","offset":"1","affinity":"after"}},"command":heading}}),
        json!({"kind":"replaceTriggerThen","data":{"selection":text("p", 6, 99),"command":heading}}),
        json!({"kind":"replaceTriggerThen","data":{"selection":text("p", 6, 10)}}),
        json!({"kind":"replaceTriggerThen","data":{"selection":text("p", 6, 10),"command":heading,"extra":1}}),
        json!({"kind":"replaceTriggerThen","selection":text("p", 6, 10)}),
    ] {
        assert_eq!(run(&mut a, &bad), "error", "{bad}");
        assert_eq!(read(a.checkpoint_json())?, checkpoint, "{bad}");
    }
    // A stale observation and a read-only owner are refused before either step.
    let stale = a.observe();
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("p", 9, 9)})),
        "selection"
    );
    assert_eq!(
        run(&mut a, &json!({"kind":"setSelection","selection":text("p", 10, 10)})),
        "selection"
    );
    let checkpoint = read(a.checkpoint_json())?;
    assert_eq!(a.execute(&stale, &composite(&heading).to_string()).status(), "error");
    assert_eq!(read(a.checkpoint_json())?, checkpoint);
    read(a.set_read_only(&a.observe(), true))?;
    let checkpoint = read(a.checkpoint_json())?;
    assert_eq!(run(&mut a, &composite(&heading)), "error");
    assert_eq!(read(a.checkpoint_json())?, checkpoint);
    read(a.set_read_only(&a.observe(), false))?;
    assert_eq!(run(&mut a, &composite(&heading)), "content");
    Ok(())
}

#[test]
fn typed_trigger_burst_and_composite_are_separate_units_under_typing_history() -> Result {
    let p = profile(2)?;
    let mut a = owner(&p, &root(fixture::paragraph("p", "Intro ")))?;
    read(a.enable_typing_history(&a.observe()))?;
    for (clock, key) in ["/", "c", "m", "d"].into_iter().enumerate() {
        let typed = json!({"kind":"insertTypingText","data":{"text":key,"clockMs":(clock + 1).to_string()}});
        assert_eq!(run(&mut a, &typed), "content");
    }
    let typed = document(&a)?;
    assert_eq!(view(&a)?["undoDepth"], 1);
    assert_eq!(
        run(
            &mut a,
            &composite(&data("wrapBlockquote", json!({"first":"p","last":"p","wrapper":"quote"})))
        ),
        "content"
    );
    let after = document(&a)?;
    assert_eq!(view(&a)?["undoDepth"], 2);
    let mut b =
        p.restore_typing_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    for owner in [&mut a, &mut b] {
        assert_eq!(run(owner, &json!({"kind":"undo"})), "undo");
        assert_eq!(document(owner)?, typed);
        assert_eq!(view(owner)?["selection"]["focus"]["offset"], "10");
        assert_eq!(run(owner, &json!({"kind":"undo"})), "undo");
        assert_eq!(p_text(owner)?, "Intro ");
        assert_eq!(run(owner, &json!({"kind":"redo"})), "redo");
        assert_eq!(run(owner, &json!({"kind":"redo"})), "redo");
        assert_eq!(document(owner)?, after);
    }
    Ok(())
}
