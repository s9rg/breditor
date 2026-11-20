//! Candidate V4 image links through the Wasm descriptor, owner capability and command boundary.
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
fn bootstrap(revision: u32) -> String {
    json!({"format":"breditor/profile-bootstrap","formatVersion":revision,"schema":{"name":"example/layout","version":1},"extensions":[]}).to_string()
}
fn profile() -> Result<BreditorRichProfile> {
    BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap(9))
        .take_profile()
        .ok_or("profile".into())
}
fn descriptor(p: &BreditorRichProfile) -> Result<Value> {
    Ok(serde_json::from_str(&read(p.descriptor_json())?)?)
}
/// `p` paragraph, then image `img` (block `fig`, alt "Chart", caption), then decorative `dimg`.
fn root() -> Value {
    let mut image = fixture::element("image", "fig", vec![fixture::paragraph("cap", "Caption")]);
    image["properties"] = json!({"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Chart"});
    let mut deco = fixture::element("image", "deco", vec![]);
    deco["properties"] = json!({"breditor/block-id":"deco","breditor/image-id":"dimg","breditor/asset-id":"asset2","breditor/asset-generation":"gen","breditor/decorative":true,"breditor/alt-text":""});
    let mut root =
        fixture::element("document", "unused", vec![fixture::paragraph("p", "Hello"), image, deco]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn owner(p: &BreditorRichProfile, root: &Value) -> Result<BreditorRichEditor> {
    let d = descriptor(p)?;
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root}).to_string(), "100").take_editor().ok_or("owner".into())
}
fn run(a: &mut BreditorRichEditor, c: &Value) -> String {
    a.execute(&a.observe(), &c.to_string()).status()
}
fn link(data: Value) -> Value {
    let mut command = json!({"kind":"setImageLink"});
    command["data"] = data;
    command
}
fn image(a: &BreditorRichEditor) -> Result<Value> {
    let d: Value = serde_json::from_str(&read(a.observe().document_json())?)?;
    Ok(d["root"]["children"][1]["properties"].clone())
}

#[test]
fn v4_descriptor_and_owner_report_image_links_only_for_v4() -> Result {
    let p = profile()?;
    let d = descriptor(&p)?;
    assert_eq!(d["imageLinkVersion"], 1);
    assert_eq!(d["textLanguageVersion"], 1);
    assert_eq!(
        d["schemaFingerprint"],
        "sha256:6daf61c3c5a216bb4d831c8bd6b9b776044b0a4598a346270ecf6579373959c0"
    );
    assert_eq!(owner(&p, &root())?.image_link_version(), "1");
    let plain =
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9)).take_profile().ok_or("plain")?;
    assert_eq!(descriptor(&plain)?["imageLinkVersion"], 1);
    for mut result in [
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8)),
    ] {
        let old = result.take_profile().ok_or("old profile")?;
        assert!(descriptor(&old)?.get("imageLinkVersion").is_none());
        let mut a = owner(&old, &root())?;
        assert_eq!(a.image_link_version(), "0");
        let before = read(a.checkpoint_json())?;
        assert_eq!(
            run(&mut a, &link(json!({"image":"img","href":"https://example.com/"}))),
            "error"
        );
        assert_eq!(read(a.checkpoint_json())?, before);
        let mut raw = root();
        raw["children"][1]["properties"]["breditor/image-href"] = json!("https://example.com/");
        assert!(owner(&old, &raw).is_err());
    }
    Ok(())
}

#[test]
fn set_replace_clear_undo_redo_and_restore() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let original = image(&a)?;
    assert_eq!(
        run(&mut a, &link(json!({"image":"img","href":"https://example.com/a"}))),
        "content"
    );
    let linked = image(&a)?;
    assert_eq!(linked["breditor/image-href"], "https://example.com/a");
    assert!(linked.get("breditor/image-link-new-window").is_none());
    assert_eq!(
        run(&mut a, &link(json!({"image":"img","href":"https://example.com/a"}))),
        "unchanged"
    );
    assert_eq!(
        run(&mut a, &link(json!({"image":"img","href":"https://example.org/","newWindow":true}))),
        "content"
    );
    let replaced = image(&a)?;
    assert_eq!(replaced["breditor/image-link-new-window"], json!(true));
    let mut b = p.restore_editor(&read(a.checkpoint_json())?).take_editor().ok_or("restore")?;
    assert_eq!(image(&b)?, replaced);
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(image(&b)?, linked);
    assert_eq!(run(&mut b, &json!({"kind":"undo"})), "undo");
    assert_eq!(image(&b)?, original);
    assert_eq!(run(&mut b, &json!({"kind":"redo"})), "redo");
    assert_eq!(image(&b)?, linked);
    assert_eq!(run(&mut a, &link(json!({"image":"img","href":null}))), "content");
    assert_eq!(image(&a)?, original);
    assert_eq!(run(&mut a, &link(json!({"image":"img","href":null}))), "unchanged");
    Ok(())
}

#[test]
fn decorative_read_only_stale_and_malformed_intent_is_refused_without_publication() -> Result {
    let p = profile()?;
    let mut a = owner(&p, &root())?;
    let before = read(a.checkpoint_json())?;
    for data in [
        json!({"image":"dimg","href":"https://example.com/"}),
        json!({"image":"missing","href":"https://example.com/"}),
        json!({"image":"img","href":"HTTPS://EXAMPLE.COM"}),
        json!({"image":"img","href":"javascript:alert(1)"}),
        json!({"image":"img","href":"https://user:pw@example.com/"}),
        json!({"image":"img","href":null,"newWindow":true}),
        json!({"image":"img"}),
        json!({"image":"img","href":"https://example.com/","extra":1}),
        json!(["img"]),
    ] {
        assert_eq!(run(&mut a, &link(data.clone())), "error", "{data}");
    }
    assert_eq!(read(a.checkpoint_json())?, before);
    read(a.set_read_only(&a.observe(), true))?;
    let locked = read(a.checkpoint_json())?;
    assert_eq!(run(&mut a, &link(json!({"image":"img","href":"https://example.com/"}))), "error");
    assert_eq!(read(a.checkpoint_json())?, locked);
    read(a.set_read_only(&a.observe(), false))?;
    let stale = a.observe();
    assert_eq!(run(&mut a, &link(json!({"image":"img","href":"https://example.com/"}))), "content");
    let late = link(json!({"image":"img","href":null})).to_string();
    assert_eq!(a.execute(&stale, &late).status(), "error");
    // A linked image keeps a description; making it decorative is refused by native admission.
    assert_eq!(
        run(
            &mut a,
            &json!({"kind":"setImageAlt","data":{"image":"img","alt":{"kind":"description","text":"New"}}})
        ),
        "content"
    );
    assert_eq!(
        run(
            &mut a,
            &json!({"kind":"setImageAlt","data":{"image":"img","alt":{"kind":"decorative"}}})
        ),
        "error"
    );
    Ok(())
}
