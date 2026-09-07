use std::error::Error;

use crate::{
    codec::{
        CodecErrorCode, OperationJsonCodecV2, TRANSACTION_REQUEST_FORMAT_VERSION,
        TRANSACTION_REQUEST_V2_FORMAT_VERSION, TransactionCodecError, TransactionJsonCodec,
        TransactionJsonCodecV2, TransactionV2CodecError,
    },
    document::{Document, ElementNode, NodeRef, PropertyMap},
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    state::{EditorContext, EditorState, LineageId},
    transaction::Transaction,
};

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const TRANSACTION_V1: &str = r#"{"format":"breditor/transaction-request","formatVersion":1,"schema":{"name":"breditor/base","version":1},"baseSnapshot":{"lineage":"transaction-v2-golden","revision":"0"},"operations":[],"selectionRelocation":{"anchor":"reject","focus":"reject"},"selectionUpdate":{"kind":"relocate"},"pendingFormatsUpdate":{"kind":"preserve"},"metadata":{"action":null,"history":{"kind":"record"}}}"#;
const TRANSACTION_V2: &str = r#"{"format":"breditor/transaction-request","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","baseSnapshot":{"lineage":"transaction-v2-golden","revision":"0"},"operations":[],"selectionRelocation":{"anchor":"reject","focus":"reject"},"selectionUpdate":{"kind":"relocate"},"pendingFormatsUpdate":{"kind":"preserve"},"metadata":{"action":null,"history":{"kind":"record"}}}"#;

type TestResult = Result<(), Box<dyn Error>>;

fn empty_paragraph() -> Result<NodeRef, Box<dyn Error>> {
    ElementNode::try_new(
        QualifiedName::from_known_static("breditor/paragraph"),
        None,
        PropertyMap::default(),
        Vec::new(),
    )
    .map(NodeRef::element)
    .map_err(Into::into)
}

fn state(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let root = ElementNode::try_new(
        QualifiedName::from_known_static("breditor/document"),
        None,
        PropertyMap::default(),
        vec![empty_paragraph()?, empty_paragraph()?],
    )
    .map(NodeRef::element)?;
    let document = Document::try_new(context.schema(), root, context.limits())?;
    EditorState::try_new(
        context,
        LineageId::try_new("transaction-v2-golden")?,
        document,
        None,
        None,
    )
    .map_err(Into::into)
}

fn decode_error(
    codec: &TransactionJsonCodecV2,
    json: &str,
    base: &EditorState,
) -> Result<TransactionV2CodecError, Box<dyn Error>> {
    match codec.decode(json, base) {
        Ok(_) => Err("invalid transaction V2 unexpectedly decoded".into()),
        Err(error) => Ok(error),
    }
}

#[test]
fn zero_operation_base_golden_is_exact_and_generations_never_mix() -> TestResult {
    assert_eq!(TRANSACTION_REQUEST_FORMAT_VERSION, 1);
    assert_eq!(TRANSACTION_REQUEST_V2_FORMAT_VERSION, 2);

    let context = EditorContext::default();
    let base = state(&context)?;
    let transaction = Transaction::new(&base, Vec::new());
    let v1 = TransactionJsonCodec::new(context.clone());
    let v2 = TransactionJsonCodecV2::new(context.clone());
    assert_eq!(v2.context(), &context);
    assert_eq!(v1.encode(&transaction)?, TRANSACTION_V1);
    assert_eq!(v2.encode(&transaction)?, TRANSACTION_V2);
    assert_eq!(v2.decode(TRANSACTION_V2, &base)?, transaction);

    assert!(matches!(
        v1.decode(TRANSACTION_V2, &base),
        Err(TransactionCodecError::UnsupportedFormatVersion { found: 2, supported: 1 })
    ));
    assert!(matches!(
        v2.decode(TRANSACTION_V1, &base),
        Err(TransactionV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 })
    ));

    let operation = OperationJsonCodecV2::new(context.clone()).decode(
        r#"{"format":"breditor/operation","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","operation":{"kind":"paragraphSplit","paragraphPath":[0],"offset":0,"expected":{"runs":[]}}}"#,
    )?;
    let operation_transaction = Transaction::new(&base, vec![operation]);
    let operation_json = v2.encode(&operation_transaction)?;
    let operation_record: serde_json::Value = serde_json::from_str(&operation_json)?;
    assert_eq!(
        operation_record.pointer("/operations/0/kind"),
        Some(&serde_json::Value::String("paragraphSplit".to_owned()))
    );
    assert!(operation_record.pointer("/operations/0/format").is_none());
    assert!(operation_record.pointer("/operations/0/schemaFingerprint").is_none());
    assert_eq!(v2.decode(&operation_json, &base)?, operation_transaction);
    Ok(())
}

#[test]
fn strict_binding_shape_and_error_categories_are_stable() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context)?;
    let codec = TransactionJsonCodecV2::new(context);

    let missing =
        TRANSACTION_V2.replace(&format!(",\"schemaFingerprint\":\"{BASE_FINGERPRINT}\""), "");
    assert_eq!(decode_error(&codec, &missing, &base)?.code(), CodecErrorCode::InvalidJson);
    let wrong_format =
        missing.replacen("breditor/transaction-request", "example/transaction-request", 1);
    assert!(matches!(
        decode_error(&codec, &wrong_format, &base)?,
        TransactionV2CodecError::UnsupportedFormat { .. }
    ));
    let wrong_version = missing.replacen("\"formatVersion\":2", "\"formatVersion\":3", 1);
    assert!(matches!(
        decode_error(&codec, &wrong_version, &base)?,
        TransactionV2CodecError::UnsupportedFormatVersion { found: 3, supported: 2 }
    ));

    let malformed = TRANSACTION_V2.replacen(
        BASE_FINGERPRINT,
        "sha256:68Aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
        1,
    );
    assert!(matches!(
        decode_error(&codec, &malformed, &base)?,
        TransactionV2CodecError::InvalidSchemaFingerprint(_)
    ));

    let wrong_fingerprint = TRANSACTION_V2.replacen(
        BASE_FINGERPRINT,
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        1,
    );
    assert!(matches!(
        decode_error(&codec, &wrong_fingerprint, &base)?,
        TransactionV2CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        )
    ));

    let wrong_schema = TRANSACTION_V2.replacen("breditor/base", "example/base", 1);
    assert!(matches!(
        decode_error(&codec, &wrong_schema, &base)?,
        TransactionV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));
    let wrong_schema_and_malformed_fingerprint =
        wrong_schema.replacen(BASE_FINGERPRINT, &BASE_FINGERPRINT.to_uppercase(), 1);
    assert!(matches!(
        decode_error(&codec, &wrong_schema_and_malformed_fingerprint, &base)?,
        TransactionV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));

    let duplicate = TRANSACTION_V2.replacen(
        "\"schemaFingerprint\":",
        &format!("\"schemaFingerprint\":\"{BASE_FINGERPRINT}\",\"schemaFingerprint\":"),
        1,
    );
    assert_eq!(decode_error(&codec, &duplicate, &base)?.code(), CodecErrorCode::InvalidJson);

    let unknown =
        TRANSACTION_V2.replacen(",\"baseSnapshot\":", ",\"unknown\":null,\"baseSnapshot\":", 1);
    assert_eq!(decode_error(&codec, &unknown, &base)?.code(), CodecErrorCode::InvalidJson);
    Ok(())
}

#[test]
fn independent_equal_proofs_and_exact_byte_limits_are_supported() -> TestResult {
    let source_context = EditorContext::default();
    let source_base = state(&source_context)?;
    let source_codec = TransactionJsonCodecV2::new(source_context);
    let encoded = source_codec.encode(&Transaction::new(&source_base, Vec::new()))?;

    let target_context = EditorContext::default();
    let target_base = state(&target_context)?;
    let target_codec = TransactionJsonCodecV2::new(target_context);
    let decoded = target_codec.decode(&encoded, &target_base)?;
    assert!(decoded.operations().is_empty());
    assert_eq!(target_codec.encode(&decoded)?, encoded);

    let exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(TRANSACTION_V2.len()),
    );
    let exact_base = state(&exact_context)?;
    let exact_transaction = Transaction::new(&exact_base, Vec::new());
    let exact = TransactionJsonCodecV2::new(exact_context);
    assert_eq!(exact.encode(&exact_transaction)?, TRANSACTION_V2);
    assert_eq!(exact.decode(TRANSACTION_V2, &exact_base)?, exact_transaction);

    let limited_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(TRANSACTION_V2.len() - 1),
    );
    let limited_base = state(&limited_context)?;
    let limited_transaction = Transaction::new(&limited_base, Vec::new());
    let limited = TransactionJsonCodecV2::new(limited_context);
    assert!(matches!(
        limited.decode(TRANSACTION_V2, &limited_base),
        Err(TransactionV2CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(
        limited.encode(&limited_transaction),
        Err(TransactionV2CodecError::OutputTooLarge { .. })
    ));
    Ok(())
}

#[test]
fn zero_operation_variant_closes_v1_hole_but_round_trips_in_v2() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::test_semantic_variant_same_id(),
        DocumentLimits::default(),
    );
    let base = state(&context)?;
    let transaction = Transaction::new(&base, Vec::new());

    let v1 = TransactionJsonCodec::new(context.clone());
    assert!(matches!(
        v1.decode(TRANSACTION_V1, &base),
        Err(TransactionCodecError::SchemaMismatch { .. })
    ));
    assert!(matches!(v1.encode(&transaction), Err(TransactionCodecError::SchemaMismatch { .. })));

    let v2 = TransactionJsonCodecV2::new(context);
    let encoded = v2.encode(&transaction)?;
    assert!(encoded.contains(&v2.context().schema().fingerprint().to_string()));
    let decoded = v2.decode(&encoded, &base)?;
    assert!(decoded.operations().is_empty());
    assert_eq!(v2.encode(&decoded)?, encoded);
    Ok(())
}
