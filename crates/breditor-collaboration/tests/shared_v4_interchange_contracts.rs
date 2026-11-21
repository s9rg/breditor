//! Shared V4 external interchange: an adapter root carrying every frozen V4 slice is admitted by a
//! shared V4 owner exactly as by the local V4 context, and pastes as one ordinary native shared
//! command (one writer-local Undo step) with fresh identities, converging on a peer without any
//! merge repair. V3 shared owners keep refusing V4 roots.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        ClipboardNamespace, PasteTarget, RichReplica, SharedRichProfile, selection::Selection,
        selection::TextPoint,
    },
};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{RichClipboardKind, standard_inline_extension_v1},
    schema::{CompiledSchema, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const SCHEMA: &str = "example/shared-v4-interchange";
fn config(revision: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":SCHEMA,"version":1},"extensions":[]}).to_string()
}
fn el(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn run(text: &str, formats: Vec<Value>) -> Value {
    let mut run = json!({"kind":"text","text":text,"formats":[]});
    run["formats"] = Value::Array(formats);
    run
}
fn para(id: &str, text: &str) -> Value {
    el("paragraph", id, if text.is_empty() { vec![] } else { vec![run(text, vec![])] })
}
fn document(id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn source(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":SCHEMA,"version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn inline_runs() -> Vec<Value> {
    let mention = json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann"}});
    let language =
        json!({"type":"breditor/text-language","properties":{"breditor/language-tag":"fr-CA"}});
    let link = json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":"#intro","breditor-inline/new-window":false}});
    vec![
        run("Hi ", vec![]),
        run("@Ann", vec![mention]),
        run(" see ", vec![]),
        run("intro", vec![link]),
        run(" ", vec![]),
        run("bonjour", vec![language]),
    ]
}
/// The neutral root `@breditor/interchange` builds for HTML using all eight V4 slices
/// (adapter identities are `external-N`; they are never paste allocations).
fn adapter_root() -> Value {
    let mut heading = el("heading", "external-1", vec![run("Introduction", vec![])]);
    heading["properties"]["breditor/level"] = json!(2);
    heading["properties"]["breditor/bookmark"] = json!("intro");
    let item = |n: u32, text: &str| {
        el("list-item", &format!("external-{n}"), vec![para(&format!("external-{}", n + 1), text)])
    };
    let mut list = el("ordered-list", "external-3", vec![item(4, "one"), item(6, "two")]);
    list["properties"]["breditor/start"] = json!(4);
    list["properties"]["breditor/list-style"] = json!(4);
    list["properties"]["breditor/list-reversed"] = json!(true);
    let mut image = el("image", "external-8", vec![]);
    image["properties"] = json!({"breditor/block-id":"external-8","breditor/image-id":"external-9","breditor/asset-id":"asset","breditor/asset-generation":"g","breditor/decorative":false,"breditor/alt-text":"Chart","breditor/image-href":"https://example.com/x"});
    let mut details = el(
        "details",
        "external-10",
        vec![
            el("details-summary", "external-11", vec![run("More", vec![])]),
            para("external-12", "Body"),
        ],
    );
    details["properties"]["breditor/details-open"] = json!(true);
    let mut cell = el("table-cell", "external-13", vec![para("external-14", "x")]);
    cell["properties"]["breditor/column-id"] = json!("external-15");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = el("table-row", "external-16", vec![cell]);
    row["properties"]["breditor/row-id"] = json!("external-17");
    let mut table = el("table", "external-18", vec![row, para("external-19", "Totals")]);
    table["properties"] = json!({"breditor/block-id":"external-18","breditor/table-id":"external-20","breditor/columns":[{"id":"external-15","width":120}],"breditor/merges":[],"breditor/retracted-merges":[]});
    document(
        "breditor-clipboard",
        vec![
            heading,
            el("paragraph", "external-2", inline_runs()),
            list,
            image,
            details,
            el("page-break", "external-21", vec![]),
            table,
        ],
    )
}
fn schema_v4() -> Result<CompiledSchema> {
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(CompiledSchema::try_compile_rich_content_profile_v4(
        SchemaId::new(QualifiedName::try_new(SCHEMA)?, SchemaVersion::try_new(1)?),
        &extensions,
    )?)
}
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v4(&config(4))?;
    let root = document("room", vec![para("first", "First"), para("tail", "Tail")]);
    let a = p.create(&source(&p, &root), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn children(a: &RichReplica) -> Result<Vec<Value>> {
    let doc: Value = serde_json::from_str(a.document_json())?;
    Ok(doc["root"]["children"].as_array().ok_or("children")?.clone())
}
const IDS: [&str; 7] = [
    "breditor/asset-generation",
    "breditor/block-id",
    "breditor/image-id",
    "breditor/table-id",
    "breditor/row-id",
    "breditor/column-id",
    "breditor/bookmark",
];
/// Content without identities (paste rekeys block ids and asset generations) and without the
/// document-unique anchor, which paste never carries.
fn content(node: &Value, ids: &mut Vec<String>) -> Value {
    let mut node = node.clone();
    if let Some(properties) = node.get_mut("properties").and_then(Value::as_object_mut) {
        for key in IDS {
            // A cell's column id repeats its table's column declaration (collected below).
            if let Some(Value::String(id)) = properties.remove(key)
                && key != "breditor/column-id"
            {
                ids.push(id);
            }
        }
        if let Some(Value::Array(columns)) = properties.get_mut("breditor/columns") {
            for column in columns {
                if let Some(Value::String(id)) = column.as_object_mut().and_then(|c| c.remove("id"))
                {
                    ids.push(id);
                }
            }
        }
    }
    if let Some(Value::Array(list)) = node.get_mut("children") {
        let mapped: Vec<Value> = list.iter().map(|child| content(child, ids)).collect();
        *list = mapped;
    }
    node
}

#[test]
fn every_v4_slice_is_admitted_exactly_like_the_local_v4_context() -> Result {
    let (p, a, _) = setup()?;
    let local = RichClipboardJsonCodec::new(EditorContext::new(schema_v4()?, p.limits().clone()));
    assert_eq!(p.schema().fingerprint(), schema_v4()?.fingerprint());
    let root = adapter_root().to_string();
    let expected = local.encode_transfer(&local.admit_root(RichClipboardKind::Flow, &root)?)?;
    let shared = a.admit_clipboard_root(RichClipboardKind::Flow, &root)?;
    assert_eq!(shared, expected);
    let transfer: Value = serde_json::from_str(&shared)?;
    let structured = transfer["structuredJson"].as_str().ok_or("structured")?;
    assert_eq!(
        a.validate_clipboard(structured)?,
        local.encode_transfer(&local.decode(structured)?)?
    );
    // The inline slices alone form a text transfer, also identical.
    let inline = document("breditor-clipboard", vec![el("paragraph", "external-1", inline_runs())])
        .to_string();
    assert_eq!(
        a.admit_clipboard_root(RichClipboardKind::Text, &inline)?,
        local.encode_transfer(&local.admit_root(RichClipboardKind::Text, &inline)?)?
    );
    // A V3 shared owner keeps refusing every V4 feature, as a V3 local context does.
    let v3 = SharedRichProfile::from_standard_configuration_json_v3(&config(3))?;
    let old = v3.create(&source(&v3, &document("room", vec![para("only", "x")])), "303".into())?;
    assert!(old.admit_clipboard_root(RichClipboardKind::Flow, &root).is_err());
    assert!(old.admit_clipboard_root(RichClipboardKind::Text, &inline).is_err());
    assert!(old.validate_clipboard(structured).is_err());
    Ok(())
}

#[test]
fn an_imported_v4_flow_pastes_as_one_native_shared_step_and_converges_without_repair() -> Result {
    let (p, mut a, mut b) = setup()?;
    let transfer: Value = serde_json::from_str(
        &a.admit_clipboard_root(RichClipboardKind::Flow, &adapter_root().to_string())?,
    )?;
    let structured = transfer["structuredJson"].as_str().ok_or("structured")?;
    let before = (a.document_json().to_owned(), a.undo_count());
    a.set_selection(Some(&Selection::Node { block: "first".into() }))?;
    assert!(a.paste_clipboard_guarded(
        &a.observe()?,
        structured,
        PasteTarget::Flow { parent: None, before: Some("tail".into()) },
        &mut ClipboardNamespace::try_new("import")?,
    )?);
    assert_eq!(a.undo_count(), before.1 + 1);
    let root = children(&a)?;
    assert_eq!(root.len(), 9);
    let pasted = &root[1..8];
    // Fresh identities: no adapter identity survives, and none repeats.
    let mut ids = Vec::new();
    let pasted_content: Vec<Value> = pasted.iter().map(|n| content(n, &mut ids)).collect();
    assert!(ids.iter().all(|id| !id.starts_with("external-")));
    let mut unique = ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), ids.len());
    // No merge repair: the projected content is the admitted content (minus the anchor, which
    // paste never carries locally either), every V4 property included.
    let mut ignored = Vec::new();
    let admitted: Vec<Value> = adapter_root()["children"]
        .as_array()
        .ok_or("admitted")?
        .iter()
        .map(|n| content(n, &mut ignored))
        .collect();
    assert_eq!(pasted_content, admitted);
    assert!(pasted.iter().all(|n| n["properties"].get("breditor/bookmark").is_none()));
    // Converges on the peer and stays one Undo step there for the writer only.
    let peer_undo = b.undo_count();
    let frame = a.update_frame()?;
    b.receive_frame(&frame)?;
    assert_eq!(b.document_json(), a.document_json());
    assert_eq!(b.undo_count(), peer_undo);
    // One Undo removes the whole import on both writers; Redo restores it exactly.
    let after = a.document_json().to_owned();
    assert!(a.undo()?);
    assert_eq!(a.document_json(), before.0);
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(b.document_json(), before.0);
    assert!(a.redo()?);
    assert_eq!(a.document_json(), after);
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(b.document_json(), after);
    // Exact restart of the importing writer.
    let restored = p.restore("room", &a.checkpoint()?)?;
    assert_eq!(restored.document_json(), a.document_json());
    Ok(())
}

#[test]
fn an_imported_inline_transfer_pastes_mentions_language_and_internal_links_at_a_caret() -> Result {
    let (_, mut a, mut b) = setup()?;
    let inline = document("breditor-clipboard", vec![el("paragraph", "external-1", inline_runs())]);
    let transfer: Value = serde_json::from_str(
        &a.admit_clipboard_root(RichClipboardKind::Text, &inline.to_string())?,
    )?;
    let point = TextPoint { block: "first".into(), offset: 5, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    let depth = a.undo_count();
    assert!(a.paste_clipboard_guarded(
        &a.observe()?,
        transfer["structuredJson"].as_str().ok_or("structured")?,
        PasteTarget::Text,
        &mut ClipboardNamespace::try_new("inline")?,
    )?);
    assert_eq!(a.undo_count(), depth + 1);
    let first = children(&a)?[0].clone();
    let mut expected = inline_runs();
    expected[0] = run("FirstHi ", vec![]);
    assert_eq!(first["children"], Value::Array(expected));
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(b.document_json(), a.document_json());
    Ok(())
}
