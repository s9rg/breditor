//! Nested admission is deliberately isolated from flat editing capabilities.
use crate::{
    codec::DocumentJsonCodecV2,
    document::{Document, ElementNode, NodeRef, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};
type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn nested_list_selection_resolves_siblings_without_flattening_scope() -> TestResult {
    use crate::{
        block::{NestedListItemRange, NestedListSelectionError},
        document::{FormatSet, TextNode},
        position::{Affinity, NodePath, Point},
        selection::RangeSelection,
    };
    let schema = schema(true)?;
    let block = element(
        "breditor/paragraph",
        vec![NodeRef::text(TextNode::try_new("a🙂b".to_owned(), FormatSet::default())?)],
    )?;
    let item = element("breditor/list-item", vec![block.clone()])?;
    let nested = element(
        "breditor/bullet-list",
        vec![
            item.clone(),
            item.clone(),
            element("breditor/list-item", vec![element("breditor/paragraph", vec![])?])?,
        ],
    )?;
    let parent = element("breditor/list-item", vec![block, nested])?;
    let root =
        element("breditor/document", vec![element("breditor/bullet-list", vec![parent, item])?])?;
    let document = Document::try_new(&schema, root, &DocumentLimits::default())?;
    let point = |item, offset| -> Result<Point, Box<dyn std::error::Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0, 1, item, 0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::After,
        })
    };
    for (start, end, expected) in [(1, 0, 0..1), (1, 3, 0..2)] {
        let a = point(0, start)?;
        let b = point(1, end)?;
        for range in [RangeSelection::new(a.clone(), b.clone()), RangeSelection::new(b, a)] {
            let run = NestedListItemRange::resolve(&schema, &document, &range)?;
            assert_eq!(run.list_path().to_vec(), vec![0, 0, 1]);
            assert_eq!(run.items(), expected);
        }
    }
    let empty = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0, 0, 1, 2, 0])?,
        child_index: 0,
        affinity: Affinity::Before,
    };
    assert_eq!(
        NestedListItemRange::resolve(
            &schema,
            &document,
            &RangeSelection::new(empty.clone(), empty)
        )?
        .items(),
        2..3
    );
    let parent_point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    assert_eq!(
        NestedListItemRange::resolve(
            &schema,
            &document,
            &RangeSelection::new(parent_point, point(1, 3)?)
        ),
        Err(NestedListSelectionError::DifferentLists)
    );
    let invalid = point(0, 2)?; // Inside the emoji's surrogate pair.
    assert_eq!(
        NestedListItemRange::resolve(
            &schema,
            &document,
            &RangeSelection::new(invalid.clone(), invalid)
        ),
        Err(NestedListSelectionError::InvalidSelection)
    );
    Ok(())
}

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
