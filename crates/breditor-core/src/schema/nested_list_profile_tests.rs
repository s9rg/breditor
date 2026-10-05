//! Nested admission is deliberately isolated from flat editing capabilities.
use crate::{
    codec::DocumentJsonCodecV2,
    document::{Document, ElementNode, NodeRef, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn std::error::Error>> {
    Ok(NodeRef::element(ElementNode::try_new(
        QualifiedName::try_new(kind)?,
        None,
        PropertyMap::default(),
        children,
    )?))
}
fn schema(nested: bool) -> Result<CompiledSchema, Box<dyn std::error::Error>> {
    let id =
        SchemaId::new(QualifiedName::try_new("example/nested-list-test")?, SchemaVersion::one());
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    Ok(if nested {
        CompiledSchema::try_compile_nested_list_profile(id, &extensions)?
    } else {
        CompiledSchema::try_compile_flat_list_profile(id, &extensions)?
    })
}
fn tree(depth: usize) -> Result<NodeRef, Box<dyn std::error::Error>> {
    let mut children = vec![element("breditor/paragraph", vec![])?];
    if depth > 1 {
        children.push(tree(depth - 1)?);
    }
    element("breditor/bullet-list", vec![element("breditor/list-item", children)?])
}

#[test]
fn nested_list_admission_roundtrips_but_does_not_grant_flat_operations() -> TestResult {
    let nested = schema(true)?;
    let flat = schema(false)?;
    assert_ne!(nested.fingerprint(), flat.fingerprint());
    assert!(!nested.supports_flat_list_operations());
    assert!(!nested.supports_base_text_operations());
    assert!(!nested.supports_text_splice_operations());
    assert!(!nested.supports_paragraph_structure_operations());
    assert!(!nested.supports_text_block_kind_operations());
    let root = element("breditor/document", vec![tree(4)?])?;
    assert!(flat.validate_root(&root, &DocumentLimits::default()).is_err());
    let document = Document::try_new(&nested, root, &DocumentLimits::default())?;
    let codec = DocumentJsonCodecV2::new(nested);
    let json = codec.encode(&document)?;
    assert_eq!(codec.encode(&codec.decode(&json)?)?, json);
    assert!(DocumentJsonCodecV2::new(flat).decode(&json).is_err());
    Ok(())
}

#[test]
fn nested_list_grammar_rejects_missing_leading_block_and_interleaved_blocks() -> TestResult {
    let schema = schema(true)?;
    let paragraph = element("breditor/paragraph", vec![])?;
    for children in [
        vec![],
        vec![tree(1)?],
        vec![paragraph.clone(), paragraph.clone()],
        vec![paragraph.clone(), tree(1)?, paragraph.clone()],
    ] {
        let root = element(
            "breditor/document",
            vec![element("breditor/bullet-list", vec![element("breditor/list-item", children)?])?],
        )?;
        assert!(schema.validate_root(&root, &DocumentLimits::default()).is_err());
    }
    let root = element(
        "breditor/document",
        vec![element(
            "breditor/bullet-list",
            vec![element("breditor/list-item", vec![paragraph, tree(1)?, tree(2)?])?],
        )?],
    )?;
    schema.validate_root(&root, &DocumentLimits::default())?;
    assert!(
        schema.validate_root(&root, &DocumentLimits::default().with_max_node_depth(3)).is_err()
    );
    assert!(schema.validate_root(&root, &DocumentLimits::default().with_max_nodes(4)).is_err());
    Ok(())
}
