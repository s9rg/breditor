//! Flat-list document admission, not list editing or a browser support claim.
use super::{
    CompilerLimits, SchemaSpec, base_text_profile_spec, compile, encode_fingerprint,
    flat_list_profile::with_flat_lists,
};
use crate::{
    block::MAX_ORDERED_LIST_ORDINAL,
    codec::DocumentJsonCodecV2,
    document::{
        Document, ElementNode, Format, FormatSet, NodeRef, PropertyInteger, PropertyMap,
        PropertyValue, TextNode,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    position::{Affinity, NodePath, Point},
    schema::{
        CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion,
        ValidationCode, element_property_contract::child_ordinals_fit,
    },
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
};
use proptest::prelude::*;
use std::error::Error;
type TestResult = Result<(), Box<dyn Error>>;

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    Ok(QualifiedName::try_new(value)?)
}
fn id() -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(name("example/flat-list-test")?, SchemaVersion::one()))
}
fn extensions() -> Result<ExtensionSet, Box<dyn Error>> {
    let kind = name("example/link")?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::one())],
        vec![InlineFormatPropertyContractV1::try_new(
            kind,
            vec![InlineFormatPropertySpecV1::new(
                name("example/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2048)?,
            )],
        )?],
    )?;
    Ok(ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?)
}
fn schema() -> Result<CompiledSchema, Box<dyn Error>> {
    Ok(CompiledSchema::try_compile_flat_list_profile(id()?, &extensions()?)?)
}
fn spec() -> Result<SchemaSpec, Box<dyn Error>> {
    Ok(with_flat_lists(base_text_profile_spec(id()?, &extensions()?)?)?)
}
fn prop(key: &str, value: i64) -> Result<PropertyMap, Box<dyn Error>> {
    Ok(PropertyMap::try_from_sorted(vec![(
        name(key)?,
        PropertyValue::from_integer(PropertyInteger::try_new(value)?),
    )])?)
}
fn element(
    kind: &str,
    properties: PropertyMap,
    children: Vec<NodeRef>,
) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, properties, children)?))
}
fn block(heading: bool, text: &str) -> Result<NodeRef, Box<dyn Error>> {
    let formats = FormatSet::try_from_formats(vec![Format::new(
        name("example/link")?,
        PropertyMap::try_from_sorted(vec![(
            name("example/href")?,
            PropertyValue::from_string("https://example.test/🙂"),
        )])?,
    )])?;
    let children = if text.is_empty() {
        vec![]
    } else {
        vec![NodeRef::text(TextNode::try_new(text.to_owned(), formats)?)]
    };
    element(
        if heading { "breditor/heading" } else { "breditor/paragraph" },
        if heading { prop("breditor/level", 3)? } else { PropertyMap::default() },
        children,
    )
}
fn item(block: NodeRef) -> Result<NodeRef, Box<dyn Error>> {
    element("breditor/list-item", PropertyMap::default(), vec![block])
}
fn list(start: Option<i64>, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    element(
        if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" },
        start.map_or_else(|| Ok(PropertyMap::default()), |value| prop("breditor/start", value))?,
        children,
    )
}
fn root(children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    element("breditor/document", PropertyMap::default(), children)
}
fn tree(start: Option<i64>, count: usize) -> Result<NodeRef, Box<dyn Error>> {
    root(vec![list(
        start,
        (0..count)
            .map(|index| item(block(index % 2 == 0, "a🙂e\u{301}")?))
            .collect::<Result<Vec<_>, _>>()?,
    )?])
}

#[test]
fn mixed_flat_tree_retains_headings_typed_formats_and_canonical_document_bytes() -> TestResult {
    let schema = schema()?;
    let root = root(vec![
        block(true, "title")?,
        list(None, vec![item(block(false, "")?)?, item(block(true, "a🙂b")?)?])?,
        list(Some(42), vec![item(block(false, "tail")?)?])?,
        block(false, "end")?,
    ])?;
    let document = Document::try_new(&schema, root, &DocumentLimits::default())?;
    let codec = DocumentJsonCodecV2::new(schema);
    let json = codec.encode(&document)?;
    let decoded = codec.decode(&json)?;
    assert_eq!(decoded.root(), document.root());
    assert_eq!(codec.encode(&decoded)?, json);
    assert!(json.contains("https://example.test/🙂"));
    let fresh = DocumentJsonCodecV2::new(self::schema()?);
    assert_eq!(fresh.encode(&fresh.decode(&json)?)?, json);
    Ok(())
}

#[test]
fn ordered_lists_validate_final_ordinal_not_only_start() -> TestResult {
    let schema = schema()?;
    let maximum = i64::from(MAX_ORDERED_LIST_ORDINAL);
    for (start, count, accepted) in [
        (1, 1, true),
        (1, 16, true),
        (0, 1, false),
        (-1, 1, false),
        (maximum, 1, true),
        (maximum - 1, 2, true),
        (maximum, 2, false),
        (maximum + 1, 1, false),
    ] {
        let result = schema.validate_root(&tree(Some(start), count)?, &DocumentLimits::default());
        assert_eq!(result.is_ok(), accepted, "start={start} count={count}");
        if start == maximum && count == 2 {
            assert!(
                result
                    .err()
                    .ok_or("missing diagnostic")?
                    .contains(ValidationCode::ElementChildOrdinalOutOfRange)
            );
        }
    }
    Ok(())
}

#[test]
fn rejects_empty_nested_multiblock_and_misplaced_list_shapes() -> TestResult {
    let schema = schema()?;
    let paragraph = block(false, "")?;
    let nested = list(None, vec![item(paragraph.clone())?])?;
    for child in [
        list(None, vec![])?,
        list(Some(1), vec![])?,
        item(paragraph.clone())?,
        list(None, vec![paragraph.clone()])?,
        list(None, vec![element("breditor/list-item", PropertyMap::default(), vec![])?])?,
        list(
            None,
            vec![element(
                "breditor/list-item",
                PropertyMap::default(),
                vec![paragraph.clone(), paragraph.clone()],
            )?],
        )?,
        list(
            None,
            vec![element(
                "breditor/list-item",
                PropertyMap::default(),
                vec![paragraph.clone(), nested.clone()],
            )?],
        )?,
        list(None, vec![item(nested.clone())?])?,
        element("breditor/paragraph", PropertyMap::default(), vec![nested])?,
    ] {
        assert!(schema.validate_root(&root(vec![child])?, &DocumentLimits::default()).is_err());
    }
    assert!(schema.validate_root(&root(vec![])?, &DocumentLimits::default()).is_err());
    Ok(())
}

#[test]
fn list_properties_are_closed_required_and_not_coerced() -> TestResult {
    let schema = schema()?;
    for properties in [
        PropertyMap::default(),
        prop("breditor/start", 0)?,
        prop("example/start", 1)?,
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_string("1"),
        )])?,
        PropertyMap::try_from_sorted(vec![
            (name("breditor/start")?, PropertyValue::from_integer(PropertyInteger::try_new(1)?)),
            (name("example/extra")?, PropertyValue::from_integer(PropertyInteger::try_new(2)?)),
        ])?,
    ] {
        let ordered = element("breditor/ordered-list", properties, vec![item(block(false, "")?)?])?;
        assert!(schema.validate_root(&root(vec![ordered])?, &DocumentLimits::default()).is_err());
    }
    for kind in ["breditor/bullet-list", "breditor/list-item"] {
        let child = element(kind, prop("breditor/start", 1)?, vec![item(block(false, "")?)?])?;
        let report = schema
            .validate_root(&root(vec![child])?, &DocumentLimits::default())
            .err()
            .ok_or("accepted")?;
        assert!(report.contains(ValidationCode::PropertiesNotAllowed));
    }
    Ok(())
}

#[test]
fn old_schemas_and_operation_capabilities_remain_closed_to_lists() -> TestResult {
    let schema = schema()?;
    assert!(!schema.supports_text_splice_operations());
    assert!(schema.supports_flat_list_operations());
    assert!(!schema.supports_paragraph_structure_operations());
    assert!(!schema.supports_text_block_kind_operations());
    assert!(!schema.supports_base_text_operations());
    for old in [
        CompiledSchema::breditor_base(),
        CompiledSchema::try_compile_text_block_profile(id()?, &extensions()?)?,
    ] {
        assert!(!old.supports_flat_list_operations());
        assert!(old.validate_root(&tree(None, 1)?, &DocumentLimits::default()).is_err());
        assert_ne!(schema.fingerprint(), old.fingerprint());
    }
    assert!(
        CompiledSchema::try_compile_flat_list_profile(
            CompiledSchema::breditor_base().id().clone(),
            &extensions()?
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn numbering_rule_is_fingerprint_bound_and_declaration_order_is_not() -> TestResult {
    let spec = spec()?;
    let baseline = compile(spec.clone(), CompilerLimits::default())?;
    assert!(baseline.supports_flat_list_operations());
    let mut bytes = Vec::new();
    encode_fingerprint(baseline.definition(), |chunk| bytes.extend_from_slice(chunk));
    // Independently encoded from the field table with Node big-endian writes.
    assert_eq!(bytes.len(), 798);
    assert_eq!(
        baseline.fingerprint().to_string(),
        "sha256:9399b646002ba442c8af3d8e8a6fd7bb6e6eb599943691a9591c62d35bcddd95"
    );
    assert_eq!(&bytes[38..43], &[3, 0, 0, 0, 5]);
    let mut old_rule = spec.clone();
    for element in &mut old_rule.elements {
        if let Some(contract) = &mut element.property_contract {
            contract.child_ordinals = false;
        }
    }
    let old_rule = compile(old_rule, CompilerLimits::default())?;
    assert!(!old_rule.supports_flat_list_operations());
    assert_ne!(baseline.fingerprint(), old_rule.fingerprint());
    let overflow = tree(Some(i64::from(MAX_ORDERED_LIST_ORDINAL)), 2)?;
    old_rule.validate_root(&overflow, &DocumentLimits::default())?;
    assert!(baseline.validate_root(&overflow, &DocumentLimits::default()).is_err());
    let mut reordered = spec;
    reordered.elements.reverse();
    for element in &mut reordered.elements {
        for group in &mut element.children.groups {
            group.kinds.reverse();
        }
    }
    assert_eq!(compile(reordered, CompilerLimits::default())?, baseline);
    Ok(())
}

#[test]
fn runtime_limits_count_list_containers_items_and_rank_properties() -> TestResult {
    let schema = schema()?;
    let root = tree(Some(1), 2)?;
    for limits in [
        DocumentLimits::default().with_max_nodes(7),
        DocumentLimits::default().with_max_node_depth(3),
        DocumentLimits::default().with_max_children_per_element(1),
        DocumentLimits::default().with_max_property_values(1),
    ] {
        assert!(
            schema
                .validate_root(&root, &limits)
                .err()
                .ok_or("limit ignored")?
                .contains(ValidationCode::LimitExceeded)
        );
    }
    schema.validate_root(&root, &DocumentLimits::default())?;
    Ok(())
}

#[test]
fn range_selection_reaches_list_text_without_weakening_scalar_checks() -> TestResult {
    let schema = schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let document = Document::try_new(context.schema(), tree(None, 2)?, context.limits())?;
    let point = |item, offset| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, item, 0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::After,
        })
    };
    let backwards = Selection::Range(RangeSelection::new(point(1, 3)?, point(0, 1)?));
    EditorState::try_new(
        &context,
        LineageId::try_new("flat-list-selection")?,
        document.clone(),
        Some(backwards),
        None,
    )?;
    assert!(point(0, 2)?.resolve(&document).is_err());
    let invalid = Selection::Range(RangeSelection::new(point(0, 2)?, point(0, 2)?));
    assert!(
        EditorState::try_new(
            &context,
            LineageId::try_new("flat-list-invalid")?,
            document,
            Some(invalid),
            None
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn checked_ordinal_arithmetic_never_wraps_or_saturates() {
    assert!(child_ordinals_fit(1, 0, 1)); // Grammar independently rejects empty lists.
    assert!(child_ordinals_fit(i64::MAX, 1, i64::MAX));
    assert!(!child_ordinals_fit(i64::MAX, 2, i64::MAX));
    assert!(!child_ordinals_fit(1, usize::MAX, i64::MAX));
}

#[test]
fn child_ordinal_contract_rejects_nonpositive_minimum() -> TestResult {
    let mut spec = spec()?;
    for element in &mut spec.elements {
        if let Some(contract) = &mut element.property_contract
            && contract.child_ordinals
        {
            contract.minimum = PropertyInteger::try_new(0)?;
        }
    }
    assert!(compile(spec, CompilerLimits::default()).is_err());
    Ok(())
}

#[test]
fn document_decoder_rejects_valid_start_with_overflowing_tail() -> TestResult {
    let schema = schema()?;
    let document = Document::try_new(&schema, tree(Some(1), 2)?, &DocumentLimits::default())?;
    let codec = DocumentJsonCodecV2::new(schema);
    let mut wire: serde_json::Value = serde_json::from_str(&codec.encode(&document)?)?;
    wire["root"]["children"][0]["properties"]["breditor/start"] =
        serde_json::Value::from(MAX_ORDERED_LIST_ORDINAL);
    assert!(codec.decode(&serde_json::to_string(&wire)?).is_err());
    Ok(())
}

#[test]
fn empty_item_text_boundary_is_a_selection_but_container_boundary_is_not() -> TestResult {
    let schema = schema()?;
    let root = root(vec![list(None, vec![item(block(false, "")?)?])?])?;
    let document = Document::try_new(&schema, root, &DocumentLimits::default())?;
    for (path, accepted) in
        [(vec![0, 0, 0], true), (vec![0, 0], false), (vec![0], false), (vec![], false)]
    {
        let point = Point::Children {
            parent_path: NodePath::try_from_indices(path)?,
            child_index: 0,
            affinity: Affinity::Before,
        };
        assert_eq!(
            RangeSelection::new(point.clone(), point).resolve(&schema, &document).is_ok(),
            accepted
        );
    }
    Ok(())
}

proptest! {
    #[test]
    fn ordinal_validation_matches_independent_wide_arithmetic(
        start in prop_oneof![1_u32..=MAX_ORDERED_LIST_ORDINAL, (0_u32..1024).prop_map(|offset| MAX_ORDERED_LIST_ORDINAL - offset)],
        count in 0_usize..1024,
    ) {
        let expected = count == 0 || u128::from(start) + count as u128 - 1 <= u128::from(MAX_ORDERED_LIST_ORDINAL);
        prop_assert_eq!(child_ordinals_fit(i64::from(start), count, i64::from(MAX_ORDERED_LIST_ORDINAL)), expected);
    }
}
