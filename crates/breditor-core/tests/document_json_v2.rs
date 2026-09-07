//! Public strictness, compatibility, and golden-vector tests for Document V2.

use std::{error::Error, io};

use breditor_core::{
    codec::{
        CodecErrorCode, DOCUMENT_FORMAT_VERSION, DOCUMENT_V2_FORMAT_VERSION, DocumentJsonCodec,
        DocumentJsonCodecV2, DocumentV2CodecError,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaBindingError, SchemaFingerprintParseError},
};

type TestResult = Result<(), Box<dyn Error>>;

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const DOCUMENT_PREFIX: &str = r#"{"format":"breditor/document","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":""#;
const DOCUMENT_SUFFIX: &str = concat!(
    r#"","root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}}"#,
);
const GOLDEN_DOCUMENT_V2: &str = concat!(
    r#"{"format":"breditor/document","formatVersion":2,"schema":{"name":"breditor/base","version":1},"schemaFingerprint":"sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173","root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}}"#,
);

fn document_with_fingerprint(fingerprint: &str) -> String {
    format!("{DOCUMENT_PREFIX}{fingerprint}{DOCUMENT_SUFFIX}")
}

fn rejected(codec: &DocumentJsonCodecV2, input: &str) -> Result<DocumentV2CodecError, io::Error> {
    match codec.decode(input) {
        Ok(_) => Err(io::Error::other("document V2 input unexpectedly decoded")),
        Err(error) => Ok(error),
    }
}

#[test]
fn golden_shape_and_field_order_are_exact() -> TestResult {
    let codec = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
    let document = codec.decode(GOLDEN_DOCUMENT_V2)?;

    assert_eq!(DOCUMENT_FORMAT_VERSION, 1);
    assert_eq!(DOCUMENT_V2_FORMAT_VERSION, 2);
    assert_eq!(codec.schema().fingerprint().to_string(), BASE_FINGERPRINT);
    assert_eq!(codec.encode(&document)?, GOLDEN_DOCUMENT_V2);
    assert_eq!(codec.decode(&codec.encode(&document)?)?, document);
    Ok(())
}

#[test]
fn v1_and_v2_entrypoints_do_not_mix_generations() -> TestResult {
    let v1 = DocumentJsonCodec::new(CompiledSchema::breditor_base());
    let v2 = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
    let v1_json = GOLDEN_DOCUMENT_V2
        .replacen("\"formatVersion\":2", "\"formatVersion\":1", 1)
        .replacen(&format!(",\"schemaFingerprint\":\"{BASE_FINGERPRINT}\""), "", 1);

    assert_eq!(v1.decode(&v1_json).and_then(|document| v1.encode(&document))?, v1_json);
    assert_eq!(rejected(&v2, &v1_json)?.code(), CodecErrorCode::UnsupportedFormatVersion);
    assert_eq!(
        v1.decode(GOLDEN_DOCUMENT_V2)
            .err()
            .ok_or_else(|| io::Error::other("V1 unexpectedly accepted V2"))?
            .code(),
        CodecErrorCode::UnsupportedFormatVersion
    );
    Ok(())
}

#[test]
fn malformed_fingerprint_text_has_typed_payload_free_failures() -> TestResult {
    let codec = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
    let cases = [
        (
            document_with_fingerprint(&BASE_FINGERPRINT[..BASE_FINGERPRINT.len() - 1]),
            SchemaFingerprintParseError::InvalidLength { actual: 70, expected: 71 },
        ),
        (
            document_with_fingerprint(&format!("{BASE_FINGERPRINT}0")),
            SchemaFingerprintParseError::InvalidLength { actual: 72, expected: 71 },
        ),
        (
            document_with_fingerprint(&BASE_FINGERPRINT.replacen("68a", "68A", 1)),
            SchemaFingerprintParseError::InvalidHexDigit { index: 9 },
        ),
        (
            document_with_fingerprint(&BASE_FINGERPRINT.replacen("68a", "68g", 1)),
            SchemaFingerprintParseError::InvalidHexDigit { index: 9 },
        ),
        (
            document_with_fingerprint(&BASE_FINGERPRINT.replacen("sha256:", "sha512:", 1)),
            SchemaFingerprintParseError::InvalidPrefix,
        ),
    ];

    for (input, expected) in cases {
        match rejected(&codec, &input)? {
            DocumentV2CodecError::InvalidSchemaFingerprint(found) => {
                assert_eq!(found, expected);
                assert_eq!(
                    DocumentV2CodecError::InvalidSchemaFingerprint(found).code(),
                    CodecErrorCode::InvalidSchemaFingerprint
                );
            }
            other => return Err(io::Error::other(format!("unexpected error: {other}")).into()),
        }
    }
    Ok(())
}

#[test]
fn missing_and_duplicate_fingerprint_fields_are_invalid_json() -> TestResult {
    let codec = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
    let field = format!(",\"schemaFingerprint\":\"{BASE_FINGERPRINT}\"");
    let missing = GOLDEN_DOCUMENT_V2.replacen(&field, "", 1);
    let duplicate = GOLDEN_DOCUMENT_V2.replacen(&field, &format!("{field}{field}"), 1);

    assert!(matches!(rejected(&codec, &missing)?, DocumentV2CodecError::InvalidJson(_)));
    assert!(matches!(rejected(&codec, &duplicate)?, DocumentV2CodecError::InvalidJson(_)));
    Ok(())
}

#[test]
fn parsed_fingerprint_mismatch_retains_both_identities() -> TestResult {
    let codec = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
    let other = document_with_fingerprint(
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    );

    match rejected(&codec, &other)? {
        DocumentV2CodecError::SchemaBinding(SchemaBindingError::SchemaFingerprintMismatch {
            expected,
            found,
        }) => {
            assert_eq!(expected, codec.schema().fingerprint());
            assert_ne!(found, expected);
        }
        other => return Err(io::Error::other(format!("unexpected error: {other}")).into()),
    }
    Ok(())
}

#[test]
fn v2_output_budget_is_checked_before_allocation_of_the_result_string() -> TestResult {
    let decoder = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
    let document = decoder.decode(GOLDEN_DOCUMENT_V2)?;
    let exact = DocumentJsonCodecV2::new(CompiledSchema::breditor_base())
        .with_limits(DocumentLimits::default().with_max_json_bytes(GOLDEN_DOCUMENT_V2.len()));
    let short = DocumentJsonCodecV2::new(CompiledSchema::breditor_base())
        .with_limits(DocumentLimits::default().with_max_json_bytes(GOLDEN_DOCUMENT_V2.len() - 1));

    assert_eq!(exact.encode(&document)?, GOLDEN_DOCUMENT_V2);
    assert!(matches!(short.encode(&document), Err(DocumentV2CodecError::OutputTooLarge { .. })));
    assert!(matches!(
        short.decode(GOLDEN_DOCUMENT_V2),
        Err(DocumentV2CodecError::InputTooLarge { .. })
    ));
    Ok(())
}
