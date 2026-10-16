//! Foreign adapters must pass native schema, canonical-tree and semantic clipboard admission.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardCodecError, RichClipboardJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        RichClipboardFragment, RichClipboardKind, RichDocument, RichSelection, RichSelectionKind,
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn context(name: &str, standard: bool) -> Result<EditorContext> {
    let extensions = if standard { vec![standard_inline_extension_v1()] } else { vec![] };
    Ok(EditorContext::new(
        CompiledSchema::try_compile_rich_content_profile_v3(
            SchemaId::new(QualifiedName::try_new(name)?, SchemaVersion::try_new(1)?),
            &ExtensionSet::try_new(extensions, ExtensionLimits::default())?,
        )?,
        DocumentLimits::default(),
    ))
}
fn root() -> Value {
    json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"breditor-clipboard"},"children":[{
        "kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"source-p"},"children":[
            {"kind":"text","text":"Café 🙂 日本\n","formats":[{"type":"breditor/strong","properties":{}}]},
            {"kind":"text","text":"tail","formats":[{"type":"breditor-inline/italic","properties":{}}]}
        ]
    }]})
}
#[test]
fn admission_binds_the_exact_receiving_schema_and_round_trips_mixed_unicode() -> Result {
    let a = RichClipboardJsonCodec::new(context("example/interchange-a", true)?);
    let b = RichClipboardJsonCodec::new(context("example/interchange-b", true)?);
    let fragment = a.admit_root(RichClipboardKind::Text, &root().to_string())?;
    assert_eq!(fragment.plain_text()?, "Café 🙂 日本\ntail");
    let encoded = a.encode(&fragment)?;
    assert_eq!(a.encode(&a.decode(&encoded)?)?, encoded);
    assert!(b.decode(&encoded).is_err());
    let rebound = b.admit_root(RichClipboardKind::Text, &root().to_string())?;
    assert_ne!(b.encode(&rebound)?, encoded);
    let transfer: Value = serde_json::from_str(&a.encode_transfer(&fragment)?)?;
    assert_eq!(transfer["format"], "breditor/rich-clipboard-transfer");
    assert_eq!(transfer["formatVersion"], 1);
    assert_eq!(transfer["kind"], "text");
    assert_eq!(transfer["structuredJson"], encoded);
    assert_eq!(transfer["plainText"], fragment.plain_text()?);
    Ok(())
}
#[test]
fn equal_schema_selectors_do_not_make_different_definitions_interchangeable() -> Result {
    let extended = RichClipboardJsonCodec::new(context("example/interchange-same", true)?);
    let original = RichClipboardJsonCodec::new(context("example/interchange-same", false)?);
    let mut shared_root = root();
    shared_root["children"][0]["children"][1]["formats"] = json!([]);
    let a = extended
        .encode(&extended.admit_root(RichClipboardKind::Text, &shared_root.to_string())?)?;
    let b = original
        .encode(&original.admit_root(RichClipboardKind::Text, &shared_root.to_string())?)?;
    let encoded_a: Value = serde_json::from_str(&a)?;
    let encoded_b: Value = serde_json::from_str(&b)?;
    assert_eq!(encoded_a["document"]["schema"], encoded_b["document"]["schema"]);
    assert_ne!(
        encoded_a["document"]["schemaFingerprint"],
        encoded_b["document"]["schemaFingerprint"]
    );
    assert!(extended.decode(&b).is_err());
    assert!(original.decode(&a).is_err());
    Ok(())
}
#[test]
fn schema_kind_neutral_identity_and_canonical_runs_are_not_inferred_or_repaired() -> Result {
    let codec = RichClipboardJsonCodec::new(context("example/interchange", true)?);
    assert!(
        RichClipboardJsonCodec::new(context("example/interchange", false)?)
            .admit_root(RichClipboardKind::Text, &root().to_string())
            .is_err()
    );
    assert!(codec.admit_root(RichClipboardKind::Grid, &root().to_string()).is_err());
    for malformed in [
        {
            let mut r = root();
            r["properties"]["breditor/document-id"] = json!("live-document");
            r
        },
        {
            let mut r = root();
            r["children"][0]["children"][1]["formats"] =
                r["children"][0]["children"][0]["formats"].clone();
            r
        },
        {
            let mut r = root();
            r["children"][0]["children"][0]["formats"][0]["properties"] =
                json!({"untrusted/property":true});
            r
        },
        {
            let mut r = root();
            r["children"][0]["children"][0]["text"] = json!("");
            r
        },
        {
            let mut r = root();
            r["children"][0]["extra"] = json!(1);
            r
        },
        {
            let mut r = root();
            let duplicate = r["children"][0].clone();
            r["children"].as_array_mut().ok_or("children")?.push(duplicate);
            r
        },
    ] {
        assert!(codec.admit_root(RichClipboardKind::Flow, &malformed.to_string()).is_err());
    }
    let empty = {
        let mut r = root();
        r["children"] = json!([]);
        r
    };
    assert!(codec.admit_root(RichClipboardKind::Text, &empty.to_string()).is_err());
    assert!(codec.admit_root(RichClipboardKind::Flow, &empty.to_string()).is_err());
    let duplicate =
        root().to_string().replacen("\"children\":", "\"children\":[],\"children\":", 1);
    assert!(codec.admit_root(RichClipboardKind::Flow, &duplicate).is_err());
    Ok(())
}
#[test]
fn native_schema_admission_is_not_a_foreign_url_sanitizer() -> Result {
    // Standard inline V1 stores bounded link literals; safe render policies and
    // foreign adapters own URL allowlisting. Do not silently change that schema.
    let codec = RichClipboardJsonCodec::new(context("example/interchange-url-policy", true)?);
    let mut source = root();
    source["children"][0]["children"][1]["formats"] = json!([{
        "type":"breditor-inline/link","properties":{"breditor-inline/href":"javascript:alert(1)","breditor-inline/new-window":false}
    }]);
    let fragment = codec.admit_root(RichClipboardKind::Flow, &source.to_string())?;
    let encoded = codec.encode(&fragment)?;
    assert!(encoded.contains("javascript:alert(1)"));
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);
    Ok(())
}
#[test]
fn allocation_and_complete_envelope_budgets_apply_before_returning_a_fragment() -> Result {
    let c = context("example/interchange-limits", true)?;
    let raw = root().to_string();
    let normal = RichClipboardJsonCodec::new(c.clone());
    assert!(matches!(
        normal.clone().with_max_json_bytes(raw.len() - 1).admit_root(RichClipboardKind::Text, &raw),
        Err(RichClipboardCodecError::Limit)
    ));
    // The root itself fits, but the native fingerprint-bearing envelope does not.
    assert!(
        normal.with_max_json_bytes(raw.len()).admit_root(RichClipboardKind::Text, &raw).is_err()
    );
    for limits in [
        c.limits().clone().with_max_nodes(2),
        c.limits().clone().with_max_text_bytes(3),
        c.limits().clone().with_max_json_bytes(50),
    ] {
        let bounded = RichClipboardJsonCodec::new(EditorContext::new(c.schema().clone(), limits));
        assert!(bounded.admit_root(RichClipboardKind::Text, &raw).is_err());
    }
    let mut deep = json!({"kind":"text","text":"x","formats":[]});
    for _ in 0..140 {
        deep = json!({"kind":"element","type":"breditor/blockquote","entityId":null,"properties":{},"children":[deep]});
    }
    assert!(
        RichClipboardJsonCodec::new(c)
            .admit_root(RichClipboardKind::Flow, &deep.to_string())
            .is_err()
    );
    Ok(())
}
#[test]
fn admitted_semantic_tables_captions_and_image_references_use_the_existing_clipboard() -> Result {
    let c = context("example/interchange-fixture", true)?;
    let source: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    let encoded = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/interchange-fixture","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":source});
    let document = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&encoded.to_string())?,
        c.limits(),
    )?;
    let selection = RichSelection::try_new(&document, RichSelectionKind::Document)?;
    let fragment =
        RichClipboardFragment::copy_general_selection(&c, &document, &selection)?.ok_or("copy")?;
    let codec = RichClipboardJsonCodec::new(c);
    let transfer = codec.encode(&fragment)?;
    let value: Value = serde_json::from_str(&transfer)?;
    let admitted =
        codec.admit_root(RichClipboardKind::Flow, &value["document"]["root"].to_string())?;
    assert_eq!(codec.encode(&admitted)?, transfer);
    assert_eq!(admitted.plain_text()?, fragment.plain_text()?);
    assert!(admitted.document().table_ids().next().is_some());
    assert!(admitted.document().image_ids().next().is_some());
    Ok(())
}
