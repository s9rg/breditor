//! Private structural property admission; these fixtures do not enable editing.

use std::{error::Error, sync::Arc};

use proptest::prelude::*;

use super::{
    CompilerLimits, RequiredIntegerProperty, SchemaCompilerError, SchemaSpec, compile,
    encode_fingerprint, structural_grammar_tests::structural_spec,
};
use crate::{
    block::{HeadingLevel, MAX_ORDERED_LIST_ORDINAL, OrderedListStart},
    codec::{DocumentJsonCodecV2, DocumentV2CodecError},
    document::{
        Document, ElementNode, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, NodeRef, PropertyInteger,
        PropertyMap, PropertyObject, PropertyValue, PropertyValueKind,
    },
    identity::QualifiedName,
    position::NodePath,
    schema::{
        CompiledSchema, DocumentLimits, IntegerRangeViolation, SchemaId, SchemaVersion,
        ValidationCode, ValidationDetail, ValidationSubject,
    },
};

type TestResult = Result<(), Box<dyn Error>>;

fn contract(
    name: &str,
    minimum: i64,
    maximum: i64,
) -> Result<RequiredIntegerProperty, Box<dyn Error>> {
    Ok(RequiredIntegerProperty {
        name: QualifiedName::try_new(name)?,
        minimum: PropertyInteger::try_new(minimum)?,
        maximum: PropertyInteger::try_new(maximum)?,
    })
}

fn property_spec() -> Result<SchemaSpec, Box<dyn Error>> {
    let mut spec = structural_spec();
    spec.id = SchemaId::new(
        QualifiedName::try_new("example/structural-properties-test")?,
        SchemaVersion::one(),
    );
    for element in &mut spec.elements {
        element.property_contract = match element.kind.as_str() {
            "breditor/heading" => Some(contract("breditor/level", 1, 6)?),
            "breditor/ordered-list" => {
                Some(contract("breditor/start", 1, i64::from(MAX_ORDERED_LIST_ORDINAL))?)
            }
            _ => None,
        };
        element.allows_properties = element.property_contract.is_some();
    }
    Ok(spec)
}

fn integer(value: i64) -> Result<PropertyValue, Box<dyn Error>> {
    Ok(PropertyValue::from_integer(PropertyInteger::try_new(value)?))
}

fn props(entries: Vec<(&str, PropertyValue)>) -> Result<PropertyMap, Box<dyn Error>> {
    Ok(PropertyMap::try_from_sorted(
        entries
            .into_iter()
            .map(|(name, value)| Ok((QualifiedName::try_new(name)?, value)))
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?,
    )?)
}

fn element(
    kind: &str,
    properties: PropertyMap,
    children: Vec<NodeRef>,
) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(
        QualifiedName::try_new(kind)?,
        None,
        properties,
        children,
    )?))
}

fn root(child: NodeRef) -> Result<NodeRef, Box<dyn Error>> {
    element("breditor/document", PropertyMap::default(), vec![child])
}

fn heading(properties: PropertyMap) -> Result<NodeRef, Box<dyn Error>> {
    root(element("breditor/heading", properties, vec![])?)
}

fn ordered(properties: PropertyMap) -> Result<NodeRef, Box<dyn Error>> {
    root(element(
        "breditor/ordered-list",
        properties,
        vec![element(
            "breditor/list-item",
            PropertyMap::default(),
            vec![element("breditor/paragraph", PropertyMap::default(), vec![])?],
        )?],
    )?)
}

#[test]
fn heading_levels_and_list_start_boundaries_match_checked_block_values() -> TestResult {
    let schema = compile(property_spec()?, CompilerLimits::default())?;
    for value in [-1, 0, 1, 2, 3, 4, 5, 6, 7, 256, i64::from(u32::MAX)] {
        let tree = heading(props(vec![("breditor/level", integer(value)?)])?)?;
        let expected = u32::try_from(value).is_ok_and(|value| HeadingLevel::try_new(value).is_ok());
        assert_eq!(schema.validate_root(&tree, &DocumentLimits::default()).is_ok(), expected);
    }
    for value in [
        -1,
        0,
        1,
        2,
        i64::from(MAX_ORDERED_LIST_ORDINAL),
        i64::from(MAX_ORDERED_LIST_ORDINAL) + 1,
        i64::from(u32::MAX),
    ] {
        let tree = ordered(props(vec![("breditor/start", integer(value)?)])?)?;
        let expected =
            u32::try_from(value).is_ok_and(|value| OrderedListStart::try_new(value).is_ok());
        assert_eq!(schema.validate_root(&tree, &DocumentLimits::default()).is_ok(), expected);
    }
    assert!(!schema.supports_text_splice_operations());
    assert!(!schema.supports_paragraph_structure_operations());
    assert!(!schema.supports_base_text_operations());
    Ok(())
}

#[test]
fn required_properties_have_no_implicit_default_and_maps_are_closed() -> TestResult {
    let schema = compile(property_spec()?, CompilerLimits::default())?;
    for tree in [heading(PropertyMap::default())?, ordered(PropertyMap::default())?] {
        let report = schema
            .validate_root(&tree, &DocumentLimits::default())
            .err()
            .ok_or("missing admitted")?;
        assert!(report.contains(ValidationCode::MissingRequiredElementProperty));
    }
    let unknown =
        heading(props(vec![("breditor/level", integer(1)?), ("example/extra", integer(8)?)])?)?;
    assert!(
        schema
            .validate_root(&unknown, &DocumentLimits::default())
            .err()
            .ok_or("unknown admitted")?
            .contains(ValidationCode::UnknownElementProperty)
    );
    let wrong_name = heading(props(vec![("breditor/start", integer(1)?)])?)?;
    let report = schema
        .validate_root(&wrong_name, &DocumentLimits::default())
        .err()
        .ok_or("wrong name admitted")?;
    assert!(report.contains(ValidationCode::MissingRequiredElementProperty));
    assert!(report.contains(ValidationCode::UnknownElementProperty));
    let paragraph = root(element(
        "breditor/paragraph",
        props(vec![("breditor/level", integer(1)?)])?,
        vec![],
    )?)?;
    assert!(
        schema
            .validate_root(&paragraph, &DocumentLimits::default())
            .err()
            .ok_or("paragraph widened")?
            .contains(ValidationCode::PropertiesNotAllowed)
    );
    Ok(())
}

#[test]
fn type_and_range_diagnostics_are_precise_and_do_not_echo_payloads() -> TestResult {
    let schema = compile(property_spec()?, CompilerLimits::default())?;
    let secret = "private-property-payload";
    for value in [
        PropertyValue::null(),
        PropertyValue::boolean(true),
        PropertyValue::from_string(secret),
        PropertyValue::array(vec![integer(1)?]),
        PropertyValue::object(PropertyObject::default()),
    ] {
        let kind = value.kind();
        let tree = heading(props(vec![("breditor/level", value)])?)?;
        let report = schema
            .validate_root(&tree, &DocumentLimits::default())
            .err()
            .ok_or("coercion admitted")?;
        let issue = report
            .iter()
            .find(|issue| issue.code() == ValidationCode::ElementPropertyTypeMismatch)
            .ok_or("type issue missing")?;
        assert_eq!(issue.path(), &NodePath::try_from_indices(vec![0])?);
        assert_eq!(
            issue.subject(),
            &ValidationSubject::ElementProperty {
                name: Arc::from("breditor/level"),
                value_path: Arc::from([])
            }
        );
        assert_eq!(
            issue.detail(),
            &ValidationDetail::ElementPropertyType {
                expected: PropertyValueKind::Integer,
                actual: kind
            }
        );
        assert!(!format!("{report:?}").contains(secret));
    }
    for (value, violation) in
        [(0, IntegerRangeViolation::BelowMinimum), (7777, IntegerRangeViolation::AboveMaximum)]
    {
        let report = schema
            .validate_root(
                &heading(props(vec![("breditor/level", integer(value)?)])?)?,
                &DocumentLimits::default(),
            )
            .err()
            .ok_or("range admitted")?;
        let issue = report.iter().next().ok_or("range issue missing")?;
        assert_eq!(issue.code(), ValidationCode::ElementPropertyIntegerOutOfRange);
        assert_eq!(
            issue.detail(),
            &ValidationDetail::ElementPropertyIntegerRange {
                minimum: PropertyInteger::try_new(1)?,
                maximum: PropertyInteger::try_new(6)?,
                violation,
            }
        );
        assert!(!format!("{report:?}").contains("7777"));
    }
    Ok(())
}

#[test]
fn compiler_rejects_contradictory_permissions_and_reversed_ranges() -> TestResult {
    for reversed in [false, true] {
        let mut spec = property_spec()?;
        let heading = spec
            .elements
            .iter_mut()
            .find(|element| element.kind.as_str() == "breditor/heading")
            .ok_or("fixture missing")?;
        if reversed {
            heading.property_contract = Some(contract("breditor/level", 7, 6)?);
        } else {
            heading.allows_properties = false;
        }
        assert_eq!(
            compile(spec, CompilerLimits::default()),
            Err(SchemaCompilerError::InvalidElementPropertyContract {
                element: QualifiedName::try_new("breditor/heading")?,
            })
        );
    }
    Ok(())
}

#[test]
fn each_property_contract_dimension_changes_fingerprint_but_order_does_not() -> TestResult {
    let original = property_spec()?;
    let baseline = compile(original.clone(), CompilerLimits::default())?;
    let mut bytes = Vec::new();
    encode_fingerprint(baseline.definition(), |chunk| bytes.extend_from_slice(chunk));
    // Cross-checked independently with Node Buffer big-endian writes and SHA-256.
    assert_eq!(bytes.len(), 798);
    assert_eq!(
        baseline.fingerprint().to_string(),
        "sha256:cbd1ac563a51c1f924f525c049e6e0967f0d61a788c6437c062bbd3926bf589c"
    );
    assert_eq!(&bytes[38..43], &[3, 0, 0, 0, 4]);
    for variant in 0..4 {
        let mut spec = original.clone();
        let heading = spec
            .elements
            .iter_mut()
            .find(|element| element.kind.as_str() == "breditor/heading")
            .ok_or("fixture missing")?;
        heading.property_contract = match variant {
            0 => None,
            1 => Some(contract("example/rank", 1, 6)?),
            2 => Some(contract("breditor/level", 2, 6)?),
            _ => Some(contract("breditor/level", 1, 7)?),
        };
        assert_ne!(compile(spec, CompilerLimits::default())?.fingerprint(), baseline.fingerprint());
    }
    let mut reversed = original;
    reversed.elements.reverse();
    assert_eq!(compile(reversed, CompilerLimits::default())?, baseline);
    Ok(())
}

#[test]
fn canonical_codec_roundtrip_and_fingerprint_binding_keep_properties_exact() -> TestResult {
    let spec = property_spec()?;
    let schema = compile(spec.clone(), CompilerLimits::default())?;
    let tree =
        ordered(props(vec![("breditor/start", integer(i64::from(MAX_ORDERED_LIST_ORDINAL))?)])?)?;
    let document = Document::try_new(&schema, tree, &DocumentLimits::default())?;
    let codec = DocumentJsonCodecV2::new(schema);
    let json = codec.encode(&document)?;
    let restored = codec.decode(&json)?;
    assert_eq!(document.root(), restored.root());
    assert_eq!(document.summary(), restored.summary());
    assert_eq!(json, codec.encode(&restored)?);
    let fresh = DocumentJsonCodecV2::new(compile(spec.clone(), CompilerLimits::default())?);
    assert_eq!(json, fresh.encode(&fresh.decode(&json)?)?);
    let mut wrong = spec;
    wrong
        .elements
        .iter_mut()
        .find(|element| element.kind.as_str() == "breditor/heading")
        .ok_or("fixture missing")?
        .property_contract = Some(contract("breditor/level", 1, 7)?);
    assert!(matches!(
        DocumentJsonCodecV2::new(compile(wrong, CompilerLimits::default())?).decode(&json),
        Err(DocumentV2CodecError::SchemaBinding(_))
    ));
    assert!(DocumentJsonCodecV2::new(CompiledSchema::breditor_base()).decode(&json).is_err());
    Ok(())
}

#[test]
fn element_property_resource_limits_remain_independent_of_schema_permission() -> TestResult {
    let schema = compile(property_spec()?, CompilerLimits::default())?;
    let tree = heading(props(vec![("breditor/level", integer(1)?)])?)?;
    for limits in [
        DocumentLimits { max_properties_per_owner: 0, ..DocumentLimits::default() },
        DocumentLimits { max_property_values: 0, ..DocumentLimits::default() },
    ] {
        assert!(
            schema
                .validate_root(&tree, &limits)
                .err()
                .ok_or("resource budget bypassed")?
                .contains(ValidationCode::LimitExceeded)
        );
    }
    let exact = DocumentLimits {
        max_properties_per_owner: 1,
        max_property_values: 1,
        ..DocumentLimits::default()
    };
    assert_eq!(schema.validate_root(&tree, &exact)?.property_value_count(), 1);
    Ok(())
}

#[test]
fn element_property_diagnostic_codes_are_stable() {
    for (code, expected) in [
        (ValidationCode::UnknownElementProperty, "document.unknown_element_property"),
        (
            ValidationCode::MissingRequiredElementProperty,
            "document.missing_required_element_property",
        ),
        (ValidationCode::ElementPropertyTypeMismatch, "document.element_property_type_mismatch"),
        (
            ValidationCode::ElementPropertyIntegerOutOfRange,
            "document.element_property_integer_out_of_range",
        ),
    ] {
        assert_eq!(code.as_str(), expected);
    }
}

#[test]
fn element_and_inline_property_contracts_both_contribute_to_version_four() -> TestResult {
    use crate::extension::{
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        PropertyPresenceV1,
    };
    let mut spec = property_spec()?;
    let baseline = compile(spec.clone(), CompilerLimits::default())?;
    for presence in [PropertyPresenceV1::Required, PropertyPresenceV1::Optional] {
        spec.inline_formats[0].property_contract = Some(InlineFormatPropertyContractV1::try_new(
            spec.strong_kind.clone(),
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/flag")?,
                presence,
                InlineFormatPropertyTypeV1::boolean(),
            )],
        )?);
        let schema = compile(spec.clone(), CompilerLimits::default())?;
        assert_ne!(schema.fingerprint(), baseline.fingerprint());
        let mut bytes = Vec::new();
        encode_fingerprint(schema.definition(), |chunk| bytes.extend_from_slice(chunk));
        assert_eq!(&bytes[38..43], &[3, 0, 0, 0, 4]);
    }
    let optional = compile(spec.clone(), CompilerLimits::default())?;
    spec.inline_formats[0].property_contract = Some(InlineFormatPropertyContractV1::try_new(
        spec.strong_kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            QualifiedName::try_new("example/flag")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::boolean(),
        )],
    )?);
    assert_ne!(optional.fingerprint(), compile(spec, CompilerLimits::default())?.fingerprint());
    Ok(())
}

#[test]
fn decoding_rejects_malformed_closed_properties_without_changing_existing_document() -> TestResult {
    let schema = compile(property_spec()?, CompilerLimits::default())?;
    let document = Document::try_new(
        &schema,
        heading(props(vec![("breditor/level", integer(2)?)])?)?,
        &DocumentLimits::default(),
    )?;
    let codec = DocumentJsonCodecV2::new(schema);
    let canonical = codec.encode(&document)?;
    let template: serde_json::Value = serde_json::from_str(&canonical)?;
    for (properties, code) in [
        (serde_json::json!({}), ValidationCode::MissingRequiredElementProperty),
        (serde_json::json!({"breditor/level": "2"}), ValidationCode::ElementPropertyTypeMismatch),
        (
            serde_json::json!({"breditor/level": 0}),
            ValidationCode::ElementPropertyIntegerOutOfRange,
        ),
        (
            serde_json::json!({"breditor/level": 2, "example/extra": true}),
            ValidationCode::UnknownElementProperty,
        ),
    ] {
        let mut invalid = template.clone();
        invalid["root"]["children"][0]["properties"] = properties;
        let Err(DocumentV2CodecError::Validation(report)) = codec.decode(&invalid.to_string())
        else {
            return Err("malformed properties did not reach typed rejection".into());
        };
        assert!(report.contains(code));
        assert_eq!(codec.encode(&document)?, canonical);
    }
    for value in [serde_json::json!(1.5), serde_json::json!(9_007_199_254_740_992_u64)] {
        let mut invalid = template.clone();
        invalid["root"]["children"][0]["properties"]["breditor/level"] = value;
        assert!(codec.decode(&invalid.to_string()).is_err());
        assert_eq!(codec.encode(&document)?, canonical);
    }
    let duplicate =
        canonical.replace("\"breditor/level\":2", "\"breditor/level\":2,\"breditor/level\":3");
    assert_ne!(canonical, duplicate);
    assert!(codec.decode(&duplicate).is_err());
    Ok(())
}

#[test]
fn nested_invalid_property_values_still_obey_resource_budgets() -> TestResult {
    let schema = compile(property_spec()?, CompilerLimits::default())?;
    let limits = DocumentLimits {
        max_property_depth: 1,
        max_property_values: 2,
        max_property_string_bytes: 3,
        ..DocumentLimits::default()
    };
    for value in [
        PropertyValue::array(vec![PropertyValue::array(vec![integer(1)?])]),
        PropertyValue::array(vec![integer(1)?, integer(2)?]),
        PropertyValue::from_string("private-payload"),
    ] {
        let report = schema
            .validate_root(&heading(props(vec![("breditor/level", value)])?)?, &limits)
            .err()
            .ok_or("nested budget bypassed")?;
        assert!(report.contains(ValidationCode::LimitExceeded));
        assert!(!format!("{report:?}").contains("private-payload"));
    }
    Ok(())
}

#[test]
fn a_singleton_integer_domain_is_valid_and_signed_bounds_are_fingerprinted() -> TestResult {
    let mut spec = property_spec()?;
    spec.elements
        .iter_mut()
        .find(|element| element.kind.as_str() == "breditor/heading")
        .ok_or("fixture missing")?
        .property_contract = Some(contract("breditor/level", -1, -1)?);
    let singleton = compile(spec.clone(), CompilerLimits::default())?;
    for value in [-2, -1, 0] {
        assert_eq!(
            singleton
                .validate_root(
                    &heading(props(vec![("breditor/level", integer(value)?)])?)?,
                    &DocumentLimits::default()
                )
                .is_ok(),
            value == -1
        );
    }
    spec.elements
        .iter_mut()
        .find(|element| element.kind.as_str() == "breditor/heading")
        .ok_or("fixture missing")?
        .property_contract = Some(contract("breditor/level", 1, 1)?);
    assert_ne!(singleton.fingerprint(), compile(spec, CompilerLimits::default())?.fingerprint());
    Ok(())
}

proptest! {
    #[test]
    fn integer_admission_matches_the_checked_block_domains(value in prop_oneof![
        MIN_SAFE_INTEGER..=MAX_SAFE_INTEGER,
        -10_i64..=10,
        (i64::from(MAX_ORDERED_LIST_ORDINAL)-4)..=(i64::from(MAX_ORDERED_LIST_ORDINAL)+4),
    ]) {
        let result = (|| -> TestResult {
            let schema = compile(property_spec()?, CompilerLimits::default())?;
            let numeric = value;
            let heading_valid = schema.validate_root(&heading(props(vec![("breditor/level", integer(numeric)?)])?)?, &DocumentLimits::default()).is_ok();
            let list_valid = schema.validate_root(&ordered(props(vec![("breditor/start", integer(numeric)?)])?)?, &DocumentLimits::default()).is_ok();
            assert_eq!(heading_valid, (1..=6).contains(&value));
            assert_eq!(list_valid, (1..=i64::from(MAX_ORDERED_LIST_ORDINAL)).contains(&value));
            Ok(())
        })();
        result.map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
