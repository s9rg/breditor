#![cfg(feature = "experimental-rich-content")]
//! Black-box native contracts for the opt-in rich owner and its strict JSON boundary.

use breditor_wasm::{
    BreditorCompiledProfile, BreditorRichEditor, BreditorRichObservation, BreditorRichProfile,
    BreditorStringResult,
};
use serde_json::{Value, json};

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

fn profile() -> TestResult<BreditorRichProfile> {
    let mut result = BreditorRichProfile::from_bootstrap_json(&bootstrap(6));
    assert_eq!(result.status(), "profile");
    let profile = result.take_profile().ok_or("profile")?;
    assert_eq!(result.status(), "taken");
    assert!(result.take_profile().is_none());
    Ok(profile)
}
fn bootstrap(version: u32) -> String {
    json!({"format":"breditor/profile-bootstrap","formatVersion":version,
        "schema":{"name":"example/rich-wasm","version":1},"extensions":[]})
    .to_string()
}
fn read(mut result: BreditorStringResult) -> TestResult<String> {
    assert_eq!(result.status(), "value");
    let value = result.take_value().ok_or("read")?;
    assert_eq!(result.status(), "taken");
    assert!(result.take_value().is_none());
    Ok(value)
}
fn initial(profile: &BreditorRichProfile) -> TestResult<String> {
    let descriptor: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    Ok(json!({"format":"breditor/document","formatVersion":2,
        "schema":descriptor["schema"],"schemaFingerprint":descriptor["schemaFingerprint"],
        "root":serde_json::from_str::<Value>(include_str!("../../breditor-core/tests/fixtures/rich-local-root.json"))?}).to_string())
}
fn editor(profile: &BreditorRichProfile) -> TestResult<BreditorRichEditor> {
    let mut result = profile.create_editor(&initial(profile)?, "100");
    assert_eq!(result.status(), "editor");
    let editor = result.take_editor().ok_or("editor")?;
    assert_eq!(result.status(), "taken");
    assert!(result.take_editor().is_none());
    Ok(editor)
}
fn view(editor: &BreditorRichEditor) -> TestResult<Value> {
    Ok(serde_json::from_str(&read(editor.observe().view_json())?)?)
}
fn point(offset: &str) -> Value {
    json!({"block":"p","offset":offset,"affinity":"after"})
}
fn select(start: &str, end: &str) -> Value {
    json!({"kind":"setSelection","selection":{"kind":"text","anchor":point(start),"focus":point(end)}})
}
fn command(
    editor: &mut BreditorRichEditor,
    value: &Value,
    expected: &str,
) -> TestResult<BreditorRichObservation> {
    let mut result = editor.execute(&editor.observe(), &value.to_string());
    assert_eq!(result.status(), expected, "{value}");
    assert!(result.error().is_none());
    let observation = result.take_observation().ok_or("next observation")?;
    assert!(result.take_observation().is_none());
    assert_eq!(result.status(), expected);
    Ok(observation)
}

fn action(kind: &str, data: Value) -> Value {
    let mut result = json!({"kind":kind,"data":null});
    result["data"] = data;
    result
}
fn paragraph(block: &str, text: &str) -> Value {
    json!({"kind":"paragraph","block":block,"text":text,"formatsJson":"[]"})
}
fn cell(block: &str, column: &str, body: Value) -> Value {
    let mut result = json!({"block":block,"column":column,"header":false,"body":[]});
    result["body"] = Value::Array(vec![body]);
    result
}
fn grid() -> Value {
    json!({"kind":"setSelection","selection":{"kind":"grid",
        "anchor":{"table":"t","row":"r2","column":"c2"},
        "focus":{"table":"t","row":"r","column":"c"}}})
}
fn roundtrip(editor: &mut BreditorRichEditor, input: &Value) -> TestResult {
    let before = read(editor.observe().document_json())?;
    let before_selection = view(editor)?["selection"].clone();
    command(editor, input, "content")?;
    let after = read(editor.observe().document_json())?;
    let after_selection = view(editor)?["selection"].clone();
    command(editor, &json!({"kind":"undo"}), "undo")?;
    assert_eq!(read(editor.observe().document_json())?, before);
    assert_eq!(view(editor)?["selection"], before_selection);
    command(editor, &json!({"kind":"redo"}), "redo")?;
    assert_eq!(read(editor.observe().document_json())?, after);
    assert_eq!(view(editor)?["selection"], after_selection);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines, reason = "one end-to-end axis/geometry/history workflow")]
fn all_table_axis_geometry_and_whole_node_commands_roundtrip_through_public_api() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    roundtrip(
        &mut editor,
        &action(
            "insertTableRow",
            json!({"table":"t","before":null,"row":{
        "block":"row2","id":"r2","cells":[cell("cell2","c",json!({"kind":"list","block":"cell-list","start":3,"items":[
            {"block":"item2","body":[paragraph("p2","Second 🙂")]}]}))]}}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "insertTableColumn",
            json!({"table":"t","before":null,
        "column":{"id":"c2","width":180},"cells":[
            {"row":"r2","cell":cell("cell22","c2",paragraph("p22","fourth"))},
            {"row":"r","cell":cell("cell12","c2",paragraph("p12","second"))}]}),
        ),
    )?;
    roundtrip(&mut editor, &action("moveTableRow", json!({"table":"t","row":"r2","before":"r"})))?;
    roundtrip(
        &mut editor,
        &action("moveTableColumn", json!({"table":"t","column":"c2","before":"c"})),
    )?;
    let geometry = view(&editor)?;
    assert_eq!(geometry["tables"][0]["rows"], json!(["r2", "r"]));
    assert_eq!(geometry["tables"][0]["columns"][0]["id"], "c2");
    command(&mut editor, &grid(), "selection")?;
    roundtrip(
        &mut editor,
        &action(
            "mergeTableCells",
            json!({"merge":"merge-1","replica":"1","counter":"0","lamport":"1"}),
        ),
    )?;
    let geometry = view(&editor)?;
    assert_eq!(geometry["tables"][0]["cells"][0]["rowSpan"], 2);
    assert_eq!(geometry["tables"][0]["cells"][0]["columnSpan"], 2);
    assert_eq!(geometry["tables"][0]["cells"][0]["sources"].as_array().ok_or("sources")?.len(), 4);
    roundtrip(&mut editor, &action("setTableHeader", json!({"header":true})))?;
    roundtrip(
        &mut editor,
        &action("resizeTableColumn", json!({"table":"t","column":"c2","width":220})),
    )?;
    command(
        &mut editor,
        &action("navigateGrid", json!({"movement":"next","extend":false})),
        "unchanged",
    )?;
    roundtrip(
        &mut editor,
        &action("splitTableCell", json!({"cell":{"table":"t","row":"r2","column":"c2"}})),
    )?;
    assert_eq!(view(&editor)?["tables"][0]["cells"][0]["rowSpan"], 1);
    command(
        &mut editor,
        &action("navigateGrid", json!({"movement":"tableStart","extend":false})),
        "selection",
    )?;
    command(
        &mut editor,
        &action("navigateGrid", json!({"movement":"next","extend":true})),
        "selection",
    )?;
    assert_eq!(view(&editor)?["selection"]["focus"]["column"], "c");
    command(&mut editor, &grid(), "selection")?;
    roundtrip(
        &mut editor,
        &action("clearTableCells", json!({"emptyBlocks":["empty0","empty1","empty2","empty3"]})),
    )?;
    assert!(!read(editor.observe().document_json())?.contains("Second 🙂"));
    command(&mut editor, &json!({"kind":"undo"}), "undo")?;
    assert!(read(editor.observe().document_json())?.contains("Second 🙂"));
    roundtrip(&mut editor, &action("deleteTableRow", json!({"table":"t","row":"r2"})))?;
    roundtrip(&mut editor, &action("deleteTableColumn", json!({"table":"t","column":"c2"})))?;
    roundtrip(
        &mut editor,
        &action(
            "insertTable",
            json!({"position":{"parent":{"kind":"document"},"before":null},
        "table":{"block":"new-table","table":"t2","columns":[{"id":"ncol","width":100}],"rows":[{
            "block":"new-row","id":"nrow","cells":[cell("new-cell","ncol",paragraph("new-p","new table"))]}]}}),
        ),
    )?;
    assert_eq!(view(&editor)?["tables"].as_array().ok_or("tables")?.len(), 2);
    roundtrip(&mut editor, &action("deleteTable", json!({"table":"t2","replacement":null})))?;
    roundtrip(
        &mut editor,
        &action(
            "deleteTable",
            json!({"table":"t","replacement":paragraph("replacement","after table")}),
        ),
    )?;
    assert_eq!(view(&editor)?["tables"].as_array().ok_or("tables")?.len(), 0);
    let mut recovered =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    command(&mut recovered, &json!({"kind":"undo"}), "undo")?;
    assert_eq!(view(&recovered)?["tables"].as_array().ok_or("tables")?.len(), 1);
    Ok(())
}

#[test]
fn image_metadata_caption_asset_replacement_and_deletion_are_exact_local_units() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    command(
        &mut editor,
        &json!({"kind":"setSelection","selection":{"kind":"node","block":"image-block"}}),
        "selection",
    )?;
    roundtrip(
        &mut editor,
        &action(
            "setImageAlt",
            json!({"image":"image","alt":{"kind":"description","text":"New diagram"}}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action("resizeImage", json!({"image":"image","size":{"width":320,"height":240}})),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "replaceImage",
            json!({"image":"image","asset":"asset-2","generation":"generation-2"}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "setImageCaption",
            json!({"image":"image","caption":{"block":"caption2","text":"New caption 🙂","formatsJson":"[]"}}),
        ),
    )?;
    assert!(read(editor.observe().document_json())?.contains("New caption 🙂"));
    roundtrip(&mut editor, &action("setImageCaption", json!({"image":"image","caption":null})))?;
    roundtrip(&mut editor, &action("resizeImage", json!({"image":"image","size":null})))?;
    roundtrip(
        &mut editor,
        &action("setImageAlt", json!({"image":"image","alt":{"kind":"decorative"}})),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "insertImage",
            json!({"position":{"parent":{"kind":"cell","cell":{"table":"t","row":"r","column":"c"}},"before":null},
        "image":{"block":"new-image-block","image":"new-image","asset":"shared-asset","generation":"new-generation",
            "alt":{"kind":"description","text":"New image"},"size":null,"caption":{"block":"new-caption","text":"Caption","formatsJson":"[]"}}}),
        ),
    )?;
    roundtrip(&mut editor, &action("deleteImage", json!({"image":"image","replacement":null})))?;
    roundtrip(
        &mut editor,
        &action(
            "deleteImage",
            json!({"image":"new-image","replacement":paragraph("image-replacement","after image")}),
        ),
    )?;
    let recovered =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(read(recovered.observe().document_json())?, read(editor.observe().document_json())?);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines, reason = "one end-to-end rich-flow/list/history workflow")]
fn rich_flow_nested_lists_enter_and_formatting_commands_share_exact_history() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    roundtrip(
        &mut editor,
        &action(
            "insertBlocks",
            json!({"position":{"parent":{"kind":"document"},"before":null},
        "blocks":[paragraph("first","one🙂"),paragraph("second","two"),paragraph("third","three")]}),
        ),
    )?;
    let selected = json!({"kind":"setSelection","selection":{"kind":"text","anchor":{"block":"first","offset":"5","affinity":"after"},"focus":{"block":"first","offset":"5","affinity":"after"}}});
    command(&mut editor, &selected, "selection")?;
    let formats = r#"[{"type":"breditor/strong","properties":{}}]"#;
    roundtrip(
        &mut editor,
        &action(
            "setInlineFormat",
            json!({"change":{"kind":"set","formatsJson":formats},"targets":[
        {"block":"first","start":"0","end":"5"},{"block":"second","start":"0","end":"3"}]}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "splitTextBlock",
            json!({"point":{"block":"first","offset":"5","affinity":"after"},"right":"first-right","rightHeading":null}),
        ),
    )?;
    assert_eq!(view(&editor)?["pendingFormatsJson"], formats);
    assert_eq!(view(&editor)?["selection"]["focus"]["block"], "first-right");
    roundtrip(
        &mut editor,
        &action("joinTextBlocks", json!({"left":"first","right":"first-right"})),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "wrapList",
            json!({"first":"first","last":"third","container":"list",
        "items":["item-first","item-second","item-third"],"start":null}),
        ),
    )?;
    roundtrip(&mut editor, &action("setListKind", json!({"list":"list","start":3})))?;
    roundtrip(
        &mut editor,
        &action(
            "indentListItems",
            json!({"container":"list","first":"item-second","last":"item-third",
        "nested":{"block":"nested","start":4}}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "outdentListItems",
            json!({"container":"nested","first":"item-second","last":"item-third","tail":null}),
        ),
    )?;
    command(&mut editor, &selected, "unchanged")?;
    roundtrip(
        &mut editor,
        &action(
            "splitListItem",
            json!({"point":{"block":"first","offset":"5","affinity":"after"},
        "newItem":"new-item","right":"item-right","rightHeading":null}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action(
            "joinListItems",
            json!({"container":"list","left":"item-first","right":"new-item"}),
        ),
    )?;
    roundtrip(&mut editor, &action("unwrapList", json!({"list":"list"})))?;
    roundtrip(
        &mut editor,
        &action(
            "replaceBlocks",
            json!({"first":"second","last":"third","blocks":[paragraph("replacement-flow","replacement")]}),
        ),
    )?;
    roundtrip(
        &mut editor,
        &action("insertFormattedText", json!({"text":"X","formatsJson":formats})),
    )?;
    assert!(read(editor.observe().document_json())?.contains("one🙂X"));
    roundtrip(
        &mut editor,
        &action(
            "setInlineFormat",
            json!({"change":{"kind":"remove","format":"breditor/strong"},
        "targets":[{"block":"first","start":"0","end":"6"}]}),
        ),
    )?;
    command(
        &mut editor,
        &json!({"kind":"setSelection","selection":{"kind":"text",
        "anchor":{"block":"first","offset":"1","affinity":"before"},"focus":{"block":"first","offset":"3","affinity":"after"}}}),
        "selection",
    )?;
    roundtrip(&mut editor, &json!({"kind":"deleteSelection"}))?;
    assert!(read(editor.observe().document_json())?.contains("o🙂X"));
    let recovered =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(read(recovered.observe().document_json())?, read(editor.observe().document_json())?);
    Ok(())
}

#[test]
fn semantic_clipboard_reads_and_fresh_inline_flow_grid_pastes_are_public_contracts() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    assert_eq!(editor.observe().clipboard_json().status(), "absent");
    command(&mut editor, &select("1", "3"), "selection")?;
    let copy: Value = serde_json::from_str(&read(editor.observe().clipboard_json())?)?;
    assert_eq!(copy["kind"], "text");
    assert_eq!(copy["plainText"], "🙂");
    command(&mut editor, &select("4", "4"), "selection")?;
    roundtrip(
        &mut editor,
        &action("pasteInlineClipboard", json!({"clipboardJson":copy["structuredJson"]})),
    )?;
    assert!(read(editor.observe().document_json())?.contains("a🙂b🙂"));
    command(
        &mut editor,
        &json!({"kind":"setSelection","selection":{"kind":"grid",
        "anchor":{"table":"t","row":"r","column":"c"},"focus":{"table":"t","row":"r","column":"c"}}}),
        "selection",
    )?;
    let copy: Value = serde_json::from_str(&read(editor.observe().clipboard_json())?)?;
    assert_eq!(copy["kind"], "grid");
    let before = read(editor.observe().document_json())?;
    assert!(copy["plainText"].as_str().ok_or("plain")?.contains("Diagram"));
    assert_eq!(read(editor.observe().document_json())?, before);
    let allocation = json!({"prefix":"paste-one","replica":"1","counter":"1","lamport":"2"});
    roundtrip(
        &mut editor,
        &action(
            "pasteGridClipboard",
            json!({"clipboardJson":copy["structuredJson"],"allocation":allocation}),
        ),
    )?;
    let after = read(editor.observe().document_json())?;
    assert!(after.contains("paste-one:i:"));
    assert!(after.contains("\"breditor/asset-id\":\"asset\""));
    assert!(!after.contains("\"breditor/asset-generation\":\"generation\""));
    roundtrip(
        &mut editor,
        &action(
            "pasteFlowClipboard",
            json!({"clipboardJson":copy["structuredJson"],
        "position":{"parent":{"kind":"document"},"before":null},
        "allocation":{"prefix":"paste-two","replica":"1","counter":"2","lamport":"3"}}),
        ),
    )?;
    assert_eq!(view(&editor)?["tables"].as_array().ok_or("tables")?.len(), 2);
    let recovered =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(read(recovered.observe().document_json())?, read(editor.observe().document_json())?);
    Ok(())
}

#[test]
fn typed_extension_format_values_work_in_rich_cells_and_survive_history_recovery() -> TestResult {
    let mut bootstrap: Value = serde_json::from_str(&bootstrap(6))?;
    bootstrap["extensions"] = json!([{"id":{"name":"example/color-extension","version":1},"dependencies":[],"conflicts":[],
        "inlineFormats":[{"kind":"example/color","revision":1}],"inlineFormatPropertyContracts":[{
            "formatKind":"example/color","properties":[{"name":"example/color-value","presence":"required","valueType":{
                "kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":32}}]}],"inlineFormatToggles":[],"inlineFormatSets":[]}]);
    let profile = BreditorRichProfile::from_bootstrap_json(&bootstrap.to_string())
        .take_profile()
        .ok_or("typed profile")?;
    let mut editor = editor(&profile)?;
    command(&mut editor, &select("1", "1"), "selection")?;
    command(
        &mut editor,
        &json!({"kind":"setPendingFormats","formats":[{"type":"example/color","properties":{"example/color-value":"gold"}}]}),
        "typing",
    )?;
    roundtrip(&mut editor, &json!({"kind":"insertPlainText","text":"X"}))?;
    let formats = r#"[{"type":"example/color","properties":{"example/color-value":"blue"}}]"#;
    roundtrip(
        &mut editor,
        &action(
            "setInlineFormat",
            json!({"change":{"kind":"set","formatsJson":formats},"targets":[{"block":"p","start":"0","end":"5"}]}),
        ),
    )?;
    let before = read(editor.checkpoint_json())?;
    let failure=editor.execute(&editor.observe(),r#"{"kind":"setPendingFormats","formats":[{"type":"example/color","properties":{"example/color-value":""}}]}"#);
    assert_eq!(failure.status(), "error");
    assert_eq!(read(editor.checkpoint_json())?, before);
    let recovered = profile.restore_editor(&before).take_editor().ok_or("restore")?;
    assert_eq!(read(recovered.observe().document_json())?, read(editor.observe().document_json())?);
    assert!(read(recovered.observe().document_json())?.contains("blue"));
    Ok(())
}

#[test]
fn explicit_input_target_keeps_the_actual_caret_in_undo_history() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    command(&mut editor, &select("3", "3"), "selection")?;
    let actual = view(&editor)?["selection"].clone();
    roundtrip(
        &mut editor,
        &action(
            "replaceTextRange",
            json!({"selection":{"kind":"text","anchor":point("1"),"focus":point("3")},"text":""}),
        ),
    )?;
    assert!(read(editor.observe().document_json())?.contains("\"text\":\"ab\""));
    command(&mut editor, &json!({"kind":"undo"}), "undo")?;
    assert_eq!(view(&editor)?["selection"], actual);
    assert_eq!(view(&editor)?["selection"]["focus"]["offset"], "3");
    let recovered =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(view(&recovered)?["selection"], actual);
    Ok(())
}

#[test]
fn selected_enter_and_whole_flow_paste_are_single_exact_history_units() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    command(&mut editor, &select("1", "3"), "selection")?;
    let depth = view(&editor)?["undoDepth"].clone();
    roundtrip(
        &mut editor,
        &action("insertParagraph", json!({"right":"enter-right","newItem":null})),
    )?;
    assert_eq!(view(&editor)?["undoDepth"].as_u64(), Some(depth.as_u64().ok_or("depth")? + 1));
    assert_eq!(view(&editor)?["selection"]["focus"]["block"], "enter-right");
    assert!(read(editor.observe().document_json())?.contains("\"text\":\"b\""));
    command(&mut editor, &json!({"kind":"undo"}), "undo")?;
    command(
        &mut editor,
        &json!({"kind":"setSelection","selection":{"kind":"node","block":"image-block"}}),
        "selection",
    )?;
    let copied: Value = serde_json::from_str(&read(editor.observe().clipboard_json())?)?;
    command(&mut editor, &select("1", "3"), "selection")?;
    roundtrip(
        &mut editor,
        &action(
            "pasteFlowAtText",
            json!({"clipboardJson":copied["structuredJson"],"allocation":{"prefix":"at-caret","replica":"1","counter":"4","lamport":"10"},"right":"paste-right"}),
        ),
    )?;
    assert_eq!(view(&editor)?["selection"]["focus"]["block"], "paste-right");
    let after = read(editor.observe().document_json())?;
    assert!(after.contains("at-caret:i:"));
    let mut recovered =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    command(&mut recovered, &json!({"kind":"undo"}), "undo")?;
    assert_eq!(view(&recovered)?["selection"]["anchor"]["offset"], "1");
    assert_eq!(view(&recovered)?["selection"]["focus"]["offset"], "3");
    command(&mut recovered, &json!({"kind":"redo"}), "redo")?;
    assert_eq!(read(recovered.observe().document_json())?, after);
    Ok(())
}

#[test]
fn rich_profile_v6_is_explicit_and_existing_factories_remain_closed() -> TestResult {
    let profile = profile()?;
    let descriptor: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    assert_eq!(descriptor["abiVersion"], 1);
    assert_eq!(descriptor["kind"], "rich");
    assert_eq!(descriptor["schema"]["name"], "example/rich-wasm");
    assert_eq!(
        descriptor["schemaFingerprint"]
            .as_str()
            .ok_or("fingerprint")?
            .strip_prefix("sha256:")
            .ok_or("algorithm")?
            .len(),
        64
    );
    for version in 1..=5 {
        assert_eq!(BreditorRichProfile::from_bootstrap_json(&bootstrap(version)).status(), "error");
    }
    assert_eq!(BreditorCompiledProfile::from_bootstrap_json(&bootstrap(6)).status(), "error");
    for capacity in ["", "-1", "01", "10001", "1.0", " 1", "18446744073709551616"] {
        assert_eq!(profile.create_editor(&initial(&profile)?, capacity).status(), "error");
    }
    assert_eq!(profile.create_editor(&initial(&profile)?, "0").status(), "editor");
    Ok(())
}

#[test]
fn view_preserves_authoritative_document_and_derived_geometry() -> TestResult {
    let profile = profile()?;
    let editor = editor(&profile)?;
    let observation = editor.observe();
    let view: Value = serde_json::from_str(&read(observation.view_json())?)?;
    let document = read(observation.document_json())?;
    assert_eq!(view["documentJson"], document);
    assert_eq!(view["revision"], "0");
    assert_eq!(view["historyCapacity"], 100);
    assert!(view["selection"].is_null());
    assert_eq!(view["tables"][0]["rows"], json!(["r"]));
    assert_eq!(view["tables"][0]["columns"], json!([{"id":"c","width":120}]));
    assert_eq!(
        view["tables"][0]["cells"][0]["master"],
        json!({"table":"t","row":"r","column":"c"})
    );
    assert_eq!(view["tables"][0]["cells"][0]["sources"].as_array().ok_or("sources")?.len(), 1);
    assert_eq!(observation.revision(), "0");
    Ok(())
}

#[test]
fn range_typing_pending_marks_and_exact_recovered_undo_are_public_workflows() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    let original = read(editor.observe().document_json())?;
    command(&mut editor, &select("1", "3"), "selection")?;
    let obsolete = editor.observe();
    command(&mut editor, &json!({"kind":"insertPlainText","text":"X"}), "content")?;
    let after = read(editor.observe().document_json())?;
    let state = view(&editor)?;
    assert_eq!(state["selection"]["focus"]["offset"], "2");
    assert_eq!(state["pendingFormatsJson"], r#"[{"type":"breditor/strong","properties":{}}]"#);
    assert_eq!(state["undoDepth"], 1);
    let failure =
        editor.execute(&obsolete, r#"{"kind":"insertPlainText","text":"SHOULD NOT APPEAR"}"#);
    assert_eq!(failure.status(), "error");
    assert_eq!(failure.error().ok_or("error")?.code(), "breditor_rich.stale_observation");
    assert_eq!(read(editor.observe().document_json())?, after);
    let mut restored =
        profile.restore_editor(&read(editor.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(read(restored.observe().document_json())?, after);
    assert_eq!(restored.execute(&editor.observe(), r#"{"kind":"undo"}"#).status(), "error");
    command(&mut restored, &json!({"kind":"undo"}), "undo")?;
    assert_eq!(read(restored.observe().document_json())?, original);
    let selection = view(&restored)?["selection"].clone();
    assert_eq!(selection["anchor"]["offset"], "1");
    assert_eq!(selection["focus"]["offset"], "3");
    command(&mut restored, &json!({"kind":"redo"}), "redo")?;
    assert_eq!(read(restored.observe().document_json())?, after);
    command(&mut restored, &json!({"kind":"setHeading","block":"p","level":3}), "content")?;
    assert!(read(restored.observe().document_json())?.contains("breditor/heading"));
    Ok(())
}

#[test]
fn raw_format_fields_distinguish_null_plain_and_omission_without_tag_order_dependence() -> TestResult
{
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    command(&mut editor, &select("1", "1"), "selection")?;
    let observation = editor.observe();
    let mut result = editor.execute(&observation, r#"{"formats":[],"kind":"setPendingFormats"}"#);
    assert_eq!(result.status(), "typing");
    assert!(result.take_observation().is_some());
    assert_eq!(view(&editor)?["pendingFormatsJson"], "[]");
    command(&mut editor, &json!({"kind":"insertPlainText","text":"plain"}), "content")?;
    command(&mut editor, &json!({"kind":"setPendingFormats","formats":null}), "typing")?;
    assert!(view(&editor)?["pendingFormatsJson"].is_null());
    command(
        &mut editor,
        &json!({"kind":"setPendingFormats","formats":[{"type":"breditor/strong","properties":{}}]}),
        "typing",
    )?;
    Ok(())
}

#[test]
fn closed_command_and_selection_shapes_reject_without_partial_publication() -> TestResult {
    let profile = profile()?;
    let mut editor = editor(&profile)?;
    command(&mut editor, &select("1", "1"), "selection")?;
    let before = read(editor.checkpoint_json())?;
    for input in [
        r#"{"kind":"undo","text":null}"#,
        r#"{"kind":"undo","extra":1}"#,
        r#"{"kind":"setPendingFormats"}"#,
        r#"{"kind":"insertPlainText","text":"a","text":"b"}"#,
        r#"{"kind":"insertPlainText","text":null}"#,
        r#"{"kind":"setHeading","block":"p"}"#,
        r#"{"kind":"setPendingFormats","formats":[{"type":"unknown/format","properties":{}}]}"#,
        r#"{"kind":"setSelection","selection":{"kind":"text","anchor":{"block":"p","offset":1,"affinity":"after"},"focus":{"block":"p","offset":"1","affinity":"after"}}}"#,
        r#"{"kind":"setSelection","selection":{"kind":"text","anchor":{"block":"p","offset":"01","affinity":"after"},"focus":{"block":"p","offset":"1","affinity":"after"}}}"#,
        r#"{"kind":"setSelection","selection":{"kind":"text","anchor":{"block":"p","offset":"2","affinity":"after"},"focus":{"block":"p","offset":"2","affinity":"after"}}}"#,
    ] {
        let mut result = editor.execute(&editor.observe(), input);
        assert_eq!(result.status(), "error", "{input}");
        assert!(result.take_observation().is_none());
        assert!(!result.error().ok_or("error")?.message().contains("unknown/format"));
        assert_eq!(read(editor.checkpoint_json())?, before, "{input}");
    }
    Ok(())
}
