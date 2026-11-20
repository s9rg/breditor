//! Wasm boundary for optional `autolink-v1`: strict rule-set requests and the Enter split call.
#![cfg(feature = "experimental-rich-content")]

use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use serde_json::{Value, json};

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

fn read(mut result: BreditorStringResult) -> TestResult<String> {
    assert_eq!(result.status(), "value");
    Ok(result.take_value().ok_or("read")?)
}
fn owner(text: &str, natural: bool) -> TestResult<BreditorRichEditor> {
    let bootstrap = json!({"format":"breditor/profile-bootstrap","formatVersion":6,
        "schema":{"name":"example/rich-wasm","version":1},"extensions":[]});
    let profile = BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap.to_string())
        .take_profile()
        .ok_or("profile")?;
    let descriptor: Value = serde_json::from_str(&read(profile.descriptor_json())?)?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":descriptor["schema"],"schemaFingerprint":descriptor["schemaFingerprint"],
        "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"d"},
            "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"p"},
                "children":[{"kind":"text","text":text,"formats":[]}]}]}});
    let mut owner =
        profile.create_editor(&document.to_string(), "128").take_editor().ok_or("owner")?;
    if natural {
        read(owner.enable_typing_history(&owner.observe()))?;
    }
    let offset = text.encode_utf16().count().to_string();
    let point = json!({"block":"p","offset":offset,"affinity":"after"});
    let select =
        json!({"kind":"setSelection","selection":{"kind":"text","anchor":point,"focus":point}});
    assert_eq!(owner.execute(&owner.observe(), &select.to_string()).status(), "selection");
    Ok(owner)
}
fn runs(owner: &BreditorRichEditor) -> TestResult<Vec<(String, String)>> {
    let document: Value = serde_json::from_str(&read(owner.observe().document_json())?)?;
    Ok(document["root"]["children"][0]["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .map(|run| {
            let href = run["formats"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|f| f["type"] == "breditor-inline/link")
                .map_or(String::new(), |f| {
                    f["properties"]["breditor-inline/href"].as_str().unwrap_or("?").into()
                });
            (run["text"].as_str().unwrap_or_default().into(), href)
        })
        .collect())
}
fn undo_depth(owner: &BreditorRichEditor) -> TestResult<Value> {
    let view: Value = serde_json::from_str(&read(owner.observe().view_json())?)?;
    Ok(view["undoDepth"].clone())
}

#[test]
fn rule_set_requests_are_strict_and_autolink_is_one_isolated_group() -> TestResult {
    for natural in [false, true] {
        let mut owner = owner("see https://example.com/a.", natural)?;
        assert_eq!(owner.input_rule_sets_version(), "1");
        let before = read(owner.checkpoint_json())?;
        for invalid in [
            json!({"text":" ","namespace":"n","rules":[]}),
            json!({"text":" ","namespace":"n","rules":["autolink-v1","autolink-v1"]}),
            json!({"text":" ","namespace":"n","rules":["autolink-v2"]}),
            json!({"text":" ","namespace":"n"}),
            json!({"text":" ","namespace":"n","rules":["autolink-v1"],"extra":1}),
        ] {
            let method = if natural {
                let mut value = invalid.clone();
                value["clockMs"] = json!("5");
                owner.insert_typing_text_with_input_rules(&owner.observe(), &value.to_string())
            } else {
                owner.insert_plain_text_with_input_rules(&owner.observe(), &invalid.to_string())
            };
            assert_eq!(method.status(), "error", "{invalid}");
            assert_eq!(read(owner.checkpoint_json())?, before);
        }
        let depth = undo_depth(&owner)?;
        let result = if natural {
            owner.insert_typing_text_with_input_rules(
                &owner.observe(),
                &json!({"text":" ","namespace":"n","rules":["markdown-v1","autolink-v1"],"clockMs":"7"}).to_string(),
            )
        } else {
            owner.insert_plain_text_with_input_rules(
                &owner.observe(),
                &json!({"text":" ","namespace":"n","rules":["autolink-v1"]}).to_string(),
            )
        };
        assert_eq!(read(result)?, "applied");
        assert_eq!(
            runs(&owner)?,
            vec![
                ("see ".into(), String::new()),
                ("https://example.com/a".into(), "https://example.com/a".into()),
                (". ".into(), String::new())
            ]
        );
        assert_eq!(undo_depth(&owner)?, json!(depth.as_u64().ok_or("depth")? + 2));
        assert_eq!(owner.execute(&owner.observe(), r#"{"kind":"undo"}"#).status(), "undo");
        assert_eq!(runs(&owner)?, vec![("see https://example.com/a. ".into(), String::new())]);
    }
    Ok(())
}

#[test]
fn enter_split_links_the_left_block_and_one_undo_keeps_the_split() -> TestResult {
    let mut owner = owner("go www.example.com", false)?;
    let input = json!({"right":"right","newItem":null}).to_string();
    assert_eq!(read(owner.insert_paragraph_with_autolink(&owner.observe(), &input))?, "applied");
    let document: Value = serde_json::from_str(&read(owner.observe().document_json())?)?;
    assert_eq!(document["root"]["children"].as_array().ok_or("blocks")?.len(), 2);
    assert_eq!(
        runs(&owner)?,
        vec![
            ("go ".into(), String::new()),
            ("www.example.com".into(), "https://www.example.com/".into())
        ]
    );
    assert_eq!(owner.execute(&owner.observe(), r#"{"kind":"undo"}"#).status(), "undo");
    assert_eq!(runs(&owner)?, vec![("go www.example.com".into(), String::new())]);
    let document: Value = serde_json::from_str(&read(owner.observe().document_json())?)?;
    assert_eq!(document["root"]["children"].as_array().ok_or("blocks")?.len(), 2);
    // A non-URL Enter only splits; read-only rejects before splitting.
    let mut plain = owner_plain()?;
    assert_eq!(
        read(plain.insert_paragraph_with_autolink(
            &plain.observe(),
            &json!({"right":"r2","newItem":null}).to_string()
        ))?,
        "inserted"
    );
    read(plain.set_read_only(&plain.observe(), true))?;
    let before = read(plain.checkpoint_json())?;
    let rejected = plain.insert_paragraph_with_autolink(
        &plain.observe(),
        &json!({"right":"r3","newItem":null}).to_string(),
    );
    assert_eq!(rejected.error().ok_or("readonly")?.code(), "breditor_rich.read_only");
    assert_eq!(read(plain.checkpoint_json())?, before);
    Ok(())
}
fn owner_plain() -> TestResult<BreditorRichEditor> {
    owner("javascript:alert(1)", false)
}
