//! Boundary and fail-closed contracts for typed inline-format properties.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        DocumentJsonCodecV2, DocumentV2CodecError, EditorStateJsonCodecV2,
        EditorStateRecordErrorCode, EditorStateRecordLocation, EditorStateV2CodecError,
        RetainedResourceKind, SessionCheckpointCodecError, SessionCheckpointJsonCodecV2,
        SessionCheckpointLimits, SessionCheckpointResourceLimit, SessionCheckpointV2CodecError,
    },
    document::{
        Format, FormatSet, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, PropertyInteger, PropertyMap,
        PropertyValueKind, TextFragment,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionManifestError, ExtensionSet,
        ExtensionVersion, InlineFormatPropertyContractV1, InlineFormatPropertyContractV1Error,
        InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, InlineFormatSpecV1,
        MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
        MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{
        Operation, OperationApplyError, OperationKind, OperationValidationError, ParagraphJoin,
        ParagraphJoinApplyError, ParagraphSplit, ParagraphSplitApplyError, RootTextBoundary,
        RootTextRange, RootTextReplace, RootTextReplaceApplyError, TextRange, TextSplice,
        TextSpliceApplyError,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{
        CompiledSchema, DocumentLimits, IntegerRangeViolation, PersistedTypeRevision, SchemaId,
        SchemaVersion, ValidationCode, ValidationDetail, ValidationReport,
    },
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, EditorStateError, LineageId, PendingFormatError},
    transaction::{Transaction, TransactionApplyError},
};
use serde_json::{Value, json};
use support::{TestResult, test_error};

const LINK_FORMAT: &str = "example/link";
const HREF_PROPERTY: &str = "example/href";
const LABEL_PROPERTY: &str = "example/label";
const RANK_PROPERTY: &str = "example/rank";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn owner() -> Result<ExtensionId, Box<dyn Error>> {
    Ok(ExtensionId::new(name("example/typed-safety-extension")?, ExtensionVersion::try_new(1)?))
}

fn schema_id(value: &str) -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(name(value)?, SchemaVersion::try_new(1)?))
}

fn format_spec(kind: QualifiedName) -> InlineFormatSpecV1 {
    InlineFormatSpecV1::new(kind, PersistedTypeRevision::one())
}

fn property_spec(
    value: &str,
    presence: PropertyPresenceV1,
    value_type: InlineFormatPropertyTypeV1,
) -> Result<InlineFormatPropertySpecV1, Box<dyn Error>> {
    Ok(InlineFormatPropertySpecV1::new(name(value)?, presence, value_type))
}

fn complete_contract() -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
    Ok(InlineFormatPropertyContractV1::try_new(
        name(LINK_FORMAT)?,
        vec![
            property_spec(
                HREF_PROPERTY,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 4)?,
            )?,
            property_spec(
                LABEL_PROPERTY,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_string(0, 4)?,
            )?,
            property_spec(
                RANK_PROPERTY,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_integer(
                    Some(PropertyInteger::try_new(0)?),
                    Some(PropertyInteger::try_new(10)?),
                )?,
            )?,
        ],
    )?)
}

fn typed_schema(id: &str) -> Result<CompiledSchema, Box<dyn Error>> {
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        owner()?,
        Vec::new(),
        Vec::new(),
        vec![format_spec(name(LINK_FORMAT)?)],
        vec![complete_contract()?],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
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
                    "text": "x",
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
) -> Result<ValidationReport, Box<dyn Error>> {
    match DocumentJsonCodecV2::new(schema.clone()).decode(&document_json(schema, properties)) {
        Err(DocumentV2CodecError::Validation(report)) => Ok(report),
        Err(error) => Err(test_error(format!("expected validation report, got {error}")).into()),
        Ok(_) => Err(test_error("expected document validation to fail").into()),
    }
}

fn valid_document(
    schema: &CompiledSchema,
    properties: &Value,
) -> Result<breditor_core::document::Document, Box<dyn Error>> {
    DocumentJsonCodecV2::new(schema.clone())
        .decode(&document_json(schema, properties))
        .map_err(Into::into)
}

fn numbered_manifest_declarations(
    count: u32,
) -> Result<(Vec<InlineFormatSpecV1>, Vec<InlineFormatPropertyContractV1>), Box<dyn Error>> {
    let mut formats = Vec::with_capacity(usize::try_from(count)?);
    let mut contracts = Vec::with_capacity(usize::try_from(count)?);
    for index in 0..count {
        let kind = name(&format!("example/typed-{index}"))?;
        formats.push(format_spec(kind.clone()));
        contracts.push(InlineFormatPropertyContractV1::try_new(
            kind,
            vec![property_spec(
                "example/value",
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::boolean(),
            )?],
        )?);
    }
    Ok((formats, contracts))
}

#[test]
fn fixed_property_declaration_limits_accept_exactly_the_limit() -> TestResult {
    let exact_properties = (0..MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT)
        .map(|index| {
            property_spec(
                &format!("example/property-{index}"),
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::boolean(),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let accepted =
        InlineFormatPropertyContractV1::try_new(name(LINK_FORMAT)?, exact_properties.clone())?;
    assert_eq!(
        u32::try_from(accepted.properties().len())?,
        MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT
    );

    let mut overflow_properties = exact_properties;
    overflow_properties.push(property_spec(
        "example/property-overflow",
        PropertyPresenceV1::Optional,
        InlineFormatPropertyTypeV1::boolean(),
    )?);
    assert!(matches!(
        InlineFormatPropertyContractV1::try_new(name(LINK_FORMAT)?, overflow_properties),
        Err(InlineFormatPropertyContractV1Error::TooManyProperties {
            actual,
            maximum: MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT,
            ..
        }) if actual == MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT + 1
    ));

    let (formats, contracts) = numbered_manifest_declarations(
        MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
    )?;
    let accepted_manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        owner()?,
        Vec::new(),
        Vec::new(),
        formats.clone(),
        contracts.clone(),
    )?;
    assert_eq!(
        u32::try_from(accepted_manifest.inline_format_property_contracts().len())?,
        MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST
    );

    let mut overflow_contracts = contracts;
    overflow_contracts.push(overflow_contracts[0].clone());
    assert!(matches!(
        ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
            owner()?,
            Vec::new(),
            Vec::new(),
            formats,
            overflow_contracts,
        ),
        Err(ExtensionManifestError::TooManyInlineFormatPropertyContracts {
            actual,
            maximum: MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
            ..
        }) if actual == MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST + 1
    ));
    Ok(())
}

#[test]
fn global_integer_endpoints_have_one_canonical_contract_value() -> TestResult {
    let unconstrained = InlineFormatPropertyTypeV1::try_integer(None, None)?;
    let explicit_global = InlineFormatPropertyTypeV1::try_integer(
        Some(PropertyInteger::try_new(MIN_SAFE_INTEGER)?),
        Some(PropertyInteger::try_new(MAX_SAFE_INTEGER)?),
    )?;
    assert_eq!(explicit_global, unconstrained);

    let ten = PropertyInteger::try_new(10)?;
    let lower_global = InlineFormatPropertyTypeV1::try_integer(
        Some(PropertyInteger::try_new(MIN_SAFE_INTEGER)?),
        Some(ten),
    )?;
    let canonical_lower = InlineFormatPropertyTypeV1::try_integer(None, Some(ten))?;
    assert_eq!(lower_global, canonical_lower);
    Ok(())
}

#[test]
fn null_integer_and_utf8_boundaries_follow_the_declared_scalar_domains() -> TestResult {
    let schema = typed_schema("example/typed-boundaries")?;
    let codec = DocumentJsonCodecV2::new(schema.clone());

    let required_null = validation_report(&schema, &json!({HREF_PROPERTY: null}))?;
    assert!(required_null.iter().any(|issue| {
        issue.code() == ValidationCode::FormatPropertyTypeMismatch
            && issue.detail()
                == &ValidationDetail::FormatPropertyType {
                    expected: PropertyValueKind::String,
                    actual: PropertyValueKind::Null,
                }
    }));

    // Optional properties may be absent, and both inclusive integer endpoints are admitted.
    codec.decode(&document_json(&schema, &json!({HREF_PROPERTY: "x"})))?;
    codec.decode(&document_json(&schema, &json!({HREF_PROPERTY: "x", RANK_PROPERTY: 0})))?;
    codec.decode(&document_json(&schema, &json!({HREF_PROPERTY: "x", RANK_PROPERTY: 10})))?;

    let optional_null =
        validation_report(&schema, &json!({HREF_PROPERTY: "x", LABEL_PROPERTY: null}))?;
    assert!(optional_null.iter().any(|issue| {
        issue.code() == ValidationCode::FormatPropertyTypeMismatch
            && issue.detail()
                == &ValidationDetail::FormatPropertyType {
                    expected: PropertyValueKind::String,
                    actual: PropertyValueKind::Null,
                }
    }));

    let below = validation_report(&schema, &json!({HREF_PROPERTY: "x", RANK_PROPERTY: -1}))?;
    let zero = PropertyInteger::try_new(0)?;
    let ten = PropertyInteger::try_new(10)?;
    assert!(below.iter().any(|issue| {
        issue.detail()
            == &ValidationDetail::FormatPropertyIntegerRange {
                minimum: Some(zero),
                maximum: Some(ten),
                violation: IntegerRangeViolation::BelowMinimum,
            }
    }));

    // The bound is UTF-8 bytes: one non-BMP scalar is exactly four bytes.
    codec.decode(&document_json(&schema, &json!({HREF_PROPERTY: "😀"})))?;
    let five_bytes = validation_report(&schema, &json!({HREF_PROPERTY: "😀a"}))?;
    assert!(five_bytes.contains(ValidationCode::FormatPropertyStringBytesOutOfRange));
    Ok(())
}

fn all_base_operations() -> Result<Vec<Operation>, Box<dyn Error>> {
    let paragraph = NodePath::try_from_indices(vec![0])?;
    let empty = TextFragment::empty();
    let local_range = TextRange::try_new(paragraph.clone(), TextOffset::ZERO, TextOffset::ZERO)?;
    let root_boundary = RootTextBoundary::try_new(paragraph.clone(), TextOffset::ZERO)?;
    let root_range = RootTextRange::try_new(root_boundary.clone(), root_boundary)?;
    Ok(vec![
        TextSplice::try_new(local_range, empty.clone(), empty.clone())?.into(),
        ParagraphSplit::try_new(paragraph.clone(), TextOffset::ZERO, empty.clone())?.into(),
        ParagraphJoin::try_new(paragraph, empty.clone(), empty.clone())?.into(),
        RootTextReplace::try_new(root_range, vec![empty.clone()], vec![empty])?.into(),
    ])
}

#[test]
fn every_base_operation_and_transaction_fail_closed_for_a_typed_schema() -> TestResult {
    let schema = typed_schema("example/typed-operation-gate")?;
    let limits = DocumentLimits::default();
    let context = EditorContext::new(schema.clone(), limits);
    let document = valid_document(&schema, &json!({HREF_PROPERTY: "x"}))?;
    let state = EditorState::try_new(
        &context,
        LineageId::try_new("typed-operation-gate")?,
        document,
        None,
        None,
    )?;

    let operations = all_base_operations()?;
    let expected_kinds = [
        OperationKind::TextSplice,
        OperationKind::ParagraphSplit,
        OperationKind::ParagraphJoin,
        OperationKind::RootTextReplace,
    ];
    for (operation, expected_kind) in operations.iter().zip(expected_kinds) {
        assert_eq!(
            operation.validate(&context),
            Err(OperationValidationError::UnsupportedSchema {
                kind: expected_kind,
                schema: schema.id().clone(),
            })
        );
    }

    let expected_apply_errors = [
        OperationApplyError::TextSplice(TextSpliceApplyError::UnsupportedSchema {
            schema: schema.id().clone(),
        }),
        OperationApplyError::ParagraphSplit(ParagraphSplitApplyError::UnsupportedSchema {
            schema: schema.id().clone(),
        }),
        OperationApplyError::ParagraphJoin(ParagraphJoinApplyError::UnsupportedSchema {
            schema: schema.id().clone(),
        }),
        OperationApplyError::RootTextReplace(RootTextReplaceApplyError::UnsupportedSchema {
            schema: schema.id().clone(),
        }),
    ];
    for (operation, expected_error) in operations.iter().zip(expected_apply_errors) {
        let before = state.clone();
        let transaction = Transaction::new(&state, vec![operation.clone()]);
        assert_eq!(
            transaction.apply(&context, &state),
            Err(TransactionApplyError::Operation { operation_index: 0, source: expected_error })
        );
        assert_eq!(state, before, "a rejected transaction must not alter its base state");
    }
    Ok(())
}

#[test]
fn typed_formats_are_not_admitted_as_v1_pending_typing_state() -> TestResult {
    let schema = typed_schema("example/typed-pending-gate")?;
    let context = EditorContext::new(schema.clone(), DocumentLimits::default());
    let document = valid_document(&schema, &json!({HREF_PROPERTY: "x"}))?;
    let text_path = NodePath::try_from_indices(vec![0, 0])?;
    let point = Point::Text { text_path, utf16_offset: 0, affinity: Affinity::After };
    let selection: Selection = RangeSelection::new(point.clone(), point).into();
    let pending =
        FormatSet::try_from_formats(vec![Format::new(name(LINK_FORMAT)?, PropertyMap::default())])?;

    let valid_state = EditorState::try_new(
        &context,
        LineageId::try_new("typed-pending-codec-gate")?,
        document.clone(),
        Some(selection.clone()),
        None,
    )?;
    let state_codec = EditorStateJsonCodecV2::new(context.clone());
    let mut encoded = serde_json::from_str::<Value>(&state_codec.encode(&valid_state)?)?;
    encoded["pendingFormats"] = json!([{"type": LINK_FORMAT, "properties": {}}]);
    match state_codec.decode(&serde_json::to_string(&encoded)?) {
        Err(EditorStateV2CodecError::InvalidEditorState(source)) => {
            assert_eq!(source.code(), EditorStateRecordErrorCode::PendingFormatNotAllowed);
            assert_eq!(
                source.location(),
                EditorStateRecordLocation::PendingFormat { format_index: 0 }
            );
        }
        Err(error) => {
            return Err(test_error(format!(
                "expected typed pending-format rejection, got {error}"
            ))
            .into());
        }
        Ok(_) => return Err(test_error("typed pending format decoded through V2 state").into()),
    }

    assert_eq!(
        EditorState::try_new(
            &context,
            LineageId::try_new("typed-pending-gate")?,
            document,
            Some(selection),
            Some(pending),
        ),
        Err(EditorStateError::InvalidPendingFormats(
            PendingFormatError::PropertyBearingKindUnsupported { kind: name(LINK_FORMAT)? },
        ))
    );
    Ok(())
}

fn retained_limit_error(error: &SessionCheckpointV2CodecError, expected_maximum: u64) -> bool {
    matches!(
        error,
        SessionCheckpointV2CodecError::InvalidCheckpoint(source)
            if matches!(
                source.as_ref(),
                SessionCheckpointCodecError::ResourceLimit(
                    SessionCheckpointResourceLimit::Retained {
                        kind: RetainedResourceKind::PropertyStringBytes,
                        boundary_index: 0,
                        actual: 4,
                        maximum,
                    }
                ) if *maximum == expected_maximum
            )
    )
}

#[test]
fn session_checkpoint_property_string_budget_accepts_exactly_and_rejects_overflow() -> TestResult {
    let schema = typed_schema("example/typed-checkpoint-budget")?;
    let context = EditorContext::new(schema.clone(), DocumentLimits::default());
    let document = valid_document(&schema, &json!({HREF_PROPERTY: "😀"}))?;
    assert_eq!(document.summary().total_property_string_bytes(), 4);
    let state = EditorState::try_new(
        &context,
        LineageId::try_new("typed-checkpoint-budget")?,
        document,
        None,
        None,
    )?;
    let session = EditorSession::new(state);

    let exact_limits =
        SessionCheckpointLimits::default().with_max_retained_property_string_bytes(4);
    let exact_codec = SessionCheckpointJsonCodecV2::new(context.clone()).with_limits(exact_limits);
    let encoded = exact_codec.encode(&session)?;
    let restored = exact_codec.decode(&encoded)?;
    assert_eq!(restored.state(), session.state());

    let overflow_codec = SessionCheckpointJsonCodecV2::new(context)
        .with_limits(SessionCheckpointLimits::default().with_max_retained_property_string_bytes(3));
    let encode_error = overflow_codec
        .encode(&session)
        .err()
        .ok_or_else(|| test_error("checkpoint encode exceeded its budget but was accepted"))?;
    assert!(retained_limit_error(&encode_error, 3), "unexpected encode error: {encode_error}");

    let decode_error = overflow_codec
        .decode(&encoded)
        .err()
        .ok_or_else(|| test_error("checkpoint decode exceeded its budget but was accepted"))?;
    assert!(retained_limit_error(&decode_error, 3), "unexpected decode error: {decode_error}");
    Ok(())
}
