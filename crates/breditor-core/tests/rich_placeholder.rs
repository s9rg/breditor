//! Document-level prompt eligibility never substitutes word counts for structure.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{RichDocument, is_rich_placeholder_empty},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};
use proptest::prelude::*;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn admit(version: u8, children: Vec<Value>) -> Result<RichDocument> {
    let id =
        SchemaId::new(QualifiedName::try_new("example/placeholder")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = match version {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        _ => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
    };
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/placeholder","version":1},"schemaFingerprint":schema.fingerprint().to_string(),"root":root});
    let document = DocumentJsonCodecV2::new(schema.clone()).decode(&input.to_string())?;
    Ok(RichDocument::try_admit(&schema, document, &DocumentLimits::default())?)
}

#[test]
fn only_one_empty_root_prose_block_qualifies_and_whitespace_is_retained() -> Result {
    for version in 1..=3 {
        for kind in ["paragraph", "heading"] {
            for text in ["", " ", "\n", "\t", "\u{a0}", "\u{200b}", "🙂", "\0"] {
                let mut block = fixture::paragraph("body", text);
                block["type"] = json!(format!("breditor/{kind}"));
                if kind == "heading" {
                    block["properties"]["breditor/level"] = json!(6);
                }
                if version == 3 {
                    block["properties"]["breditor/block-direction"] = json!(2);
                }
                let document = admit(version, vec![block])?;
                for _ in 0..3 {
                    assert_eq!(is_rich_placeholder_empty(&document), text.is_empty());
                }
            }
        }
        assert!(!is_rich_placeholder_empty(&admit(
            version,
            vec![fixture::paragraph("a", ""), fixture::paragraph("b", ""),]
        )?));
    }
    Ok(())
}

#[test]
fn empty_structures_atoms_and_hidden_tables_are_content_not_a_discard_signal() -> Result {
    fn erase_text(node: &mut Value) {
        if matches!(node["type"].as_str(), Some("breditor/paragraph" | "breditor/code-block")) {
            node["children"] = json!([]);
        } else if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            for child in children {
                erase_text(child);
            }
        }
    }
    let mut input = fixture::root();
    erase_text(&mut input);
    let children = input["children"].as_array().ok_or("fixture children")?;
    for index in [0, 2, 3, 4, 5, 7, 9] {
        assert!(!is_rich_placeholder_empty(&admit(3, vec![children[index].clone()])?));
    }
    let mut image = fixture::element("image", "image", vec![fixture::paragraph("caption", "")]);
    image["properties"] = json!({"breditor/block-id":"image","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Retained image"});
    assert!(!is_rich_placeholder_empty(&admit(3, vec![image])?));
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]
    #[test]
    fn every_nonempty_unicode_run_suppresses_the_prompt(chars in prop::collection::vec(any::<char>(), 1..40)) {
        let text: String = chars.into_iter().collect();
        let document = admit(3, vec![fixture::paragraph("body", &text)]).map_err(|e| TestCaseError::fail(e.to_string()))?;
        prop_assert!(!is_rich_placeholder_empty(&document));
    }
}
