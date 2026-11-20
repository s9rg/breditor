//! The unchanged exclusive `markdown-v1` Wasm calls carry list continuation and the
//! code-Enter line feed; no new method, capability or request field is involved.
#![cfg(feature = "experimental-rich-content")]
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("value".into())
}
fn create(children: &Value) -> Result<BreditorRichEditor> {
    let input = json!({"format":"breditor/profile-bootstrap","formatVersion":7,"schema":{"name":"example/list-rules-wasm","version":1},"extensions":[]}).to_string();
    let p = BreditorRichProfile::from_structural_bootstrap_json_v2(&input)
        .take_profile()
        .ok_or("profile")?;
    let d: Value = serde_json::from_str(&read(p.descriptor_json())?)?;
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":children});
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(),"100").take_editor().ok_or("editor".into())
}
fn el(kind: &str, id: &str, children: &Value) -> Value {
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":children})
}
fn txt(text: &str) -> Value {
    json!([{"kind":"text","text":text,"formats":[]}])
}
fn caret(a: &mut BreditorRichEditor, block: &str, offset: &str) -> Result {
    let p = json!({"block":block,"offset":offset,"affinity":"after"});
    let r = a.execute(
        &a.observe(),
        &json!({"kind":"setSelection","selection":{"kind":"text","anchor":p,"focus":p}})
            .to_string(),
    );
    if r.status() != "selection" {
        return Err(format!("selection {}", r.status()).into());
    }
    Ok(())
}
fn view(a: &BreditorRichEditor) -> Result<Value> {
    Ok(serde_json::from_str(&read(a.observe().view_json())?)?)
}
fn types(a: &BreditorRichEditor) -> Result<Vec<String>> {
    let doc: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(doc["root"]["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .map(|n| n["type"].as_str().unwrap_or("").to_owned())
        .collect())
}

#[test]
fn code_line_feed_and_list_markers_use_the_original_exclusive_calls() -> Result {
    for natural in [false, true] {
        let mut a = create(&json!([el("code-block", "c", &txt("x\n\n"))]))?;
        if natural {
            read(a.enable_typing_history(&a.observe()))?;
        }
        caret(&mut a, "c", "3")?;
        let request = json!({"text":"\n","namespace":"fresh"}).to_string();
        assert_eq!(
            read(a.insert_plain_text_with_markdown_rules(&a.observe(), &request))?,
            "applied"
        );
        assert_eq!(types(&a)?, ["breditor/code-block", "breditor/paragraph"]);
        assert_eq!(view(&a)?["undoDepth"], 2);
        assert_eq!(view(&a)?["selection"]["focus"]["block"], "fresh:rule:p");
        assert_eq!(a.execute(&a.observe(), r#"{"kind":"undo"}"#).status(), "undo");
        assert_eq!(types(&a)?, ["breditor/code-block"]);
        let doc: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
        assert_eq!(doc["root"]["children"][0]["children"][0]["text"], "x\n\n\n");

        let item = el("list-item", "i", &json!([el("paragraph", "a", &txt("a"))]));
        let mut b = create(&json!([
            el("bullet-list", "l", &json!([item])),
            el("paragraph", "b", &txt("-"))
        ]))?;
        caret(&mut b, "b", "1")?;
        let request = json!({"text":" ","namespace":"fresh"}).to_string();
        assert_eq!(
            read(b.insert_plain_text_with_markdown_rules(&b.observe(), &request))?,
            "applied"
        );
        assert_eq!(types(&b)?, ["breditor/bullet-list"]);
    }
    Ok(())
}
