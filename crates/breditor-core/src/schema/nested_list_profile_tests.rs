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
fn nested_list_reframe_inverse_and_point_mapping_are_exact_and_guarded() -> TestResult {
    use crate::{
        document::{FormatSet, TextNode},
        operation::{NestedListReframe, NestedListReframeError, PointRelocation},
        position::{Affinity, NodePath, Point},
        state::EditorContext,
    };
    let context = EditorContext::new(schema(true)?, DocumentLimits::default());
    let block = |text: &str| {
        element(
            "breditor/paragraph",
            vec![NodeRef::text(TextNode::try_new(text.to_owned(), FormatSet::default())?)],
        )
    };
    let a = block("first")?;
    let b = block("a🙂b")?;
    let c = block("tail")?;
    let item = |block| element("breditor/list-item", vec![block]);
    let source = element(
        "breditor/bullet-list",
        vec![item(a.clone())?, item(b.clone())?, item(c.clone())?],
    )?;
    let replacement = element(
        "breditor/bullet-list",
        vec![
            element(
                "breditor/list-item",
                vec![a, element("breditor/bullet-list", vec![item(b)?])?],
            )?,
            item(c)?,
        ],
    )?;
    let root = element("breditor/document", vec![source.clone()])?;
    let document = Document::try_new(context.schema(), root.clone(), context.limits())?;
    let operation = NestedListReframe::capture(&context, &document, 0, 1, vec![replacement])?;
    let edit = operation.apply(&context, &document)?.ok_or("missing edit")?;
    {
        use crate::{
            codec::{OperationJsonCodecV6, OperationJsonCodecV7},
            operation::Operation,
        };
        let codec = OperationJsonCodecV7::new(context.clone());
        let wrapped = Operation::NestedListReframe(operation.clone());
        let json = codec.encode(&wrapped)?;
        assert_eq!(codec.decode(&json)?, wrapped);
        assert_eq!(codec.encode(&codec.decode(&json)?)?, json);
        assert!(OperationJsonCodecV6::new(context.clone()).decode(&json).is_err());
        let inverse = Operation::NestedListReframe(edit.inverse().clone());
        assert_eq!(codec.decode(&codec.encode(&inverse)?)?, inverse);
        let value: serde_json::Value = serde_json::from_str(&json)?;
        for changed in [
            {
                let mut v = value.clone();
                v["formatVersion"] = 6.into();
                v
            },
            {
                let mut v = value.clone();
                v["unexpected"] = true.into();
                v
            },
            {
                let mut v = value.clone();
                v["schemaFingerprint"] =
                    "sha256:0000000000000000000000000000000000000000000000000000000000000000"
                        .into();
                v
            },
            {
                let mut v = value.clone();
                v["operation"]["start"] = (-1).into();
                v
            },
            {
                let mut v = value.clone();
                v["operation"]["unexpected"] = true.into();
                v
            },
            {
                let mut v = value.clone();
                v["operation"]["replacement"]["children"] = serde_json::json!([]);
                v
            },
        ] {
            assert!(codec.decode(&serde_json::to_string(&changed)?).is_err());
        }
        let duplicate = json.replace("\"start\":0", "\"start\":0,\"start\":0");
        assert_ne!(duplicate, json);
        assert!(codec.decode(&duplicate).is_err());
    }
    assert!(
        crate::codec::OperationJsonCodecV6::new(context.clone())
            .encode(&crate::operation::Operation::NestedListReframe(operation.clone()))
            .is_err()
    );
    {
        use crate::{
            operation::Operation,
            selection::{RangeSelection, Selection},
            session::EditorSession,
            state::{EditorState, LineageId},
            transaction::Transaction,
        };
        let point = |offset| -> Result<Point, Box<dyn std::error::Error>> {
            Ok(Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 1, 0, 0])?,
                utf16_offset: offset,
                affinity: Affinity::After,
            })
        };
        let before = EditorState::try_new(
            &context,
            LineageId::try_new("nested-reframe-session")?,
            document.clone(),
            Some(Selection::Range(RangeSelection::new(point(4)?, point(1)?))),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        session
            .apply_transaction(&Transaction::new(
                &before,
                vec![Operation::NestedListReframe(operation.clone())],
            ))?
            .into_commit()
            .ok_or("missing nested commit")?;
        let after = session.state().clone();
        assert_eq!(after.document(), edit.document());
        let mapped = |offset| -> Result<Point, Box<dyn std::error::Error>> {
            Ok(Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
                utf16_offset: offset,
                affinity: Affinity::After,
            })
        };
        assert_eq!(
            after.selection(),
            Some(&Selection::Range(RangeSelection::new(mapped(4)?, mapped(1)?)))
        );
        session.undo()?.ok_or("missing nested undo")?;
        assert_eq!(session.state().document(), before.document());
        assert_eq!(session.state().selection(), before.selection());
        session.redo()?.ok_or("missing nested redo")?;
        assert_eq!(session.state().document(), after.document());
        assert_eq!(session.state().selection(), after.selection());
    }
    for affinity in [Affinity::Before, Affinity::After] {
        for offset in [0, 1, 3, 4] {
            let point = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 1, 0, 0])?,
                utf16_offset: offset,
                affinity,
            };
            let expected = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
                utf16_offset: offset,
                affinity,
            };
            assert_eq!(edit.relocate(&point)?, PointRelocation::Exact(expected.clone()));
            let undo = edit.inverse().apply(&context, edit.document())?.ok_or("missing inverse")?;
            assert_eq!(undo.document(), &document);
            assert_eq!(undo.relocate(&expected)?, PointRelocation::Exact(point));
            assert_eq!(undo.inverse(), &operation);
        }
    }
    assert!(matches!(
        operation.apply(&context, edit.document()),
        Err(NestedListReframeError::ExpectedMismatch)
    ));
    let unchanged = NestedListReframe::capture(&context, &document, 0, 1, vec![source.clone()])?;
    assert!(unchanged.apply(&context, &document)?.is_none());
    let changed_text = element("breditor/bullet-list", vec![item(block("changed")?)?])?;
    assert!(matches!(
        NestedListReframe::try_new(0, vec![source], vec![changed_text]),
        Err(NestedListReframeError::ContentChanged)
    ));
    let limited = EditorContext::new(
        context.schema().clone(),
        DocumentLimits::default().with_max_node_depth(4),
    );
    let limited_document = Document::try_new(limited.schema(), root, limited.limits())?;
    assert!(operation.apply(&limited, &limited_document).is_err());
    assert_eq!(limited_document.root(), document.root());
    let flat = EditorContext::new(schema(false)?, DocumentLimits::default());
    let flat_document = Document::try_new(flat.schema(), document.root().clone(), flat.limits())?;
    assert!(matches!(
        operation.apply(&flat, &flat_document),
        Err(NestedListReframeError::UnsupportedSchema)
    ));
    Ok(())
}

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
