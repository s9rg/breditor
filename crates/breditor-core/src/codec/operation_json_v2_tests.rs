use std::error::Error;

use crate::{
    codec::{
        CodecErrorCode, OPERATION_FORMAT_VERSION, OPERATION_V2_FORMAT_VERSION, OperationCodecError,
        OperationJsonCodec, OperationJsonCodecV2, OperationV2CodecError,
    },
    identity::QualifiedNameError,
    operation::{Operation, OperationValidationError},
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    state::EditorContext,
};

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const OPERATION_V1: &str = r#"{"format":"breditor/operation","formatVersion":1,"schema":{"name":"breditor/base","version":1},"operation":{"kind":"paragraphSplit","paragraphPath":[0],"offset":0,"expected":{"runs":[]}}}"#;
const OPERATION_V2: &str = r#"{"format":"breditor/operation","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","operation":{"kind":"paragraphSplit","paragraphPath":[0],"offset":0,"expected":{"runs":[]}}}"#;

type TestResult = Result<(), Box<dyn Error>>;

fn decode_error(
    codec: &OperationJsonCodecV2,
    json: &str,
) -> Result<OperationV2CodecError, Box<dyn Error>> {
    match codec.decode(json) {
        Ok(_) => Err("invalid operation V2 unexpectedly decoded".into()),
        Err(error) => Ok(error),
    }
}

#[test]
fn base_golden_is_exact_and_generations_never_mix() -> TestResult {
    assert_eq!(OPERATION_FORMAT_VERSION, 1);
    assert_eq!(OPERATION_V2_FORMAT_VERSION, 2);

    let context = EditorContext::default();
    let v1 = OperationJsonCodec::new(context.clone());
    let v2 = OperationJsonCodecV2::new(context.clone());
    assert_eq!(v2.context(), &context);

    let operation = v2.decode(OPERATION_V2)?;
    assert_eq!(v2.encode(&operation)?, OPERATION_V2);
    assert_eq!(v1.encode(&operation)?, OPERATION_V1);

    assert!(matches!(
        v1.decode(OPERATION_V2),
        Err(OperationCodecError::UnsupportedFormatVersion { found: 2, supported: 1 })
    ));
    assert!(matches!(
        v2.decode(OPERATION_V1),
        Err(OperationV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 })
    ));
    Ok(())
}

#[test]
fn strict_binding_shape_and_error_categories_are_stable() -> TestResult {
    let codec = OperationJsonCodecV2::new(EditorContext::default());

    let missing =
        OPERATION_V2.replace(&format!(",\"schemaFingerprint\":\"{BASE_FINGERPRINT}\""), "");
    assert_eq!(decode_error(&codec, &missing)?.code(), CodecErrorCode::InvalidJson);
    let wrong_format = missing.replacen("breditor/operation", "example/operation", 1);
    assert!(matches!(
        decode_error(&codec, &wrong_format)?,
        OperationV2CodecError::UnsupportedFormat { .. }
    ));
    let wrong_version = missing.replacen("\"formatVersion\":2", "\"formatVersion\":3", 1);
    assert!(matches!(
        decode_error(&codec, &wrong_version)?,
        OperationV2CodecError::UnsupportedFormatVersion { found: 3, supported: 2 }
    ));

    let malformed = OPERATION_V2.replacen(BASE_FINGERPRINT, &BASE_FINGERPRINT.to_uppercase(), 1);
    assert!(matches!(
        decode_error(&codec, &malformed)?,
        OperationV2CodecError::InvalidSchemaFingerprint(_)
    ));

    let wrong_fingerprint = OPERATION_V2.replacen(
        BASE_FINGERPRINT,
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        1,
    );
    assert!(matches!(
        decode_error(&codec, &wrong_fingerprint)?,
        OperationV2CodecError::SchemaBinding(SchemaBindingError::SchemaFingerprintMismatch { .. })
    ));

    let wrong_schema = OPERATION_V2.replacen("breditor/base", "example/base", 1);
    assert!(matches!(
        decode_error(&codec, &wrong_schema)?,
        OperationV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));
    let wrong_schema_and_malformed_fingerprint =
        wrong_schema.replacen(BASE_FINGERPRINT, &BASE_FINGERPRINT.to_uppercase(), 1);
    assert!(matches!(
        decode_error(&codec, &wrong_schema_and_malformed_fingerprint)?,
        OperationV2CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));

    let control_character = OPERATION_V2.replacen("breditor/base", r"breditor/ba\nse", 1);
    let error = decode_error(&codec, &control_character)?;
    assert!(matches!(
        error.source(),
        Some(source)
            if matches!(
                source.downcast_ref::<QualifiedNameError>(),
                Some(QualifiedNameError::InvalidCharacter { character: '\n', .. })
            )
    ));
    let diagnostic = error.to_string();
    assert!(diagnostic.contains(r"'\n'"));
    assert!(!diagnostic.contains('\n'));
    assert!(!diagnostic.contains('\r'));

    let duplicate = OPERATION_V2.replacen(
        "\"schemaFingerprint\":",
        &format!("\"schemaFingerprint\":\"{BASE_FINGERPRINT}\",\"schemaFingerprint\":"),
        1,
    );
    assert_eq!(decode_error(&codec, &duplicate)?.code(), CodecErrorCode::InvalidJson);

    let unknown = OPERATION_V2.replacen(",\"operation\":", ",\"unknown\":null,\"operation\":", 1);
    assert_eq!(decode_error(&codec, &unknown)?.code(), CodecErrorCode::InvalidJson);
    Ok(())
}

#[test]
fn independent_equal_proofs_and_exact_byte_limits_are_supported() -> TestResult {
    let source = OperationJsonCodecV2::new(EditorContext::default());
    let operation = source.decode(OPERATION_V2)?;
    let target = OperationJsonCodecV2::new(EditorContext::default());
    assert_eq!(target.decode(&source.encode(&operation)?)?, operation);

    let exact = OperationJsonCodecV2::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(OPERATION_V2.len()),
    ));
    assert_eq!(exact.decode(OPERATION_V2)?, operation);
    assert_eq!(exact.encode(&operation)?, OPERATION_V2);

    let limited = OperationJsonCodecV2::new(EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(OPERATION_V2.len() - 1),
    ));
    assert!(matches!(
        limited.decode(OPERATION_V2),
        Err(OperationV2CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(
        limited.encode(&operation),
        Err(OperationV2CodecError::OutputTooLarge { minimum, maximum })
            if minimum > maximum && maximum == OPERATION_V2.len() - 1
    ));
    Ok(())
}

#[test]
fn v1_closes_same_id_schema_hole_and_v2_does_not_weaken_operation_validation() -> TestResult {
    let operation: Operation =
        OperationJsonCodecV2::new(EditorContext::default()).decode(OPERATION_V2)?;
    let variant_context = EditorContext::new(
        CompiledSchema::test_semantic_variant_same_id(),
        DocumentLimits::default(),
    );
    let v1 = OperationJsonCodec::new(variant_context.clone());
    assert!(matches!(v1.decode(OPERATION_V1), Err(OperationCodecError::SchemaMismatch { .. })));
    assert!(matches!(v1.encode(&operation), Err(OperationCodecError::SchemaMismatch { .. })));

    let v2 = OperationJsonCodecV2::new(variant_context);
    let variant_json = OPERATION_V2.replacen(
        BASE_FINGERPRINT,
        &v2.context().schema().fingerprint().to_string(),
        1,
    );
    assert!(matches!(
        v2.decode(&variant_json),
        Err(OperationV2CodecError::Validation(OperationValidationError::UnsupportedSchema { .. }))
    ));
    assert!(matches!(
        v2.encode(&operation),
        Err(OperationV2CodecError::Validation(OperationValidationError::UnsupportedSchema { .. }))
    ));
    Ok(())
}
