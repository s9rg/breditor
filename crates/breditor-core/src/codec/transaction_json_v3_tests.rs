//! Transaction V3 property-persistence contract tests.

use std::{error::Error, fmt};

use serde_json::{Value, json};

use crate::{
    codec::{
        CodecErrorCode, TRANSACTION_REQUEST_V3_FORMAT_VERSION, TransactionJsonCodecV2,
        TransactionJsonCodecV3, TransactionV2CodecError, TransactionV3CodecError,
    },
    document::{
        Document, ElementNode, Format, FormatSet, NodeRef, PropertyMap, PropertyValue,
        TextFragment, TextRun,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
    transaction::{PendingFormatsUpdate, Transaction},
};

const FORMAT_KIND: &str = "example/highlight";
const PROPERTY_NAME: &str = "example/enabled";
const LINEAGE: &str = "transaction-v3-property-tests";

type TestResult = Result<(), Box<dyn Error>>;

fn test_error(message: impl Into<String>) -> Box<dyn Error> {
    #[derive(Debug)]
    struct Message(String);

    impl fmt::Display for Message {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str(&self.0)
        }
    }

    impl Error for Message {}

    Box::new(Message(message.into()))
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn optional_property_schema(id: &str) -> Result<CompiledSchema, Box<dyn Error>> {
    let format_kind = name(FORMAT_KIND)?;
    let contract = InlineFormatPropertyContractV1::try_new(
        format_kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name(PROPERTY_NAME)?,
            PropertyPresenceV1::Optional,
            InlineFormatPropertyTypeV1::boolean(),
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/transaction-v3-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(format_kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name(id)?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn formats(properties: PropertyMap) -> Result<FormatSet, Box<dyn Error>> {
    FormatSet::try_from_formats(vec![Format::new(name(FORMAT_KIND)?, properties)])
        .map_err(Into::into)
}

fn property_map(value: bool) -> Result<PropertyMap, Box<dyn Error>> {
    PropertyMap::try_from_sorted(vec![(name(PROPERTY_NAME)?, PropertyValue::boolean(value))])
        .map_err(Into::into)
}

fn insertion(properties: PropertyMap) -> Result<Operation, Box<dyn Error>> {
    let replacement =
        TextFragment::try_from_runs(vec![TextRun::try_new("x", formats(properties)?)?])?;
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    TextSplice::try_new(range, TextFragment::empty(), replacement)
        .map(Into::into)
        .map_err(Into::into)
}

fn stale_removal() -> Result<Operation, Box<dyn Error>> {
    let expected = TextFragment::try_from_runs(vec![TextRun::try_new("y", FormatSet::default())?])?;
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::try_new(1)?,
    )?;
    TextSplice::try_new(range, expected, TextFragment::empty()).map(Into::into).map_err(Into::into)
}

fn collapsed_selection() -> Result<Selection, Box<dyn Error>> {
    let parent_path = NodePath::try_from_indices(vec![0])?;
    let point = Point::Children { parent_path, child_index: 0, affinity: Affinity::After };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn state(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let paragraph =
        ElementNode::try_new(name("breditor/paragraph")?, None, PropertyMap::default(), Vec::new())
            .map(NodeRef::element)?;
    let root = ElementNode::try_new(
        name("breditor/document")?,
        None,
        PropertyMap::default(),
        vec![paragraph],
    )
    .map(NodeRef::element)?;
    let document = Document::try_new(context.schema(), root, context.limits())?;
    EditorState::try_new(
        context,
        LineageId::try_new(LINEAGE)?,
        document,
        Some(collapsed_selection()?),
        None,
    )
    .map_err(Into::into)
}

fn decode_error(
    codec: &TransactionJsonCodecV3,
    json: &str,
    base: &EditorState,
) -> Result<TransactionV3CodecError, Box<dyn Error>> {
    codec
        .decode(json, base)
        .err()
        .ok_or_else(|| test_error("invalid transaction V3 unexpectedly decoded"))
}

#[test]
fn typed_operation_and_pending_update_round_trip_and_apply_exactly() -> TestResult {
    assert_eq!(TRANSACTION_REQUEST_V3_FORMAT_VERSION, 3);
    let schema = optional_property_schema("example/transaction-v3-roundtrip")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let base = state(&context)?;
    let property_formats = formats(property_map(true)?)?;
    let transaction = Transaction::new(&base, vec![insertion(property_map(true)?)?])
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(property_formats)));
    let codec = TransactionJsonCodecV3::new(context.clone());
    assert_eq!(codec.context(), &context);

    let encoded = codec.encode(&transaction)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(
        value.pointer("/operations/0/replacement/runs/0/formats/0/properties/example~1enabled"),
        Some(&Value::Bool(true)),
    );
    assert_eq!(
        value.pointer("/pendingFormatsUpdate/formats/0/properties/example~1enabled"),
        Some(&Value::Bool(true)),
    );

    let decoded = codec.decode(&encoded, &base)?;
    assert_eq!(decoded, transaction);
    assert_eq!(codec.encode(&decoded)?, encoded);
    assert_eq!(decoded.apply(&context, &base)?, transaction.apply(&context, &base)?);
    Ok(())
}

#[test]
fn optional_only_format_is_preserved_in_v3_and_rejected_by_v2() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-optional-sentinel")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let base = state(&context)?;
    let transaction = Transaction::new(&base, vec![insertion(PropertyMap::default())?])
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats(
            PropertyMap::default(),
        )?)));

    let v3 = TransactionJsonCodecV3::new(context.clone());
    let encoded = v3.encode(&transaction)?;
    assert_eq!(v3.decode(&encoded, &base)?, transaction);
    assert!(encoded.matches(r#""properties":{}"#).count() >= 2);

    assert!(matches!(
        TransactionJsonCodecV2::new(context).encode(&transaction),
        Err(TransactionV2CodecError::OperationValidation { .. }
            | TransactionV2CodecError::InvalidTransaction(_))
    ));
    Ok(())
}

#[test]
fn operation_count_limit_precedes_materializing_the_first_excess_payload() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-count-limit")?;
    let context = EditorContext::new(schema, DocumentLimits::default())
        .with_max_operations_per_transaction(0);
    let base = state(&context)?;
    let codec = TransactionJsonCodecV3::new(context);
    let encoded = codec.encode(&Transaction::new(&base, Vec::new()))?;
    let mut envelope: Value = serde_json::from_str(&encoded)?;
    envelope["operations"] = json!([{
        "kind": "textSplice",
        "properties": {"SECRET INVALID": 9_007_199_254_740_992_u64}
    }]);
    let hostile = serde_json::to_string(&envelope)?;

    let error = decode_error(&codec, &hostile, &base)?;
    assert!(matches!(error, TransactionV3CodecError::OperationLimit { actual: 1, maximum: 0 }));
    let diagnostic = error.to_string();
    assert!(!diagnostic.contains("SECRET"));
    assert!(!diagnostic.contains("9007199254740992"));
    Ok(())
}

#[test]
fn aggregate_operation_preflight_scales_with_admitted_operation_slots() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-scaled-preflight")?;
    let limits =
        DocumentLimits::default().with_max_children_per_element(1).with_max_property_values(1);
    let context = EditorContext::new(schema, limits).with_max_operations_per_transaction(5);
    let base = state(&context)?;
    let operations = (0..5)
        .map(|_| insertion(property_map(true)?))
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    let transaction = Transaction::new(&base, operations);
    let codec = TransactionJsonCodecV3::new(context);
    let encoded = codec.encode(&transaction)?;
    assert_eq!(codec.decode(&encoded, &base)?, transaction);
    Ok(())
}

#[test]
fn pending_property_preflight_is_canonical_bounded_and_redacted() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-pending-hostile")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let base = state(&context)?;
    let transaction = Transaction::new(&base, Vec::new()).with_pending_formats_update(
        PendingFormatsUpdate::Set(Some(formats(property_map(true)?)?)),
    );
    let codec = TransactionJsonCodecV3::new(context);
    let valid = codec.encode(&transaction)?;
    let cases = [
        valid.replacen(&format!(r#""{PROPERTY_NAME}":true"#), r#""SECRET INVALID":true"#, 1),
        valid.replacen(
            &format!(r#""{PROPERTY_NAME}":true"#),
            &format!(r#""{PROPERTY_NAME}":true,"{PROPERTY_NAME}":false"#),
            1,
        ),
        valid.replacen(
            &format!(r#""{PROPERTY_NAME}":true"#),
            &format!(r#""{PROPERTY_NAME}":9007199254740992"#),
            1,
        ),
    ];
    for hostile in cases {
        let error = decode_error(&codec, &hostile, &base)?;
        assert_eq!(error.code(), CodecErrorCode::InvalidJson);
        let diagnostic = error.to_string();
        assert!(!diagnostic.contains("SECRET"));
        assert!(!diagnostic.contains("9007199254740992"));
        assert!(!diagnostic.contains(PROPERTY_NAME));
    }

    let limited_context = EditorContext::new(
        codec.context().schema().clone(),
        DocumentLimits::default().with_max_property_values(0),
    );
    let limited_base = state(&limited_context)?;
    let limited = TransactionJsonCodecV3::new(limited_context);
    assert!(matches!(
        limited.decode(&valid, &limited_base),
        Err(TransactionV3CodecError::InvalidJson(_))
    ));
    Ok(())
}

#[test]
fn operation_sequence_property_preflight_is_canonical_and_redacted() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-operation-hostile")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let base = state(&context)?;
    let transaction = Transaction::new(&base, vec![insertion(property_map(true)?)?]);
    let codec = TransactionJsonCodecV3::new(context);
    let valid = codec.encode(&transaction)?;
    let cases = [
        valid.replacen(&format!(r#""{PROPERTY_NAME}":true"#), r#""SECRET INVALID":true"#, 1),
        valid.replacen(
            &format!(r#""{PROPERTY_NAME}":true"#),
            &format!(r#""{PROPERTY_NAME}":true,"{PROPERTY_NAME}":false"#),
            1,
        ),
        valid.replacen(
            &format!(r#""{PROPERTY_NAME}":true"#),
            &format!(r#""{PROPERTY_NAME}":9007199254740992"#),
            1,
        ),
    ];
    for hostile in cases {
        let error = decode_error(&codec, &hostile, &base)?;
        assert_eq!(error.code(), CodecErrorCode::InvalidJson);
        let diagnostic = error.to_string();
        assert!(!diagnostic.contains("SECRET"));
        assert!(!diagnostic.contains("9007199254740992"));
        assert!(!diagnostic.contains(PROPERTY_NAME));
    }
    Ok(())
}

#[test]
fn exact_byte_limits_and_binding_snapshot_and_context_mismatches_are_typed() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-boundaries")?;
    let source_context = EditorContext::new(schema.clone(), DocumentLimits::default());
    let source_base = state(&source_context)?;
    let source_transaction = Transaction::new(&source_base, vec![insertion(property_map(true)?)?]);
    let source = TransactionJsonCodecV3::new(source_context);
    let encoded = source.encode(&source_transaction)?;

    let exact_context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    );
    let exact_base = state(&exact_context)?;
    let exact_transaction = Transaction::new(&exact_base, vec![insertion(property_map(true)?)?]);
    let exact = TransactionJsonCodecV3::new(exact_context);
    assert_eq!(exact.encode(&exact_transaction)?, encoded);
    assert_eq!(exact.decode(&encoded, &exact_base)?, exact_transaction);

    let limited_context = EditorContext::new(
        schema,
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    );
    let limited_base = state(&limited_context)?;
    let limited_transaction =
        Transaction::new(&limited_base, vec![insertion(property_map(true)?)?]);
    let limited = TransactionJsonCodecV3::new(limited_context);
    assert!(matches!(
        limited.decode(&encoded, &limited_base),
        Err(TransactionV3CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(
        limited.encode(&limited_transaction),
        Err(TransactionV3CodecError::OutputTooLarge { .. })
    ));

    let mismatched_context = EditorContext::new(
        optional_property_schema("example/transaction-v3-boundaries")?,
        DocumentLimits::default(),
    );
    let mismatched_base = state(&mismatched_context)?;
    assert!(matches!(
        source.decode(&encoded, &mismatched_base),
        Err(TransactionV3CodecError::ContextConfigurationMismatch)
    ));

    let wrong_schema =
        encoded.replacen("example/transaction-v3-boundaries", "example/transaction-v3-wrong", 1);
    assert_eq!(
        decode_error(&source, &wrong_schema, &source_base)?.code(),
        CodecErrorCode::SchemaMismatch,
    );
    let wrong_fingerprint = encoded.replacen(
        &source.context().schema().fingerprint().to_string(),
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        1,
    );
    assert_eq!(
        decode_error(&source, &wrong_fingerprint, &source_base)?.code(),
        CodecErrorCode::SchemaMismatch,
    );
    let wrong_snapshot = encoded.replacen(
        &format!(r#""lineage":"{LINEAGE}""#),
        r#""lineage":"transaction-v3-other""#,
        1,
    );
    assert_eq!(
        decode_error(&source, &wrong_snapshot, &source_base)?.code(),
        CodecErrorCode::SnapshotMismatch,
    );
    Ok(())
}

#[test]
fn decoded_multi_operation_failure_cannot_publish_partial_state() -> TestResult {
    let schema = optional_property_schema("example/transaction-v3-atomic")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let base = state(&context)?;
    let original = base.clone();
    let transaction =
        Transaction::new(&base, vec![insertion(property_map(true)?)?, stale_removal()?]);
    let codec = TransactionJsonCodecV3::new(context.clone());
    let decoded = codec.decode(&codec.encode(&transaction)?, &base)?;
    assert!(decoded.apply(&context, &base).is_err());
    assert_eq!(base, original);
    Ok(())
}
