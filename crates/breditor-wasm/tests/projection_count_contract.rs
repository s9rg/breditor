//! Native counterpart of the fixed-projection browser reduction. Checks the
//! retained snapshot's data independently of JS numeric comparisons and ABI.
#![cfg(not(target_arch = "wasm32"))]

use std::{error::Error, io};

use breditor_wasm::BreditorEngine;
use serde_json::{Value, json};

fn text(value: &str, strong: bool) -> Value {
    json!({ "kind": "text", "text": value,
        "formats": if strong { vec![json!({ "type": "breditor/strong", "properties": {} })] } else { vec![] } })
}

fn paragraph(children: &[Value]) -> Value {
    json!({ "kind": "element", "type": "breditor/paragraph", "entityId": null,
        "properties": {}, "children": children })
}

#[test]
fn retained_projection_counts_remain_exact_after_engine_drop() -> Result<(), Box<dyn Error>> {
    let document = json!({ "format": "breditor/document", "formatVersion": 1,
        "schema": { "name": "breditor/base", "version": 1 },
        "root": { "kind": "element", "type": "breditor/document", "entityId": null,
            "properties": {}, "children": [
                paragraph(&[text("Left", true), text("🙂", false)]), paragraph(&[]),
                paragraph(&[text("Right", true), text(" e\u{301} & <tag>", false)]),
                paragraph(&[text("尾", false)])] } });
    let projection = {
        let mut factory =
            BreditorEngine::from_document_json("native-count", &document.to_string(), 8.0);
        let engine = factory.take_engine().ok_or_else(|| io::Error::other("engine missing"))?;
        let observation = engine.observation();
        let mut read = engine.projection(&observation);
        read.take_projection().ok_or_else(|| io::Error::other("projection missing"))?
    };
    let expected =
        [None, None, Some(1), Some(0), None, None, Some(1), Some(0), None, Some(0), None];
    for _ in 0..10_000 {
        for (index, count) in expected.into_iter().enumerate() {
            assert_eq!(projection.format_count(u32::try_from(index)?), count);
        }
    }
    assert_eq!(projection.text(3).as_deref(), Some("🙂"));
    assert_eq!(projection.text(9).as_deref(), Some("尾"));
    assert_eq!(projection.format_count(u32::MAX), None);
    Ok(())
}
