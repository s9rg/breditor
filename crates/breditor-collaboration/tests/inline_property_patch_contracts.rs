//! Property-only planning uses old annotation operations and exact author-local history.
use breditor_collaboration::rich_replica::{
    Command, SharedRichProfile,
    actions::{InsertText, SetFormat},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn link(href: &str, new: bool) -> Value {
    json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":href,"breditor-inline/new-window":new}})
}
fn setup(version: u32) -> Result<(SharedRichProfile, String)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/property-patch","version":1},"extensions":[]}).to_string();
    let profile = if version == 1 {
        SharedRichProfile::from_standard_configuration_json_v1(&config)?
    } else {
        SharedRichProfile::from_standard_configuration_json_v2(&config)?
    };
    let mut root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    root["children"][0]["children"][0]["children"][0]["children"][0]["children"] = json!([
        {"kind":"text","text":"a🙂","formats":[link("https://one.test/",false),{"type":"breditor/strong","properties":{}}]},
        {"kind":"text","text":"b","formats":[link("https://two.test/",true)]}]);
    let schema = profile.schema();
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    Ok((profile, document))
}
fn request(field: &str, href: &str, new: bool) -> Value {
    json!({"formatsJson":json!([link(href,new)]).to_string(),"properties":[field],"targets":[{"block":"p","offset":0,"length":4}]})
}
fn find<'a>(node: &'a Value, id: &str) -> Result<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        return Ok(node);
    }
    for child in node["children"].as_array().into_iter().flatten() {
        if let Ok(node) = find(child, id) {
            return Ok(node);
        }
    }
    Err("block missing".into())
}
#[test]
fn both_languages_keep_mixed_fields_foreign_work_and_exact_recovered_history() -> Result {
    for version in [1, 2] {
        let (profile, seed) = setup(version)?;
        let mut a = profile.create(&seed, "101".into())?;
        let mut b = profile.join_frame("room".into(), "103".into(), &a.update_frame()?)?;
        let patch = request("breditor-inline/href", "https://changed.test/", false);
        assert!(a.patch_inline_format_properties_json_guarded(&a.observe()?, &patch.to_string())?);
        let after: Value = serde_json::from_str(a.document_json())?;
        let p = find(&after["root"], "p")?;
        assert_eq!(p["children"][0]["formats"][0], link("https://changed.test/", false));
        assert_eq!(p["children"][1]["formats"][0], link("https://changed.test/", true));
        assert_eq!(
            p["children"][0]["formats"][1],
            json!({"type":"breditor/strong","properties":{}})
        );
        assert_eq!(p["children"][0]["text"], "a🙂");
        b.apply(vec![
            Command::InsertText(InsertText {
                block: "caption".into(),
                offset: 0,
                text: "Peer ".into(),
            }),
            Command::SetFormat(SetFormat {
                block: "p".into(),
                offset: 0,
                length: 4,
                format: json!({"type":"breditor-inline/italic","properties":{}}),
                enabled: true,
            }),
        ])?;
        a.receive_frame(&b.update_frame()?)?;
        b.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), b.document_json());
        let mut restored = profile.restore("room", &a.checkpoint()?)?;
        for undo in [true, false, true, false] {
            if undo {
                assert!(a.undo()?);
                assert!(restored.undo()?);
            } else {
                assert!(a.redo()?);
                assert!(restored.redo()?);
            }
            assert_eq!(a.checkpoint()?, restored.checkpoint()?);
            let document: Value = serde_json::from_str(a.document_json())?;
            assert!(
                find(&document["root"], "caption")?["children"][0]["text"]
                    .as_str()
                    .ok_or("text")?
                    .starts_with("Peer ")
            );
            let p = find(&document["root"], "p")?;
            assert_eq!(p["children"][0]["formats"][0]["type"], "breditor-inline/italic");
            assert_eq!(
                p["children"][0]["formats"][1],
                link(if undo { "https://one.test/" } else { "https://changed.test/" }, false)
            );
        }
    }
    Ok(())
}
#[test]
fn rejected_or_noop_intents_preserve_the_live_observation_and_checkpoint() -> Result {
    let (profile, seed) = setup(1)?;
    let mut a = profile.create(&seed, "101".into())?;
    let observation = a.observe()?;
    let before = a.checkpoint()?;
    let valid = request("breditor-inline/href", "https://changed.test/", false);
    let mut requests = vec![];
    for (key, value) in [
        ("properties", json!([])),
        ("properties", json!(["breditor-inline/href", "breditor-inline/href"])),
        ("properties", json!(["example/missing"])),
        ("targets", json!([])),
        (
            "targets",
            json!([{"block":"p","offset":0,"length":4},{"block":"p","offset":0,"length":1}]),
        ),
        (
            "targets",
            json!([{"block":"p","offset":0,"length":4},{"block":"caption","offset":0,"length":1}]),
        ),
        ("targets", json!([{"block":"p","offset":0,"length":2}])),
        ("targets", json!([{"block":"p","offset":u32::MAX,"length":2}])),
    ] {
        let mut candidate = valid.clone();
        candidate[key] = value;
        requests.push(candidate.to_string());
    }
    let mut duplicate = valid.clone();
    duplicate["formatsJson"] = json!(
        "[{\"type\":\"breditor-inline/link\",\"properties\":{\"breditor-inline/href\":\"https://one.test/\",\"breditor-inline/href\":\"https://two.test/\",\"breditor-inline/new-window\":false}}]"
    );
    requests.push(duplicate.to_string());
    for request in requests {
        assert!(
            a.patch_inline_format_properties_json_guarded(&observation, &request).is_err(),
            "{request}"
        );
        assert_eq!(a.checkpoint()?, before);
        a.check(&observation)?;
    }
    let mut noop = request("breditor-inline/new-window", "https://unused.test/", true);
    noop["targets"][0] = json!({"block":"p","offset":3,"length":1});
    assert!(!a.patch_inline_format_properties_json_guarded(&observation, &noop.to_string())?);
    assert_eq!(a.checkpoint()?, before);
    a.check(&observation)?;
    a.patch_inline_format_properties_json_guarded(&observation, &valid.to_string())?;
    let after = a.checkpoint()?;
    assert!(
        a.patch_inline_format_properties_json_guarded(&observation, "not JSON")
            .err()
            .ok_or("stale")?
            .to_string()
            .contains("stale or foreign")
    );
    assert_eq!(a.checkpoint()?, after);
    Ok(())
}

#[test]
fn existing_group_limit_is_atomic_and_equal_results_coalesce_before_it() -> Result {
    let (profile, seed) = setup(1)?;
    for different_targets in [false, true] {
        let mut seed: Value = serde_json::from_str(&seed)?;
        seed["root"]["children"][0]["children"][0]["children"][0]["children"][0]["children"] = Value::Array((0..65).map(|index| json!({"kind":"text","text":"x","formats":[link(&format!("https://source.test/{index}"),different_targets && index % 2 == 1)]})).collect());
        let mut a = profile.create(&seed.to_string(), "101".into())?;
        let before = a.checkpoint()?;
        let before_document = a.document_json().to_owned();
        let observation = a.observe()?;
        let mut patch = request("breditor-inline/href", "https://changed.test/", false);
        patch["targets"][0]["length"] = json!(65);
        let result =
            a.patch_inline_format_properties_json_guarded(&observation, &patch.to_string());
        if different_targets {
            assert!(
                result
                    .err()
                    .ok_or("65 intervals must reject")?
                    .to_string()
                    .contains("inline property patch commands")
            );
            assert_eq!(a.checkpoint()?, before);
            a.check(&observation)?;
        } else {
            assert!(result?);
            let document: Value = serde_json::from_str(a.document_json())?;
            assert_eq!(
                find(&document["root"], "p")?["children"].as_array().ok_or("runs")?.len(),
                1
            );
            assert!(a.undo()?);
            assert_eq!(a.document_json(), before_document);
        }
    }
    Ok(())
}
