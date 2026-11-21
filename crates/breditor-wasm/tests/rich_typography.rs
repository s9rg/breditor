//! Wasm boundary for optional `typography-v1`: strict rule-set requests and one isolated group.
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
fn text(owner: &BreditorRichEditor) -> TestResult<String> {
    let document: Value = serde_json::from_str(&read(owner.observe().document_json())?)?;
    Ok(document["root"]["children"][0]["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .map(|run| run["text"].as_str().unwrap_or_default().to_owned())
        .collect())
}
fn send(owner: &mut BreditorRichEditor, natural: bool, mut request: Value) -> BreditorStringResult {
    if natural {
        request["clockMs"] = json!("5");
        owner.insert_typing_text_with_input_rules(&owner.observe(), &request.to_string())
    } else {
        owner.insert_plain_text_with_input_rules(&owner.observe(), &request.to_string())
    }
}

#[test]
fn typography_requests_are_strict_and_one_undo_restores_the_typed_quote() -> TestResult {
    for natural in [false, true] {
        let mut owner = owner("say \"hi", natural)?;
        assert_eq!(owner.typography_input_rules_version(), "1");
        let before = read(owner.checkpoint_json())?;
        for invalid in [
            json!({"text":"\"","namespace":"n","rules":["typography-v2"]}),
            json!({"text":"\"","namespace":"n","rules":["typography-v1","typography-v1"]}),
            json!({"text":"\"","namespace":"n","rules":["markdown-v1"],"typography":{}}),
            json!({"text":"\"","namespace":"n","rules":["typography-v1"],"typography":{"include":["nope"]}}),
            json!({"text":"\"","namespace":"n","rules":["typography-v1"],"typography":{"quotes":"x"}}),
            json!({"text":"\"","namespace":"n","rules":["typography-v1"],"typography":{"exclude":["quotes","typography","symbols","mathematical"]}}),
            json!({"text":"\"","namespace":"n","rules":["typography-v1"],"typography":{"extra":[]}}),
        ] {
            assert_eq!(send(&mut owner, natural, invalid.clone()).status(), "error", "{invalid}");
            assert_eq!(read(owner.checkpoint_json())?, before);
        }
        let request = json!({"text":"\"","namespace":"n",
            "rules":["markdown-v1","autolink-v1","typography-v1"],"typography":{"quotes":"german"}});
        assert_eq!(read(send(&mut owner, natural, request))?, "applied");
        assert_eq!(text(&owner)?, "say \"hi“");
        assert_eq!(owner.execute(&owner.observe(), r#"{"kind":"undo"}"#).status(), "undo");
        assert_eq!(text(&owner)?, "say \"hi\"");
        // The default configuration needs no `typography` field.
        let mut plain = self::owner("(c", natural)?;
        let request = json!({"text":")","namespace":"n","rules":["typography-v1"]});
        assert_eq!(read(send(&mut plain, natural, request))?, "applied");
        assert_eq!(text(&plain)?, "©");
    }
    Ok(())
}
