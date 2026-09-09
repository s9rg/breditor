//! Public contracts for typed inline-format properties.

mod support;

use std::error::Error;

use breditor_core::{
    action::{ActionId, ActionStateId, routing::BindingId, routing::IntentId},
    codec::{DocumentJsonCodecV2, DocumentV2CodecError},
    document::{
        PropertyInteger, PropertyMap, PropertyMapError, PropertyValue, PropertyValueKind,
        TextFragment,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionManifestError, ExtensionSet,
        ExtensionVersion, InlineFormatPropertyContractV1, InlineFormatPropertyContractV1Error,
        InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, InlineFormatPropertyTypeV1Error,
        InlineFormatSpecV1, InlineFormatToggleSpecV1,
        MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
        MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT, MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    profile::{CompiledEditorProfile, ProfileCompilationError},
    schema::{
        CompiledSchema, DocumentLimits, IntegerRangeViolation, LimitKind, PersistedTypeRevision,
        SchemaId, SchemaVersion, ValidationCode, ValidationDetail, ValidationReport,
        ValidationSubject,
    },
    state::EditorContext,
};
use serde_json::{Value, json};
use support::{TestResult, test_error};

const LINK_FORMAT: &str = "example/link";
const HREF_PROPERTY: &str = "example/href";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn owner() -> Result<ExtensionId, Box<dyn Error>> {
    Ok(ExtensionId::new(name("example/link-extension")?, ExtensionVersion::try_new(1)?))
}

fn schema_id(value: &str) -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(name(value)?, SchemaVersion::try_new(1)?))
}

fn link_format() -> Result<InlineFormatSpecV1, Box<dyn Error>> {
    Ok(InlineFormatSpecV1::new(name(LINK_FORMAT)?, PersistedTypeRevision::one()))
}

fn href_contract(maximum: u32) -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
    Ok(InlineFormatPropertyContractV1::try_new(
        name(LINK_FORMAT)?,
        vec![InlineFormatPropertySpecV1::new(
            name(HREF_PROPERTY)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, maximum)?,
        )],
    )?)
}

fn complete_contract() -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
    let zero = PropertyInteger::try_new(0)?;
    let ten = PropertyInteger::try_new(10)?;
    Ok(InlineFormatPropertyContractV1::try_new(
        name(LINK_FORMAT)?,
        vec![
            InlineFormatPropertySpecV1::new(
                name("example/trusted")?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::boolean(),
            ),
            InlineFormatPropertySpecV1::new(
                name("example/rank")?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_integer(Some(zero), Some(ten))?,
            ),
            InlineFormatPropertySpecV1::new(
                name(HREF_PROPERTY)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
            ),
            InlineFormatPropertySpecV1::new(
                name("example/label")?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_string(0, 64)?,
            ),
        ],
    )?)
}

fn manifest(
    contract: InlineFormatPropertyContractV1,
    toggles: Vec<InlineFormatToggleSpecV1>,
) -> Result<ExtensionManifest, Box<dyn Error>> {
    Ok(ExtensionManifest::try_new_with_inline_format_declarations(
        owner()?,
        Vec::new(),
        Vec::new(),
        vec![link_format()?],
        vec![contract],
        toggles,
    )?)
}

fn extension_set(manifest: ExtensionManifest) -> Result<ExtensionSet, Box<dyn Error>> {
    ExtensionSet::try_new(vec![manifest], ExtensionLimits::default()).map_err(Into::into)
}

fn schema_with_contract(
    id: &str,
    contract: InlineFormatPropertyContractV1,
) -> Result<CompiledSchema, Box<dyn Error>> {
    let extensions = extension_set(manifest(contract, Vec::new())?)?;
    CompiledSchema::try_compile_base_text_profile(schema_id(id)?, &extensions).map_err(Into::into)
}

fn document_json(schema: &CompiledSchema, properties: &Value) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": schema.id().name().as_str(),
            "version": schema.id().version().get(),
        },
        "schemaFingerprint": schema.fingerprint().to_string(),
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": [{
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": [{
                    "kind": "text",
                    "text": "linked",
                    "formats": [{"type": LINK_FORMAT, "properties": properties}],
                }],
            }],
        },
    })
    .to_string()
}

fn validation_report(
    schema: &CompiledSchema,
    properties: &Value,
    limits: DocumentLimits,
) -> Result<ValidationReport, Box<dyn Error>> {
    let codec = DocumentJsonCodecV2::new(schema.clone()).with_limits(limits);
    match codec.decode(&document_json(schema, properties)) {
        Err(DocumentV2CodecError::Validation(report)) => Ok(report),
        Err(error) => Err(test_error(format!("expected validation report, got {error}")).into()),
        Ok(_) => Err(test_error("expected document validation to fail").into()),
    }
}

#[test]
fn scalar_domains_and_canonical_property_maps_are_checked_values() -> TestResult {
    let zero = PropertyInteger::try_new(0)?;
    let ten = PropertyInteger::try_new(10)?;
    assert_eq!(
        InlineFormatPropertyTypeV1::try_integer(Some(ten), Some(zero)),
        Err(InlineFormatPropertyTypeV1Error::InvalidIntegerRange { minimum: ten, maximum: zero })
    );
    assert_eq!(
        InlineFormatPropertyTypeV1::try_string(2, 1),
        Err(InlineFormatPropertyTypeV1Error::InvalidStringByteRange {
            minimum_utf8_bytes: 2,
            maximum_utf8_bytes: 1,
        })
    );
    assert_eq!(
        InlineFormatPropertyTypeV1::try_string(0, MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES + 1,),
        Err(InlineFormatPropertyTypeV1Error::StringMaximumTooLarge {
            actual: MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES + 1,
            maximum: MAX_INLINE_FORMAT_PROPERTY_STRING_BYTES,
        })
    );

    let alpha = name("example/alpha")?;
    let beta = name("example/beta")?;
    let map = PropertyMap::try_from_sorted(vec![
        (alpha.clone(), PropertyValue::boolean(true)),
        (beta.clone(), PropertyValue::from_integer(ten)),
    ])?;
    assert_eq!(map.len(), 2);
    assert_eq!(map.get(&alpha).and_then(PropertyValue::as_boolean), Some(true));
    assert_eq!(
        PropertyMap::try_from_sorted(vec![
            (alpha.clone(), PropertyValue::boolean(true)),
            (alpha.clone(), PropertyValue::boolean(false)),
        ]),
        Err(PropertyMapError::DuplicateProperty { name: alpha.clone() })
    );
    assert_eq!(
        PropertyMap::try_from_sorted(vec![
            (beta.clone(), PropertyValue::boolean(true)),
            (alpha.clone(), PropertyValue::boolean(false)),
        ]),
        Err(PropertyMapError::NonCanonicalOrder { previous: beta, current: alpha })
    );
    Ok(())
}

#[test]
fn property_contract_constructor_is_nonempty_bounded_unique_and_canonical() -> TestResult {
    let format_kind = name(LINK_FORMAT)?;
    assert_eq!(
        InlineFormatPropertyContractV1::try_new(format_kind.clone(), Vec::new()),
        Err(InlineFormatPropertyContractV1Error::Empty { format_kind: format_kind.clone() })
    );

    let property = InlineFormatPropertySpecV1::new(
        name(HREF_PROPERTY)?,
        PropertyPresenceV1::Required,
        InlineFormatPropertyTypeV1::boolean(),
    );
    assert_eq!(
        InlineFormatPropertyContractV1::try_new(
            format_kind.clone(),
            vec![property.clone(), property.clone()],
        ),
        Err(InlineFormatPropertyContractV1Error::DuplicateProperty {
            format_kind: format_kind.clone(),
            name: name(HREF_PROPERTY)?,
        })
    );
    let oversized = (0..=MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT)
        .map(|index| {
            Ok(InlineFormatPropertySpecV1::new(
                name(&format!("example/property-{index}"))?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::boolean(),
            ))
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    assert!(matches!(
        InlineFormatPropertyContractV1::try_new(format_kind.clone(), oversized),
        Err(InlineFormatPropertyContractV1Error::TooManyProperties {
            actual,
            maximum: MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT,
            ..
        }) if actual == MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT + 1
    ));
    assert!(matches!(
        InlineFormatPropertyContractV1::try_new(
            format_kind.clone(),
            vec![InlineFormatPropertySpecV1::new(
                name("breditor/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::boolean(),
            )],
        ),
        Err(InlineFormatPropertyContractV1Error::ReservedPropertyName { .. })
    ));

    let contract = complete_contract()?;
    let ordered =
        contract.properties().iter().map(|property| property.name().as_str()).collect::<Vec<_>>();
    assert_eq!(ordered, vec!["example/href", "example/label", "example/rank", "example/trusted"]);
    Ok(())
}

#[test]
fn manifest_owns_and_canonicalizes_each_property_contract_target() -> TestResult {
    let contract = href_contract(2_048)?;
    let manifest = manifest(contract.clone(), Vec::new())?;
    assert_eq!(manifest.inline_format_property_contracts(), std::slice::from_ref(&contract));

    let legacy = ExtensionManifest::try_new_with_inline_formats(
        owner()?,
        Vec::new(),
        Vec::new(),
        vec![link_format()?],
    )?;
    assert!(legacy.inline_format_property_contracts().is_empty());

    assert!(matches!(
        ExtensionManifest::try_new_with_inline_format_declarations(
            owner()?,
            Vec::new(),
            Vec::new(),
            vec![link_format()?],
            vec![contract.clone(), contract.clone()],
            Vec::new(),
        ),
        Err(ExtensionManifestError::DuplicateInlineFormatPropertyContract { .. })
    ));
    assert!(matches!(
        ExtensionManifest::try_new_with_inline_format_declarations(
            owner()?,
            Vec::new(),
            Vec::new(),
            vec![link_format()?],
            vec![InlineFormatPropertyContractV1::try_new(
                name("example/unowned")?,
                vec![InlineFormatPropertySpecV1::new(
                    name("example/value")?,
                    PropertyPresenceV1::Required,
                    InlineFormatPropertyTypeV1::boolean(),
                )],
            )?],
            Vec::new(),
        ),
        Err(ExtensionManifestError::InlineFormatPropertyContractTargetNotOwned { .. })
    ));
    let too_many =
        vec![
            contract;
            usize::try_from(MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST)? + 1
        ];
    assert!(matches!(
        ExtensionManifest::try_new_with_inline_format_declarations(
            owner()?,
            Vec::new(),
            Vec::new(),
            vec![link_format()?],
            too_many,
            Vec::new(),
        ),
        Err(ExtensionManifestError::TooManyInlineFormatPropertyContracts { .. })
    ));
    Ok(())
}

#[test]
fn typed_schema_fingerprint_descriptor_and_document_v2_round_trip_are_complete() -> TestResult {
    let contract = href_contract(2_048)?;
    let extensions = extension_set(manifest(contract.clone(), Vec::new())?)?;
    let id = schema_id("example/link-profile")?;
    let schema = CompiledSchema::try_compile_base_text_profile(id.clone(), &extensions)?;
    assert_eq!(
        schema.fingerprint().to_string(),
        "sha256:3903989dedf6015c4f81b16fdaaddafb4a7a100f1b7f61bfacef694b5141c9ef"
    );
    assert_eq!(schema.inline_format_property_contract(&name(LINK_FORMAT)?), Some(&contract));
    assert!(!schema.is_property_free_inline_format(&name(LINK_FORMAT)?));

    let independently_compiled = CompiledSchema::try_compile_base_text_profile(id, &extensions)?;
    assert_eq!(schema, independently_compiled);
    assert_eq!(schema.fingerprint(), independently_compiled.fingerprint());

    let profile = CompiledEditorProfile::try_compile_base_text_profile(
        schema_id("example/link-profile")?,
        extensions,
    )?;
    let descriptor = profile
        .descriptor()
        .inline_format(&name(LINK_FORMAT)?)
        .ok_or_else(|| test_error("compiled profile omitted link descriptor"))?;
    assert_eq!(descriptor.property_contract(), Some(&contract));

    let codec = DocumentJsonCodecV2::new(schema.clone());
    let input = document_json(&schema, &json!({HREF_PROPERTY: "https://example.com"}));
    let document = codec.decode(&input)?;
    assert_eq!(
        document.summary().total_property_string_bytes(),
        u64::try_from("https://example.com".len())?
    );
    let canonical = codec.encode(&document)?;
    assert_eq!(codec.encode(&codec.decode(&canonical)?)?, canonical);
    Ok(())
}

#[test]
fn typed_validation_distinguishes_exact_keys_types_ranges_and_host_limits() -> TestResult {
    let schema = schema_with_contract("example/complete-link-profile", complete_contract()?)?;

    let codec = DocumentJsonCodecV2::new(schema.clone());
    let valid = json!({
        HREF_PROPERTY: "https://example.com",
        "example/label": "😀",
        "example/rank": 7,
        "example/trusted": true,
    });
    let document = codec.decode(&document_json(&schema, &valid))?;
    assert_eq!(document.summary().property_value_count(), 4);

    let missing = validation_report(&schema, &json!({}), DocumentLimits::default())?;
    assert!(missing.contains(ValidationCode::MissingRequiredFormatProperty));

    let unknown = validation_report(
        &schema,
        &json!({HREF_PROPERTY: "x", "example/unknown": true}),
        DocumentLimits::default(),
    )?;
    assert!(unknown.contains(ValidationCode::UnknownFormatProperty));

    let mismatch =
        validation_report(&schema, &json!({HREF_PROPERTY: true}), DocumentLimits::default())?;
    let mismatch_issue = mismatch
        .iter()
        .find(|issue| issue.code() == ValidationCode::FormatPropertyTypeMismatch)
        .ok_or_else(|| test_error("missing type mismatch issue"))?;
    assert_eq!(
        mismatch_issue.detail(),
        &ValidationDetail::FormatPropertyType {
            expected: PropertyValueKind::String,
            actual: PropertyValueKind::Boolean,
        }
    );

    let empty_href =
        validation_report(&schema, &json!({HREF_PROPERTY: ""}), DocumentLimits::default())?;
    assert!(empty_href.contains(ValidationCode::FormatPropertyStringBytesOutOfRange));

    let integer = validation_report(
        &schema,
        &json!({HREF_PROPERTY: "x", "example/rank": 7_777_777}),
        DocumentLimits::default(),
    )?;
    let integer_issue = integer
        .iter()
        .find(|issue| issue.code() == ValidationCode::FormatPropertyIntegerOutOfRange)
        .ok_or_else(|| test_error("missing integer range issue"))?;
    assert_eq!(
        integer_issue.detail(),
        &ValidationDetail::FormatPropertyIntegerRange {
            minimum: Some(PropertyInteger::try_new(0)?),
            maximum: Some(PropertyInteger::try_new(10)?),
            violation: IntegerRangeViolation::AboveMaximum,
        }
    );
    assert!(!integer_issue.message().contains("7777777"));
    assert!(!format!("{integer:?}").contains("7777777"));

    let secret = "secret-link-label-that-must-never-appear-in-a-validation-report".repeat(2);
    let secret_report = validation_report(
        &schema,
        &json!({HREF_PROPERTY: "x", "example/label": secret}),
        DocumentLimits::default(),
    )?;
    assert!(secret_report.contains(ValidationCode::FormatPropertyStringBytesOutOfRange));
    assert!(!format!("{secret_report:?}").contains("secret-link-label"));
    assert!(!secret_report.iter().any(|issue| issue.message().contains("secret-link-label")));

    let host_limited = validation_report(
        &schema,
        &json!({HREF_PROPERTY: "four"}),
        DocumentLimits::default()
            .with_max_property_string_bytes(3)
            .with_max_total_property_string_bytes(3),
    )?;
    assert!(host_limited.iter().any(|issue| {
        matches!(
            issue.detail(),
            ValidationDetail::Limit {
                kind: LimitKind::PropertyStringBytes | LimitKind::TotalPropertyStringBytes,
                ..
            }
        )
    }));
    Ok(())
}

#[test]
fn property_bearing_profiles_reject_generic_toggles_but_admit_exact_text_splices() -> TestResult {
    let contract = href_contract(2_048)?;
    let toggle = InlineFormatToggleSpecV1::new(
        name(LINK_FORMAT)?,
        ActionId::try_new("example/toggle-link")?,
        IntentId::try_new("example/format-link")?,
        BindingId::try_new("example/link-binding")?,
        ActionStateId::try_new("example/link-state")?,
    );
    let extension_owner = owner()?;
    let extensions = extension_set(manifest(contract.clone(), vec![toggle])?)?;
    assert_eq!(
        CompiledEditorProfile::try_compile_base_text_profile(
            schema_id("example/invalid-link-toggle-profile")?,
            extensions,
        )
        .err(),
        Some(ProfileCompilationError::InlineFormatToggleTargetHasProperties {
            owner: extension_owner,
            format_kind: name(LINK_FORMAT)?,
        })
    );

    let schema = schema_with_contract("example/link-splice-profile", contract)?;
    let limits = DocumentLimits::default();
    let codec = DocumentJsonCodecV2::new(schema.clone()).with_limits(limits.clone());
    let document = codec.decode(&document_json(&schema, &json!({HREF_PROPERTY: "x"})))?;
    let context = EditorContext::new(schema.clone(), limits);
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    let captured = TextSplice::capture(&context, &document, range.clone(), TextFragment::empty())?;
    assert_eq!(captured.range(), &range);
    assert_eq!(captured.expected_removed(), &TextFragment::empty());
    assert_eq!(captured.replacement(), &TextFragment::empty());
    Ok(())
}

#[test]
fn validation_reports_are_bounded_and_mark_truncation() -> TestResult {
    let schema = schema_with_contract("example/report-limit-profile", href_contract(2_048)?)?;
    let report_for_unknowns = |count| -> Result<ValidationReport, Box<dyn Error>> {
        let mut properties = serde_json::Map::new();
        properties.insert(HREF_PROPERTY.to_owned(), json!("x"));
        for index in 0..count {
            properties.insert(format!("example/unknown-{index:04}"), json!(true));
        }
        validation_report(
            &schema,
            &Value::Object(properties),
            DocumentLimits::default().with_max_properties_per_owner(2_000),
        )
    };
    let detailed_maximum = breditor_core::schema::MAX_VALIDATION_REPORT_ISSUES - 1;
    let exact_detailed = report_for_unknowns(detailed_maximum)?;
    assert_eq!(exact_detailed.issue_count(), detailed_maximum);
    assert!(!exact_detailed.iter().any(|issue| {
        issue.subject() == &ValidationSubject::Limit { kind: LimitKind::ValidationIssueCount }
    }));

    let first_excess = report_for_unknowns(detailed_maximum + 1)?;
    assert_eq!(first_excess.issue_count(), breditor_core::schema::MAX_VALIDATION_REPORT_ISSUES);
    assert!(first_excess.iter().any(|issue| {
        issue.subject() == &ValidationSubject::Limit { kind: LimitKind::ValidationIssueCount }
    }));
    Ok(())
}
