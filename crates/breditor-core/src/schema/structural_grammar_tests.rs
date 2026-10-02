//! Private structural shape fixtures, not a publicly admitted editor profile.
//!
//! Heading rank and ordered-list numbering properties deliberately remain out
//! of scope: those need closed element-property contracts before admission.

use std::error::Error;

use proptest::prelude::*;

use super::{
    ChildConstraint, ChildKind, CompilerLimits, DeclarationOwner, ElementSpec, SchemaCompilerError,
    SchemaSpec, base_spec, compile, encode_fingerprint,
};
use crate::{
    codec::DocumentJsonCodecV2,
    document::{Document, ElementNode, FormatSet, NodeRef, PropertyMap, TextNode},
    identity::QualifiedName,
    schema::{
        CompiledSchema, DocumentLimits, MAX_VALIDATION_REPORT_ISSUES, PersistedTypeRevision,
        SchemaId, SchemaVersion, ValidationCode, ValidationDetail, ValidationSubject,
        child_grammar::{ChildGroup, ChildSequence, MAX_CHILD_ALTERNATIVES, MAX_CHILD_GROUPS},
    },
};

type TestResult = Result<(), Box<dyn Error>>;

fn name(local: &str) -> QualifiedName {
    QualifiedName::from_known_static(match local {
        "document" => "breditor/document",
        "paragraph" => "breditor/paragraph",
        "heading" => "breditor/heading",
        "bullet" => "breditor/bullet-list",
        "ordered" => "breditor/ordered-list",
        "item" => "breditor/list-item",
        _ => "example/unknown",
    })
}

fn group(kinds: &[&str], minimum: u32, maximum: Option<u32>) -> ChildGroup {
    ChildGroup {
        kinds: kinds.iter().map(|kind| ChildKind::Element(name(kind))).collect(),
        minimum,
        maximum,
    }
}

fn structural_spec() -> SchemaSpec {
    let mut spec = base_spec();
    spec.id = SchemaId::new(
        QualifiedName::from_known_static("example/structural-shape-test"),
        SchemaVersion::one(),
    );
    spec.owner = DeclarationOwner::Profile;
    spec.elements[0].children = ChildConstraint {
        groups: vec![group(&["paragraph", "heading", "bullet", "ordered"], 1, None)],
    };
    for (kind, children) in [
        ("heading", ChildConstraint::repeated(ChildKind::Text, 0, None)),
        ("bullet", ChildConstraint::repeated(ChildKind::Element(name("item")), 1, None)),
        ("ordered", ChildConstraint::repeated(ChildKind::Element(name("item")), 1, None)),
        (
            "item",
            ChildConstraint {
                groups: vec![
                    group(&["paragraph", "heading"], 1, None),
                    group(&["bullet", "ordered"], 0, None),
                ],
            },
        ),
    ] {
        spec.elements.push(ElementSpec {
            kind: name(kind),
            owner: DeclarationOwner::Breditor,
            revision: PersistedTypeRevision::one(),
            allows_properties: false,
            allows_entity_id: false,
            children,
        });
    }
    spec
}

fn node(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind), None, PropertyMap::default(), children)?))
}

fn text() -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::text(TextNode::try_new("A🙂e\u{301}".to_owned(), FormatSet::default())?))
}

fn valid_tree() -> Result<NodeRef, Box<dyn Error>> {
    node(
        "document",
        vec![
            node("heading", vec![text()?])?,
            node(
                "bullet",
                vec![node(
                    "item",
                    vec![
                        node("paragraph", vec![])?,
                        node("heading", vec![text()?])?,
                        node(
                            "ordered",
                            vec![node("item", vec![node("paragraph", vec![text()?])?])?],
                        )?,
                    ],
                )?],
            )?,
        ],
    )
}

#[test]
fn validates_nested_structural_shapes_without_granting_edit_capabilities() -> TestResult {
    let schema = compile(structural_spec(), CompilerLimits::default())?;
    schema.validate_root(&valid_tree()?, &DocumentLimits::default())?;
    assert!(!schema.supports_text_splice_operations());
    assert!(!schema.supports_paragraph_structure_operations());
    assert!(!schema.supports_base_text_operations());
    assert!(!schema.is_exact_breditor_base());
    assert!(schema.is_text_container(&name("heading")));
    assert!(!schema.is_text_container(&name("item")));
    assert!(!schema.is_text_container(&name("document")));
    let report = CompiledSchema::breditor_base()
        .validate_root(&valid_tree()?, &DocumentLimits::default())
        .err()
        .ok_or("base admitted structure")?;
    assert!(report.contains(ValidationCode::UnknownElement));
    assert!(report.contains(ValidationCode::InvalidChild));
    Ok(())
}

#[test]
fn rejects_empty_lists_misplaced_items_and_text_after_nested_lists() -> TestResult {
    let schema = compile(structural_spec(), CompilerLimits::default())?;
    let paragraph = node("paragraph", vec![])?;
    let list = node("bullet", vec![node("item", vec![paragraph.clone()])?])?;
    for (label, child, code) in [
        ("empty list", node("bullet", vec![])?, ValidationCode::MissingRequiredChild),
        (
            "empty item",
            node("bullet", vec![node("item", vec![])?])?,
            ValidationCode::MissingRequiredChild,
        ),
        ("root item", node("item", vec![paragraph.clone()])?, ValidationCode::InvalidChild),
        ("list paragraph", node("bullet", vec![paragraph.clone()])?, ValidationCode::InvalidChild),
        ("list under text", node("paragraph", vec![list.clone()])?, ValidationCode::InvalidChild),
        (
            "missing item text",
            node("bullet", vec![node("item", vec![list.clone()])?])?,
            ValidationCode::InvalidChild,
        ),
        (
            "text after list",
            node("bullet", vec![node("item", vec![paragraph.clone(), list, paragraph])?])?,
            ValidationCode::InvalidChild,
        ),
        ("raw text", text()?, ValidationCode::InvalidChild),
        ("unknown", node("unknown", vec![])?, ValidationCode::UnknownElement),
    ] {
        let root = node("document", vec![child])?;
        let report = schema.validate_root(&root, &DocumentLimits::default()).err().ok_or(label)?;
        assert!(report.contains(code), "{label}: {report:?}");
    }
    assert!(
        schema
            .validate_root(&node("document", vec![])?, &DocumentLimits::default())
            .err()
            .ok_or("empty root admitted")?
            .contains(ValidationCode::MissingRequiredChild)
    );
    Ok(())
}

#[test]
fn compiler_rejects_empty_excessive_overlapping_and_unknown_alternatives() {
    let root = name("document");
    for (groups, expected) in [
        (vec![], SchemaCompilerError::InvalidChildGroupCount { element: root.clone() }),
        (
            vec![group(&["paragraph"], 0, None); MAX_CHILD_GROUPS + 1],
            SchemaCompilerError::InvalidChildGroupCount { element: root.clone() },
        ),
        (
            vec![group(&[], 0, None)],
            SchemaCompilerError::InvalidChildAlternativeCount { element: root.clone() },
        ),
        (
            vec![group(&vec!["paragraph"; MAX_CHILD_ALTERNATIVES + 1], 0, None)],
            SchemaCompilerError::InvalidChildAlternativeCount { element: root.clone() },
        ),
        (
            vec![group(&["paragraph", "paragraph"], 0, None)],
            SchemaCompilerError::OverlappingChildAlternatives { element: root.clone() },
        ),
        (
            vec![group(&["paragraph"], 0, None), group(&["paragraph"], 1, None)],
            SchemaCompilerError::OverlappingChildAlternatives { element: root.clone() },
        ),
        (
            vec![group(&["unknown"], 0, None)],
            SchemaCompilerError::UnknownChildElement {
                element: root.clone(),
                child: name("unknown"),
            },
        ),
        (
            vec![group(&["paragraph"], 2, Some(1))],
            SchemaCompilerError::InvalidChildCountRange {
                element: root.clone(),
                minimum: 2,
                maximum: 1,
            },
        ),
        (
            vec![group(&["paragraph"], u32::MAX, None), group(&["heading"], 1, None)],
            SchemaCompilerError::ChildMinimumOverflow { element: root.clone() },
        ),
    ] {
        let mut spec = structural_spec();
        spec.elements[0].children.groups = groups;
        assert_eq!(compile(spec, CompilerLimits::default()), Err(expected));
    }
}

#[test]
fn compiler_accepts_exact_group_and_alternative_limits() -> TestResult {
    let mut spec = base_spec();
    let mut alternatives = Vec::new();
    for index in 0..MAX_CHILD_GROUPS * MAX_CHILD_ALTERNATIVES {
        let kind = QualifiedName::try_new(format!("example/block-{index:03}"))?;
        alternatives.push(ChildKind::Element(kind.clone()));
        spec.elements.push(ElementSpec {
            kind,
            owner: DeclarationOwner::Profile,
            revision: PersistedTypeRevision::one(),
            allows_properties: false,
            allows_entity_id: false,
            children: ChildConstraint::repeated(ChildKind::Text, 0, None),
        });
    }
    spec.elements[0].children.groups = alternatives
        .chunks(MAX_CHILD_ALTERNATIVES)
        .map(|kinds| ChildGroup { kinds: kinds.to_vec(), minimum: 0, maximum: None })
        .collect();
    let schema = compile(spec, CompilerLimits::default())?;
    schema.validate_root(&node("document", vec![])?, &DocumentLimits::default())?;
    Ok(())
}

#[test]
fn alternative_order_is_canonical_but_group_order_and_bounds_change_fingerprints() -> TestResult {
    let spec = structural_spec();
    let schema = compile(spec.clone(), CompilerLimits::default())?;
    let mut permuted = spec.clone();
    permuted.elements.reverse();
    for element in &mut permuted.elements {
        for group in &mut element.children.groups {
            group.kinds.reverse();
        }
    }
    let reordered = compile(permuted, CompilerLimits::default())?;
    assert_eq!(schema, reordered);
    assert_eq!(schema.fingerprint(), reordered.fingerprint());
    let mut bytes = Vec::new();
    encode_fingerprint(schema.definition(), |chunk| bytes.extend_from_slice(chunk));
    // Independently encoded from the documented field table using Node's
    // big-endian Buffer writes and SHA-256, not copied from this Rust encoder.
    assert_eq!(bytes.len(), 707);
    assert_eq!(
        schema.fingerprint().to_string(),
        "sha256:06fd7accf6565539dd4343137facc535dc40fde232cee5d7ada72ce572a08716"
    );
    assert_eq!(&bytes[38..43], &[0x03, 0, 0, 0, 3]);
    for change in 0..5 {
        let mut variant = spec.clone();
        let item = variant
            .elements
            .iter_mut()
            .find(|element| element.kind == name("item"))
            .ok_or("fixture list item missing")?;
        match change {
            0 => item.children.groups.reverse(),
            1 => item.children.groups[0].minimum = 2,
            2 => item.children.groups[1].maximum = Some(1),
            3 => {
                item.children.groups[0].kinds.pop();
            }
            _ => item.children.groups[1].minimum = 1,
        }
        assert_ne!(
            schema.fingerprint(),
            compile(variant, CompilerLimits::default())?.fingerprint()
        );
    }
    Ok(())
}

#[test]
fn structural_validation_respects_node_depth_child_and_report_limits() -> TestResult {
    let schema = compile(structural_spec(), CompilerLimits::default())?;
    let root = valid_tree()?;
    for limits in [
        DocumentLimits { max_node_depth: 3, ..DocumentLimits::default() },
        DocumentLimits { max_nodes: 4, ..DocumentLimits::default() },
        DocumentLimits { max_children_per_element: 1, ..DocumentLimits::default() },
    ] {
        assert!(
            schema
                .validate_root(&root, &limits)
                .err()
                .ok_or("limit not enforced")?
                .contains(ValidationCode::LimitExceeded)
        );
    }
    let invalid = node("document", vec![node("item", vec![])?; 2 * MAX_VALIDATION_REPORT_ISSUES])?;
    let report = schema
        .validate_root(&invalid, &DocumentLimits::default())
        .err()
        .ok_or("invalid admitted")?;
    assert!(report.issue_count() <= MAX_VALIDATION_REPORT_ISSUES);
    let first = report.iter().next().ok_or("missing diagnostic")?;
    assert_eq!(first.subject(), &ValidationSubject::Child { index: 0 });
    assert_eq!(first.detail(), &ValidationDetail::None);
    Ok(())
}

#[test]
fn optional_groups_can_be_skipped_but_required_groups_and_maxima_cannot() -> TestResult {
    let mut spec = structural_spec();
    spec.elements[0].children.groups = vec![
        group(&["heading"], 0, Some(1)),
        group(&["paragraph"], 1, Some(2)),
        group(&["bullet"], 0, Some(0)),
    ];
    let schema = compile(spec, CompilerLimits::default())?;
    for (kinds, valid) in [
        (vec!["paragraph"], true),
        (vec!["heading", "paragraph", "paragraph"], true),
        (vec![], false),
        (vec!["heading"], false),
        (vec!["paragraph", "heading"], false),
        (vec!["paragraph", "paragraph", "paragraph"], false),
        (vec!["paragraph", "bullet"], false),
    ] {
        let children =
            kinds.into_iter().map(|kind| node(kind, vec![])).collect::<Result<Vec<_>, _>>()?;
        assert_eq!(
            schema.validate_root(&node("document", children)?, &DocumentLimits::default()).is_ok(),
            valid
        );
    }
    Ok(())
}

#[test]
fn exact_structural_resource_budgets_pass_and_one_less_rejects() -> TestResult {
    let schema = compile(structural_spec(), CompilerLimits::default())?;
    let root = valid_tree()?;
    let summary = schema.validate_root(&root, &DocumentLimits::default())?;
    let exact = DocumentLimits {
        max_nodes: usize::try_from(summary.node_count())?,
        max_node_depth: usize::try_from(summary.max_node_depth())?,
        max_children_per_element: 3,
        ..DocumentLimits::default()
    };
    assert_eq!(schema.validate_root(&root, &exact)?, summary);
    for limits in [
        DocumentLimits { max_nodes: exact.max_nodes - 1, ..exact.clone() },
        DocumentLimits { max_node_depth: exact.max_node_depth - 1, ..exact.clone() },
        DocumentLimits { max_children_per_element: 2, ..exact },
    ] {
        assert!(
            schema
                .validate_root(&root, &limits)
                .err()
                .ok_or("one-less budget admitted")?
                .contains(ValidationCode::LimitExceeded)
        );
    }
    Ok(())
}

#[test]
fn truncated_child_scan_does_not_claim_required_suffix_is_missing() -> TestResult {
    let mut spec = structural_spec();
    spec.elements[0].children.groups =
        vec![group(&["heading"], 1, None), group(&["paragraph"], 1, None)];
    let schema = compile(spec, CompilerLimits::default())?;
    let root = node("document", vec![node("heading", vec![])?, node("paragraph", vec![])?])?;
    schema.validate_root(&root, &DocumentLimits::default())?;
    let limits = DocumentLimits { max_children_per_element: 1, ..DocumentLimits::default() };
    let report = schema.validate_root(&root, &limits).err().ok_or("oversize root admitted")?;
    assert!(report.contains(ValidationCode::LimitExceeded));
    assert!(!report.contains(ValidationCode::MissingRequiredChild));
    Ok(())
}

#[test]
fn fingerprint_bound_codec_roundtrips_private_shapes_and_rejects_other_meanings() -> TestResult {
    let spec = structural_spec();
    let schema = compile(spec.clone(), CompilerLimits::default())?;
    let document = Document::try_new(&schema, valid_tree()?, &DocumentLimits::default())?;
    let codec = DocumentJsonCodecV2::new(schema);
    let encoded = codec.encode(&document)?;
    let restored = codec.decode(&encoded)?;
    assert_eq!(document.root(), restored.root());
    assert_eq!(document.summary(), restored.summary());
    assert_eq!(codec.encode(&restored)?, encoded);
    // A fresh proof allocation with the same meaning must work; a matching
    // selector with different grammar must fail its fingerprint binding.
    let fresh = DocumentJsonCodecV2::new(compile(spec.clone(), CompilerLimits::default())?);
    assert_eq!(fresh.encode(&fresh.decode(&encoded)?)?, encoded);
    let mut changed = spec;
    changed.elements[0].children.groups[0].maximum = Some(10);
    let changed = DocumentJsonCodecV2::new(compile(changed, CompilerLimits::default())?);
    assert!(changed.decode(&encoded).is_err());
    assert!(changed.encode(&document).is_err());
    assert!(DocumentJsonCodecV2::new(CompiledSchema::breditor_base()).decode(&encoded).is_err());
    Ok(())
}

#[test]
fn skipping_required_middle_group_is_rejected_and_optional_middle_is_allowed() -> TestResult {
    for minimum in [0, 1] {
        let mut spec = structural_spec();
        spec.elements[0].children.groups = vec![
            group(&["heading"], 0, None),
            group(&["paragraph"], minimum, None),
            group(&["bullet"], 0, None),
        ];
        let schema = compile(spec, CompilerLimits::default())?;
        let list = node("bullet", vec![node("item", vec![node("paragraph", vec![])?])?])?;
        let root = node("document", vec![list])?;
        assert_eq!(schema.validate_root(&root, &DocumentLimits::default()).is_ok(), minimum == 0);
    }
    Ok(())
}

#[test]
fn text_alternatives_are_canonical_and_cannot_overlap_across_groups() -> TestResult {
    let mut spec = base_spec();
    spec.elements[0].children.groups[0].kinds.push(ChildKind::Text);
    let schema = compile(spec.clone(), CompilerLimits::default())?;
    schema.validate_root(
        &node("document", vec![text()?, node("paragraph", vec![])?])?,
        &DocumentLimits::default(),
    )?;
    assert!(!schema.is_text_container(&name("document")));
    spec.elements[0].children.groups.push(ChildGroup {
        kinds: vec![ChildKind::Text],
        minimum: 0,
        maximum: None,
    });
    assert_eq!(
        compile(spec, CompilerLimits::default()),
        Err(SchemaCompilerError::OverlappingChildAlternatives { element: name("document") })
    );
    Ok(())
}

#[test]
fn grouped_and_typed_format_semantics_both_contribute_to_fingerprint() -> TestResult {
    let mut spec = structural_spec();
    let kind = spec.strong_kind.clone();
    let make_contract = |presence| -> Result<_, Box<dyn Error>> {
        use crate::extension::{
            InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        };
        Ok(InlineFormatPropertyContractV1::try_new(
            kind.clone(),
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/flag")?,
                presence,
                InlineFormatPropertyTypeV1::boolean(),
            )],
        )?)
    };
    spec.inline_formats[0].property_contract =
        Some(make_contract(crate::extension::PropertyPresenceV1::Required)?);
    let required = compile(spec.clone(), CompilerLimits::default())?;
    spec.inline_formats[0].property_contract =
        Some(make_contract(crate::extension::PropertyPresenceV1::Optional)?);
    let optional = compile(spec, CompilerLimits::default())?;
    assert_ne!(required.fingerprint(), optional.fingerprint());
    assert_ne!(
        required.fingerprint(),
        compile(structural_spec(), CompilerLimits::default())?.fingerprint()
    );
    Ok(())
}

proptest! {
    /// Compare the streaming recognizer to an independent count-and-order law.
    #[test]
    fn streaming_recognizer_matches_reference_language(
        input in prop::collection::vec(0_usize..5, 0..64),
        min_text in 0_u32..4, max_text in 3_u32..8,
        min_list in 0_u32..4, max_list in 3_u32..8,
    ) {
        let constraint = ChildConstraint { groups: vec![
            group(&["paragraph", "heading"], min_text, Some(max_text)),
            group(&["bullet", "ordered"], min_list, Some(max_list)),
        ] };
        let text_count = input.iter().filter(|&&kind| kind < 2).count();
        let list_count = input.iter().filter(|&&kind| (2..4).contains(&kind)).count();
        let first_list = input.iter().position(|&kind| kind >= 2).unwrap_or(input.len());
        let expected = input.iter().all(|&kind| kind < 4)
            && input[first_list..].iter().all(|&kind| kind >= 2)
            && (min_text as usize..=max_text as usize).contains(&text_count)
            && (min_list as usize..=max_list as usize).contains(&list_count);
        let mut sequence = ChildSequence::new(&constraint);
        let mut actual = true;
        for kind in input {
            let child = node(["paragraph", "heading", "bullet", "ordered", "unknown"][kind], vec![])
                .map_err(|error| TestCaseError::fail(error.to_string()))?;
            actual &= sequence.observe(&child);
        }
        actual &= !sequence.missing_required();
        prop_assert_eq!(actual, expected);
    }
}
