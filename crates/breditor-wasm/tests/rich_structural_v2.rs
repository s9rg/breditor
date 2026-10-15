//! Black-box structural V2 factories, named commands and exact future local history.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut result: BreditorStringResult) -> Result<String> {
    result.take_value().ok_or_else(|| "read failed".into())
}
fn bootstrap(version: u32) -> String {
    json!({"format":"breditor/profile-bootstrap","formatVersion":version,"schema":{"name":"example/structural-wasm","version":1},"extensions":[]}).to_string()
}
fn profile() -> Result<BreditorRichProfile> {
    BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7))
        .take_profile()
        .ok_or_else(|| "profile".into())
}
fn node(kind: &str, block: &str, children: Vec<Value>) -> Value {
    let mut n = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":block}});
    n["children"] = Value::Array(children);
    n
}
fn prose(id: &str, text: &str, strong: bool) -> Value {
    node(
        "paragraph",
        id,
        vec![
            json!({"kind":"text","text":text,"formats":if strong {json!([{"type":"breditor/strong","properties":{}}])}else{json!([])}}),
        ],
    )
}
fn owner(profile: &BreditorRichProfile) -> Result<BreditorRichEditor> {
    let d: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    let mut root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"}});
    root["children"] = json!([prose("p", "a🙂b", true), prose("q", "Next", false)]);
    profile.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(),"100").take_editor().ok_or_else(||"owner".into())
}
fn command(e: &mut BreditorRichEditor, request: Value, status: &str) -> Result {
    let Value::Object(fields) = request else {
        return Err("command must be an object".into());
    };
    let request = Value::Object(fields);
    let result = e.execute(&e.observe(), &request.to_string());
    if result.status() != status {
        return Err(format!("expected {status}, got {}", result.status()).into());
    }
    Ok(())
}
fn action(kind: &str, data: Value) -> Value {
    let mut value = json!({"kind":kind});
    value["data"] = data;
    value
}
fn view(e: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(e.observe().view_json())?)?)
}
fn select(block: &str, start: u64, end: u64) -> Value {
    json!({"kind":"setSelection","selection":{"kind":"text","anchor":{"block":block,"offset":start.to_string(),"affinity":"after"},"focus":{"block":block,"offset":end.to_string(),"affinity":"after"}}})
}
fn exact_future(p: &BreditorRichProfile, e: &mut BreditorRichEditor) -> Result {
    let saved = read(e.checkpoint_json())?;
    let mut restored = p.restore_editor(&saved).take_editor().ok_or("restore")?;
    assert_eq!(read(restored.checkpoint_json())?, saved);
    while view(e)?["undoDepth"].as_u64().ok_or("depth")? > 0 {
        command(e, json!({"kind":"undo"}), "undo")?;
        command(&mut restored, json!({"kind":"undo"}), "undo")?;
        assert_eq!(read(e.checkpoint_json())?, read(restored.checkpoint_json())?);
    }
    while view(e)?["redoDepth"].as_u64().ok_or("depth")? > 0 {
        command(e, json!({"kind":"redo"}), "redo")?;
        command(&mut restored, json!({"kind":"redo"}), "redo")?;
        assert_eq!(read(e.checkpoint_json())?, read(restored.checkpoint_json())?);
    }
    Ok(())
}
#[test]
fn v7_is_explicit_and_v6_factories_and_saved_fingerprints_are_not_widened() -> Result {
    let v2 = profile()?;
    let d: Value = serde_json::from_str(&read(v2.descriptor_json())?)?;
    assert_eq!(d["richLanguageVersion"], 2);
    assert_eq!(d["taskStructureVersion"], 1);
    assert_eq!(BreditorRichProfile::from_bootstrap_json(&bootstrap(7)).status(), "error");
    assert_eq!(
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(7)).status(),
        "error"
    );
    assert_eq!(
        BreditorRichProfile::from_structural_bootstrap_json_v2(&bootstrap(6)).status(),
        "error"
    );
    let old = BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6))
        .take_profile()
        .ok_or("old")?;
    let old_d: Value = serde_json::from_str(&read(old.descriptor_json())?)?;
    assert!(old_d.get("richLanguageVersion").is_none());
    assert!(old_d.get("taskStructureVersion").is_none());
    assert_ne!(d["schemaFingerprint"], old_d["schemaFingerprint"]);
    let e = owner(&v2)?;
    assert_eq!(old.create_editor(&read(e.observe().document_json())?, "100").status(), "error");
    assert_eq!(old.restore_editor(&read(e.checkpoint_json())?).status(), "error");
    let mut e = owner(&old)?;
    let before = read(e.checkpoint_json())?;
    command(
        &mut e,
        action("wrapBlockquote", json!({"first":"p","last":"q","wrapper":"quote"})),
        "error",
    )?;
    assert_eq!(read(e.checkpoint_json())?, before);
    Ok(())
}
#[test]
fn code_policy_and_language_are_closed_and_inline_controls_are_unavailable() -> Result {
    let p = profile()?;
    let mut e = owner(&p)?;
    command(&mut e, select("p", 3, 1), "selection")?;
    let before = read(e.checkpoint_json())?;
    for data in [
        json!({"block":"p","language":"Rust"}),
        json!({"block":"p","language":"Rust","formatPolicy":"remove"}),
        json!({"block":"p","language":"Rust","formatPolicy":"removeFormats","extra":true}),
        json!({"block":"p","formatPolicy":"removeFormats"}),
        json!({"block":"p","language":"<script>","formatPolicy":"removeFormats"}),
        json!({"block":"p","language":null,"formatPolicy":"rejectFormatted"}),
    ] {
        command(&mut e, action("setCodeBlock", data), "error")?;
        assert_eq!(read(e.checkpoint_json())?, before);
    }
    command(
        &mut e,
        action(
            "setCodeBlock",
            json!({"block":"p","language":"Rust","formatPolicy":"removeFormats"}),
        ),
        "content",
    )?;
    let state: Value =
        serde_json::from_str(&read(e.observe().inline_format_state_json("breditor/strong"))?)?;
    assert_eq!(state["state"]["kind"], "unavailable");
    command(&mut e, select("p", 1, 1), "selection")?;
    command(&mut e, json!({"kind":"insertHardBreak"}), "content")?;
    command(&mut e, action("setCodeLanguage", json!({"block":"p","language":null})), "content")?;
    let exact = read(e.checkpoint_json())?;
    command(&mut e, action("setCodeLanguage", json!({"block":"p","language":null})), "unchanged")?;
    assert_eq!(read(e.checkpoint_json())?, exact);
    exact_future(&p, &mut e)
}
#[test]
fn quote_task_rule_and_nested_draft_actions_have_exact_recovered_history() -> Result {
    let p = profile()?;
    let mut e = owner(&p)?;
    command(
        &mut e,
        action("wrapBlockquote", json!({"first":"p","last":"q","wrapper":"quote"})),
        "content",
    )?;
    command(
        &mut e,
        action(
            "insertHorizontalRule",
            json!({"block":"rule","position":{"parent":{"kind":"blockquote","block":"quote"},"before":"q"}}),
        ),
        "content",
    )?;
    command(
        &mut e,
        action("deleteHorizontalRule", json!({"block":"rule","replacement":null})),
        "content",
    )?;
    command(&mut e, action("unwrapBlockquote", json!({"wrapper":"quote"})), "content")?;
    command(
        &mut e,
        action(
            "wrapTaskList",
            json!({"first":"p","last":"q","container":"tasks","items":[{"block":"a","checked":true},{"block":"b","checked":false}]}),
        ),
        "content",
    )?;
    command(&mut e, action("setTaskChecked", json!({"item":"b","checked":true})), "content")?;
    command(
        &mut e,
        action(
            "insertBlocks",
            json!({"position":{"parent":{"kind":"taskItem","block":"a"},"before":null},"blocks":[{"kind":"blockquote","block":"nested-quote","body":[{"kind":"codeBlock","block":"code","text":"\tlet x = 1;\n","language":"Rust"},{"kind":"horizontalRule","block":"nested-rule"},{"kind":"taskList","block":"nested-tasks","items":[{"block":"nested-item","checked":true,"body":[{"kind":"paragraph","block":"nested-head","text":"Nested","formatsJson":"[]"}]}]}]}]}),
        ),
        "content",
    )?;
    command(&mut e, action("unwrapTaskList", json!({"list":"tasks"})), "content")?;
    exact_future(&p, &mut e)
}
#[test]
fn task_enter_is_one_group_keeps_completion_and_join_restores_both_items() -> Result {
    let p = profile()?;
    let mut e = owner(&p)?;
    command(
        &mut e,
        action(
            "wrapTaskList",
            json!({"first":"p","last":"q","container":"tasks","items":[{"block":"a","checked":true},{"block":"b","checked":false}]}),
        ),
        "content",
    )?;
    command(&mut e, select("p", 1, 1), "selection")?;
    let before = view(&e)?;
    command(
        &mut e,
        action("insertParagraph", json!({"right":"right","newItem":"right-item"})),
        "content",
    )?;
    let after = view(&e)?;
    assert_eq!(after["undoDepth"].as_u64(), before["undoDepth"].as_u64().map(|v| v + 1));
    assert_eq!(after["selection"]["focus"]["block"], "right");
    let doc: Value = serde_json::from_str(&read(e.observe().document_json())?)?;
    assert_eq!(doc["root"]["children"][0]["children"][0]["properties"]["breditor/checked"], true);
    assert_eq!(doc["root"]["children"][0]["children"][1]["properties"]["breditor/checked"], false);
    command(
        &mut e,
        action("joinTaskItems", json!({"container":"tasks","left":"a","right":"right-item"})),
        "content",
    )?;
    command(&mut e, select("p", 0, 0), "selection")?;
    let guarded = read(e.checkpoint_json())?;
    command(
        &mut e,
        action(
            "splitTaskItem",
            json!({"point":{"block":"p","offset":"1","affinity":"after"},"newItem":"explicit-task","right":"explicit-head","rightHeading":2}),
        ),
        "error",
    )?;
    assert_eq!(read(e.checkpoint_json())?, guarded);
    command(
        &mut e,
        action(
            "splitTaskItem",
            json!({"point":{"block":"p","offset":"0","affinity":"after"},"newItem":"explicit-task","right":"explicit-head","rightHeading":2}),
        ),
        "content",
    )?;
    exact_future(&p, &mut e)
}

#[test]
fn task_indentation_commands_are_closed_and_recover_exact_future_history() -> Result {
    let p = profile()?;
    let mut e = owner(&p)?;
    command(
        &mut e,
        action(
            "wrapTaskList",
            json!({"first":"p","last":"q","container":"tasks","items":[{"block":"a","checked":true},{"block":"b","checked":false}]}),
        ),
        "content",
    )?;
    let before = read(e.checkpoint_json())?;
    for data in [
        json!({"container":"tasks","first":"b","last":"b"}),
        json!({"container":"tasks","first":"b","last":"b","nested":{"block":"nested"}}),
        json!({"container":"tasks","first":"b","last":"b","nested":null}),
        json!({"container":"tasks","first":"b","last":"b","nested":"nested","extra":true}),
    ] {
        command(&mut e, action("indentTaskItems", data), "error")?;
        assert_eq!(read(e.checkpoint_json())?, before);
    }
    let document = read(e.observe().document_json())?;
    command(
        &mut e,
        action(
            "indentTaskItems",
            json!({"container":"tasks","first":"b","last":"b","nested":"nested"}),
        ),
        "content",
    )?;
    let nested = read(e.checkpoint_json())?;
    for data in [
        json!({"container":"nested","first":"b","last":"b"}),
        json!({"container":"nested","first":"b","last":"b","tail":"unused"}),
        json!({"container":"nested","first":"b","last":"b","tail":null,"extra":true}),
    ] {
        command(&mut e, action("outdentTaskItems", data), "error")?;
        assert_eq!(read(e.checkpoint_json())?, nested);
    }
    command(
        &mut e,
        action(
            "outdentTaskItems",
            json!({"container":"nested","first":"b","last":"b","tail":null}),
        ),
        "content",
    )?;
    assert_eq!(read(e.observe().document_json())?, document);
    exact_future(&p, &mut e)
}

#[test]
fn empty_task_exit_requires_closed_explicit_identity_and_retains_one_group_and_future_history()
-> Result {
    let p = profile()?;
    let mut e = owner(&p)?;
    command(
        &mut e,
        action(
            "wrapTaskList",
            json!({"first":"p","last":"q","container":"tasks","items":[{"block":"a","checked":true},{"block":"b","checked":true}]}),
        ),
        "content",
    )?;
    let full = read(e.checkpoint_json())?;
    command(
        &mut e,
        action("exitTaskItem", json!({"container":"tasks","item":"b","tail":null})),
        "error",
    )?;
    assert_eq!(read(e.checkpoint_json())?, full);
    command(&mut e, select("q", 0, 4), "selection")?;
    command(&mut e, json!({"kind":"deleteSelection"}), "content")?;
    let before = read(e.checkpoint_json())?;
    let depth = view(&e)?["undoDepth"].as_u64().ok_or("depth")?;
    for data in [
        json!({"container":"tasks","item":"b"}),
        json!({"container":"tasks","item":"b","tail":null,"extra":true}),
        json!({"container":"tasks","item":"b","tail":"unused"}),
    ] {
        command(&mut e, action("exitTaskItem", data), "error")?;
        assert_eq!(read(e.checkpoint_json())?, before);
    }
    command(
        &mut e,
        action("exitTaskItem", json!({"container":"tasks","item":"b","tail":null})),
        "content",
    )?;
    let state = view(&e)?;
    assert_eq!(state["undoDepth"], depth + 1);
    assert_eq!(state["selection"]["focus"]["block"], "q");
    let document: Value = serde_json::from_str(&read(e.observe().document_json())?)?;
    assert_eq!(document["root"]["children"][1]["properties"]["breditor/block-id"], "q");
    exact_future(&p, &mut e)
}
