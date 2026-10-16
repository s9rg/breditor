//! General copy keeps partial table shape but never borrows unselected source text.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichDocument, RichSelection, RichSelectionCoverage,
        RichSelectionKind, RichTextPoint, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(root: &Value) -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/general-copy")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let c = EditorContext::new(schema, DocumentLimits::default());
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/general-copy","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":root}).to_string();
    let d = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input)?,
        c.limits(),
    )?;
    Ok((c, d))
}
fn selection(
    document: &RichDocument,
    anchor: &str,
    start: u64,
    focus: &str,
    end: u64,
) -> Result<RichSelection> {
    let p = |id: &str, n| -> Result<_> {
        Ok(RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(n)?, Affinity::After))
    };
    Ok(RichSelection::try_new(
        document,
        RichSelectionKind::TextRange { anchor: p(anchor, start)?, focus: p(focus, end)? },
    )?)
}
fn encoded(c: &EditorContext, f: &RichClipboardFragment) -> Result<Value> {
    Ok(serde_json::from_str(&RichClipboardJsonCodec::new(c.clone()).encode(f)?)?)
}
fn texts(root: &Value) -> Result<BTreeMap<String, String>> {
    let mut out = BTreeMap::new();
    let mut todo = vec![root];
    while let Some(n) = todo.pop() {
        if ["breditor/paragraph", "breditor/heading", "breditor/code-block"]
            .contains(&n["type"].as_str().unwrap_or(""))
        {
            let value = n["children"]
                .as_array()
                .ok_or("text children")?
                .iter()
                .map(|t| t["text"].as_str().ok_or("text run"))
                .collect::<std::result::Result<String, _>>()?;
            assert!(
                out.insert(
                    n["properties"]["breditor/block-id"]
                        .as_str()
                        .ok_or("block identity")?
                        .to_owned(),
                    value
                )
                .is_none()
            );
        } else if let Some(children) = n["children"].as_array() {
            todo.extend(children);
        }
    }
    Ok(out)
}
fn copy(
    context: &EditorContext,
    document: &RichDocument,
    anchor: &str,
    start: u64,
    focus: &str,
    end: u64,
) -> Result<Value> {
    encoded(
        context,
        &RichClipboardFragment::copy_general_selection(
            context,
            document,
            &selection(document, anchor, start, focus, end)?,
        )?
        .ok_or("copy absent")?,
    )
}
#[test]
fn exhaustive_cross_block_corpus_is_direction_independent_and_has_exact_selected_text() -> Result {
    let (c, d) = setup(&fixture::root())?;
    let source: Value =
        serde_json::from_str(&DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?)?;
    let source_text = texts(&source["root"])?;
    let whole = RichSelectionCoverage::document(&d)?;
    let blocks: Vec<_> = whole.text().iter().map(|s| (s.block().as_str(), s.end().get())).collect();
    let codec = RichClipboardJsonCodec::new(c.clone());
    let mut captures = 0;
    for (i, (a, alen)) in blocks.iter().enumerate() {
        for (b, blen) in &blocks[i + 1..] {
            for (x, y) in [(0, *blen), (*alen, 0), (1.min(*alen), 1.min(*blen))] {
                let proof = selection(&d, a, x, b, y)?;
                let coverage = RichSelectionCoverage::capture(&d, &proof)?;
                let clip = RichClipboardFragment::copy_general_selection(&c, &d, &proof)?
                    .ok_or("absent")?;
                let bytes = codec.encode(&clip)?;
                let backward = RichClipboardFragment::copy_general_selection(
                    &c,
                    &d,
                    &selection(&d, b, y, a, x)?,
                )?
                .ok_or("backward absent")?;
                assert_eq!(bytes, codec.encode(&backward)?, "direction {a}:{x} {b}:{y}");
                assert_eq!(bytes, codec.encode(&codec.decode(&bytes)?)?);
                let value: Value = serde_json::from_str(&bytes)?;
                let copied = texts(&value["document"]["root"])?;
                let expected: BTreeMap<_, _> = coverage
                    .text()
                    .iter()
                    .map(|s| -> Result<_> {
                        let raw = &source_text[s.block().as_str()];
                        let units: Vec<_> = raw.encode_utf16().collect();
                        Ok((
                            s.block().as_str().to_owned(),
                            String::from_utf16(
                                &units[usize::try_from(s.start().get())?
                                    ..usize::try_from(s.end().get())?],
                            )?,
                        ))
                    })
                    .collect::<Result<_>>()?;
                for (id, text) in &copied {
                    assert_eq!(
                        text,
                        expected.get(id).unwrap_or(&String::new()),
                        "leak {a}:{x} {b}:{y} {id}"
                    );
                }
                assert_eq!(
                    copied.values().map(|s| s.encode_utf16().count() as u64).sum::<u64>(),
                    coverage.selected_utf16(),
                    "lost text {a}:{x} {b}:{y}"
                );
                if let Ok(old) = RichClipboardFragment::copy_selection(&c, &d, &proof) {
                    assert_eq!(
                        bytes,
                        codec.encode(&old.ok_or("original absent")?)?,
                        "original compatibility"
                    );
                }
                captures += 2;
            }
        }
    }
    assert!(captures >= 1000);
    Ok(())
}
#[test]
fn partial_table_retains_axes_headers_merges_and_neutral_empty_unselected_bodies() -> Result {
    let (c, d) = setup(&fixture::root())?;
    let value = copy(&c, &d, "p-0-0", 1, "p-1-1", 3)?;
    let table = &value["document"]["root"]["children"][0];
    assert_eq!(table["type"], "breditor/table");
    assert_eq!(
        table["properties"]["breditor/columns"],
        fixture::root()["children"][2]["properties"]["breditor/columns"]
    );
    let rows = table["children"].as_array().ok_or("rows")?;
    assert_eq!(rows.len(), 3);
    for (r, row) in rows.iter().enumerate() {
        assert_eq!(row["children"].as_array().ok_or("cells")?.len(), 4);
        for cell in row["children"].as_array().ok_or("cells")? {
            assert_eq!(cell["properties"]["breditor/header"], r == 0);
            assert!(!cell["children"].as_array().ok_or("body")?.is_empty());
        }
    }
    assert_eq!(table["properties"]["breditor/merges"].as_array().ok_or("merges")?.len(), 1);
    let outside = &rows[2]["children"][1]["children"];
    assert_eq!(outside.as_array().ok_or("outside")?.len(), 1);
    assert_eq!(outside[0]["children"], json!([]));
    assert_eq!(outside[0]["properties"].as_object().ok_or("props")?.len(), 1);
    assert!(!value.to_string().contains("asset-generation"));
    assert!(!value.to_string().contains("Diagram"));
    Ok(())
}
#[test]
fn partial_caption_is_text_only_but_fully_enclosed_image_keeps_asset_and_alt() -> Result {
    let (c, d) = setup(&fixture::root())?;
    let partial = copy(&c, &d, "caption", 1, "q1", 2)?;
    let text = partial.to_string();
    assert!(!text.contains("asset-generation"));
    assert!(!text.contains("Diagram"));
    assert_eq!(texts(&partial["document"]["root"])?["caption"], "y🙂");
    let whole = copy(&c, &d, "p-2-1", 1, "q1", 2)?;
    assert!(whole.to_string().contains("asset-generation"));
    assert!(whole.to_string().contains("Diagram"));
    Ok(())
}
#[test]
fn partial_ordered_list_retains_selected_item_ordinal_without_borrowing_earlier_items() -> Result {
    let mut root = fixture::root();
    let list = &mut root["children"][4];
    list["type"] = json!("breditor/ordered-list");
    list["properties"]["breditor/start"] = json!(5);
    list["children"].as_array_mut().ok_or("items")?.push(fixture::element(
        "list-item",
        "second-item",
        vec![fixture::paragraph("second-head", "Second")],
    ));
    let (c, d) = setup(&root)?;
    let value = copy(&c, &d, "second-head", 1, "code", 1)?;
    let list = &value["document"]["root"]["children"][0];
    assert_eq!(list["type"], "breditor/ordered-list");
    assert_eq!(list["properties"]["breditor/start"], 6);
    assert_eq!(list["children"].as_array().ok_or("copied items")?.len(), 1);
    let copied = texts(&value["document"]["root"])?;
    assert_eq!(copied["second-head"], "econd");
    assert!(!copied.contains_key("head"));
    assert!(!copied.contains_key("nested-text"));
    Ok(())
}
#[test]
fn synthetic_cell_floor_skips_source_ids_and_original_caret_node_grid_contracts_remain() -> Result {
    let mut root = fixture::root();
    root["children"][3]["children"][1]["properties"]["breditor/block-id"] =
        json!("clipboard:general-floor:0");
    let (c, d) = setup(&root)?;
    let v = copy(&c, &d, "p-0-0", 1, "p-1-1", 3)?;
    assert!(!texts(&v["document"]["root"])?.contains_key("clipboard:general-floor:0"));
    for s in [
        selection(&d, "q1", 2, "q1", 2)?,
        RichSelection::try_new(&d, RichSelectionKind::Node(BlockId::try_new("image")?))?,
    ] {
        let old = RichClipboardFragment::copy_selection(&c, &d, &s)?;
        let new = RichClipboardFragment::copy_general_selection(&c, &d, &s)?;
        assert_eq!(
            old.as_ref().map(|f| encoded(&c, f)).transpose()?,
            new.as_ref().map(|f| encoded(&c, f)).transpose()?
        );
    }
    Ok(())
}
