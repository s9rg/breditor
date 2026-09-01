//! Black-box conformance tests for immutable document invariants.

mod support;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{Document, NodeKind},
    identity::QualifiedName,
    schema::ValidationCode,
};
use serde_json::json;
use support::{
    TestResult, assert_validation_issue, codec, document_json, document_with_root,
    fixture_document_json, minimal_document_json, paragraph, path, test_error, text_node,
};

fn assert_send_sync<T: Send + Sync>() {}

#[test]
fn minimal_document_is_one_empty_paragraph() -> TestResult {
    assert_send_sync::<Document>();
    assert_send_sync::<DocumentJsonCodec>();

    let codec = codec();
    let document = codec.decode(&minimal_document_json())?;
    assert_eq!(document.schema(), codec.schema().id());
    assert_eq!(document.root().kind(), NodeKind::Element);

    let root = document
        .root()
        .as_element()
        .ok_or_else(|| test_error("validated document root was not an element"))?;
    assert_eq!(root.kind(), codec.schema().root_kind());
    assert!(root.entity_id().is_none());
    assert!(root.properties().is_empty());
    assert_eq!(root.children().len(), 1);

    let paragraph = root
        .children()
        .get(0)
        .and_then(|node| node.as_element())
        .ok_or_else(|| test_error("minimal document child was not a paragraph"))?;
    assert_eq!(paragraph.kind().as_str(), "breditor/paragraph");
    assert!(paragraph.entity_id().is_none());
    assert!(paragraph.properties().is_empty());
    assert!(paragraph.children().is_empty());
    Ok(())
}

#[test]
fn decoded_nodes_expose_only_canonical_content() -> TestResult {
    let codec = codec();
    let document = codec.decode(&fixture_document_json())?;
    let regular = document
        .node_at(&path(&[0, 0])?)?
        .as_text()
        .ok_or_else(|| test_error("first paragraph child was not text"))?;
    assert_eq!(regular.text(), "a😀b");
    assert_eq!(regular.utf16_len(), 4);
    assert!(regular.formats().is_empty());

    let strong = document
        .node_at(&path(&[0, 1])?)?
        .as_text()
        .ok_or_else(|| test_error("second paragraph child was not text"))?;
    assert_eq!(strong.text(), "x");
    assert_eq!(strong.formats().len(), 1);
    let strong_name = QualifiedName::try_new("breditor/strong")?;
    let format = strong
        .formats()
        .get(&strong_name)
        .ok_or_else(|| test_error("strong format was not indexed by its qualified name"))?;
    assert_eq!(format.kind(), &strong_name);
    assert!(format.properties().is_empty());

    let cloned = document.clone();
    assert_eq!(cloned, document);
    assert_eq!(codec.encode(&cloned)?, codec.encode(&document)?);
    Ok(())
}

#[test]
fn unicode_is_not_normalized_by_the_document_boundary() -> TestResult {
    let composed_json = document_json(&[paragraph(&[text_node("é", false)])]);
    let decomposed_json = document_json(&[paragraph(&[text_node("e\u{301}", false)])]);
    let codec = codec();
    let composed = codec.decode(&composed_json)?;
    let decomposed = codec.decode(&decomposed_json)?;

    assert_ne!(composed, decomposed);
    assert_eq!(
        composed
            .node_at(&path(&[0, 0])?)?
            .as_text()
            .ok_or_else(|| test_error("composed fixture did not contain text"))?
            .text(),
        "é"
    );
    assert_eq!(
        decomposed
            .node_at(&path(&[0, 0])?)?
            .as_text()
            .ok_or_else(|| test_error("decomposed fixture did not contain text"))?
            .text(),
        "e\u{301}"
    );
    Ok(())
}

#[test]
fn invalid_tree_shapes_never_publish_a_document() -> TestResult {
    assert_validation_issue(&document_json(&[]), ValidationCode::MissingRequiredChild, &[])?;
    assert_validation_issue(
        &document_with_root(&text_node("root text", false)),
        ValidationCode::InvalidRoot,
        &[],
    )?;
    assert_validation_issue(
        &document_json(&[text_node("direct text", false)]),
        ValidationCode::InvalidChild,
        &[],
    )?;
    assert_validation_issue(
        &document_json(&[paragraph(&[paragraph(&[])])]),
        ValidationCode::InvalidChild,
        &[0],
    )?;
    assert_validation_issue(
        &document_json(&[paragraph(&[text_node("", false)])]),
        ValidationCode::EmptyText,
        &[0, 0],
    )?;
    assert_validation_issue(
        &document_json(&[paragraph(&[text_node("left", false), text_node("right", false)])]),
        ValidationCode::AdjacentEqualText,
        &[0],
    )?;
    Ok(())
}

#[test]
fn base_schema_rejects_properties_and_entity_identity() -> TestResult {
    let root_with_property = json!({
        "kind": "element",
        "type": "breditor/document",
        "entityId": null,
        "properties": { "breditor/value": 1 },
        "children": [paragraph(&[])],
    });
    assert_validation_issue(
        &document_with_root(&root_with_property),
        ValidationCode::PropertiesNotAllowed,
        &[],
    )?;

    let paragraph_with_identity = json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": "paragraph-1",
        "properties": {},
        "children": [],
    });
    assert_validation_issue(
        &document_json(&[paragraph_with_identity]),
        ValidationCode::EntityIdForbidden,
        &[0],
    )?;
    Ok(())
}
