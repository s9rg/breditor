//! Native counterpart of the reduced browser getter fixture; no JS/optional ABI.
#![cfg(all(not(target_arch = "wasm32"), feature = "experimental-nested-lists"))]

use breditor_wasm::BreditorCompiledProfile;
use serde_json::{Value, json};
use std::{error::Error, io};

fn element(kind: &str, children: Vec<Value>, properties: Value) -> Value {
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,
        "properties":properties,"children":children})
}
fn paragraph(value: String, heading: bool) -> Value {
    element(
        if heading { "heading" } else { "paragraph" },
        vec![json!({"kind":"text","text":value,"formats":[]})],
        if heading { json!({"breditor/level":2}) } else { json!({}) },
    )
}
fn tree(items: usize) -> Value {
    let children = (0..items)
        .map(|index| {
            let mut content = vec![paragraph(format!("Item {index}: A🙂"), index % 10 == 0)];
            if index % 10 == 0 {
                let ordered = element(
                    "ordered-list",
                    vec![element(
                        "list-item",
                        vec![paragraph(format!("Grandchild {index}"), false)],
                        json!({}),
                    )],
                    json!({"breditor/start":4}),
                );
                content.push(element(
                    "bullet-list",
                    vec![element(
                        "list-item",
                        vec![paragraph(format!("Child {index}"), false), ordered],
                        json!({}),
                    )],
                    json!({}),
                ));
            }
            element("list-item", content, json!({}))
        })
        .collect();
    element(
        "document",
        vec![element("ordered-list", children, json!({"breditor/start":7}))],
        json!({}),
    )
}
fn flatten<'a>(node: &'a Value, rows: &mut Vec<(&'a Value, Vec<u32>)>) -> u32 {
    let index = u32::try_from(rows.len()).expect("small test tree");
    rows.push((node, vec![]));
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            let child_index = flatten(child, rows);
            rows[index as usize].1.push(child_index);
        }
    }
    index
}

#[test]
fn nested_child_counts_and_edges_remain_exact_after_engine_drop() -> Result<(), Box<dyn Error>> {
    let schema = json!({"name":"example/getter-probe","version":1});
    let mut factory = BreditorCompiledProfile::from_bootstrap_json_v5(
        &json!({
            "format":"breditor/profile-bootstrap","formatVersion":5,"schema":schema,"extensions":[]
        })
        .to_string(),
    );
    let profile = factory.take_profile().ok_or_else(|| io::Error::other("profile missing"))?;
    let fingerprint = profile.descriptor().schema_fingerprint();
    for items in [10, 100, 500] {
        let root = tree(items);
        let mut expected = vec![];
        flatten(&root, &mut expected);
        let document = json!({"format":"breditor/document","formatVersion":2,
            "schema":schema,"schemaFingerprint":fingerprint,"root":root})
        .to_string();
        for owner in 0..30 {
            let projection = {
                let mut factory = profile.create_engine_from_document_json_v7(
                    &format!("native-{items}-{owner}"),
                    &document,
                    20.0,
                );
                let engine =
                    factory.take_engine().ok_or_else(|| io::Error::other("engine missing"))?;
                let mut result = engine.projection(&engine.observation());
                result.take_projection().ok_or_else(|| io::Error::other("projection missing"))?
            };
            assert_eq!(projection.node_count() as usize, expected.len());
            for reverse in [false, true] {
                for ordinal in 0..expected.len() {
                    let index = if reverse { expected.len() - ordinal - 1 } else { ordinal };
                    let (node, children) = &expected[index];
                    let index = u32::try_from(index)?;
                    let element = node["kind"] == "element";
                    assert_eq!(projection.node_kind(index).as_deref(), node["kind"].as_str());
                    assert_eq!(projection.element_type(index).as_deref(), node["type"].as_str());
                    assert_eq!(
                        projection.child_count(index),
                        element.then_some(u32::try_from(children.len())?)
                    );
                    for (ordinal, child) in children.iter().enumerate() {
                        assert!(*child > index);
                        assert_eq!(
                            projection.child_at(index, u32::try_from(ordinal)?),
                            Some(*child)
                        );
                    }
                    assert_eq!(projection.child_at(index, u32::try_from(children.len())?), None);
                }
            }
            assert_eq!(projection.child_count(u32::MAX), None);
        }
    }
    Ok(())
}
