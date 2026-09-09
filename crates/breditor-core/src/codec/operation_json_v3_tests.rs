use std::{error::Error, fmt};

use serde_json::{Value, json};

use crate::{
    codec::{
        CodecErrorCode, CommitJsonCodecV2, OPERATION_V3_FORMAT_VERSION, OperationCodecError,
        OperationJsonCodec, OperationJsonCodecV2, OperationJsonCodecV3, OperationV2CodecError,
        OperationV3CodecError, SessionCheckpointJsonCodecV2, TransactionJsonCodecV2,
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
    operation::{Operation, OperationValidationError, TextRange, TextSplice},
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::Transaction,
};

const FORMAT_KIND: &str = "example/highlight";
const PROPERTY_NAME: &str = "example/enabled";

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
        ExtensionId::new(name("example/operation-v3-extension")?, ExtensionVersion::try_new(1)?),
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

fn insertion(properties: PropertyMap) -> Result<Operation, Box<dyn Error>> {
    let formats = FormatSet::try_from_formats(vec![Format::new(name(FORMAT_KIND)?, properties)])?;
    let replacement = TextFragment::try_from_runs(vec![TextRun::try_new("x", formats)?])?;
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    TextSplice::try_new(range, TextFragment::empty(), replacement)
        .map(Into::into)
        .map_err(Into::into)
}

fn property_insertion(value: bool) -> Result<Operation, Box<dyn Error>> {
    insertion(PropertyMap::try_from_sorted(vec![(
        name(PROPERTY_NAME)?,
        PropertyValue::boolean(value),
    )])?)
}

fn empty_state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
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
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn decode_error(
    codec: &OperationJsonCodecV3,
    json: &str,
) -> Result<OperationV3CodecError, Box<dyn Error>> {
    codec.decode(json).err().ok_or_else(|| test_error("invalid operation V3 unexpectedly decoded"))
}

#[test]
fn optional_property_round_trips_without_loss_and_is_byte_stable() -> TestResult {
    assert_eq!(OPERATION_V3_FORMAT_VERSION, 3);
    let schema = optional_property_schema("example/operation-v3")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let codec = OperationJsonCodecV3::new(context.clone());
    assert_eq!(codec.context(), &context);
    let operation = property_insertion(true)?;

    let encoded = codec.encode(&operation)?;
    let expected = format!(
        r#"{{"format":"breditor/operation","formatVersion":3,"schema":{{"name":"example/operation-v3","version":1}},"schemaFingerprint":"{}","operation":{{"kind":"textSplice","range":{{"containerPath":[0],"start":0,"end":0}},"expectedRemoved":{{"runs":[]}},"replacement":{{"runs":[{{"text":"x","formats":[{{"type":"example/highlight","properties":{{"example/enabled":true}}}}]}}]}}}}}}"#,
        context.schema().fingerprint(),
    );
    assert_eq!(encoded, expected);
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(
        value["operation"]["replacement"]["runs"][0]["formats"][0]["properties"][PROPERTY_NAME],
        Value::Bool(true),
    );
    let decoded = codec.decode(&encoded)?;
    assert_eq!(decoded, operation);
    assert_eq!(codec.encode(&decoded)?, encoded);
    Ok(())
}

#[test]
fn legacy_v1_and_v2_fail_closed_for_an_optional_only_property_contract() -> TestResult {
    let schema = optional_property_schema("example/legacy-optional-sentinel")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let operation = insertion(PropertyMap::default())?;
    assert_eq!(operation.validate(&context), Ok(()));

    assert!(matches!(
        OperationJsonCodec::new(context.clone()).encode(&operation),
        Err(OperationCodecError::SchemaMismatch { .. })
    ));
    assert!(matches!(
        OperationJsonCodecV2::new(context.clone()).encode(&operation),
        Err(OperationV2CodecError::Validation(OperationValidationError::UnsupportedSchema { .. }))
    ));

    let v3 = OperationJsonCodecV3::new(context.clone()).encode(&operation)?;
    let v2 = v3.replacen("\"formatVersion\":3", "\"formatVersion\":2", 1);
    assert!(matches!(
        OperationJsonCodecV2::new(context).decode(&v2),
        Err(OperationV2CodecError::Validation(OperationValidationError::UnsupportedSchema { .. }))
    ));
    Ok(())
}

#[test]
fn legacy_composed_encoders_never_project_property_operations() -> TestResult {
    let schema = optional_property_schema("example/legacy-composed-sentinel")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let before = empty_state(&context, "legacy-composed-sentinel")?;
    let legacy_codec = TransactionJsonCodecV2::new(context.clone());
    let mut legacy_json: Value =
        serde_json::from_str(&legacy_codec.encode(&Transaction::new(&before, Vec::new()))?)?;
    let empty_property_operation = insertion(PropertyMap::default())?;
    let operation_v3: Value = serde_json::from_str(
        &OperationJsonCodecV3::new(context.clone()).encode(&empty_property_operation)?,
    )?;
    legacy_json["operations"] = json!([operation_v3["operation"].clone()]);
    assert!(matches!(
        legacy_codec.decode(&serde_json::to_string(&legacy_json)?, &before),
        Err(crate::codec::TransactionV2CodecError::OperationValidation { .. })
    ));

    let transaction = Transaction::new(&before, vec![property_insertion(true)?]);

    let Err(transaction_error) = legacy_codec.encode(&transaction) else {
        return Err(test_error(
            "transaction V2 projected a typed operation instead of rejecting it",
        ));
    };
    assert_eq!(transaction_error.code(), CodecErrorCode::ValidationFailed);

    let commit = transaction
        .apply(&context, &before)?
        .into_commit()
        .ok_or_else(|| test_error("property insertion unexpectedly produced no commit"))?;
    let Err(commit_error) = CommitJsonCodecV2::new(context.clone()).encode(&commit) else {
        return Err(test_error("commit V2 projected a typed operation instead of rejecting it"));
    };
    assert_eq!(commit_error.code(), CodecErrorCode::ValidationFailed);

    let mut session = EditorSession::new(before);
    session.apply_transaction(&transaction)?;
    let Err(checkpoint_error) = SessionCheckpointJsonCodecV2::new(context).encode(&session) else {
        return Err(test_error(
            "checkpoint V2 projected a typed history operation instead of rejecting it",
        ));
    };
    assert_eq!(checkpoint_error.code(), CodecErrorCode::ValidationFailed);
    Ok(())
}

#[test]
fn property_preflight_owns_key_order_grammar_and_number_diagnostics() -> TestResult {
    let schema = optional_property_schema("example/operation-v3-hostile")?;
    let codec = OperationJsonCodecV3::new(EditorContext::new(schema, DocumentLimits::default()));
    let valid = codec.encode(&property_insertion(true)?)?;

    let cases = [
        valid.replacen(&format!("\"{PROPERTY_NAME}\":true"), "\"SECRET INVALID\":true", 1),
        valid.replacen(
            &format!("\"{PROPERTY_NAME}\":true"),
            &format!("\"{PROPERTY_NAME}\":true,\"{PROPERTY_NAME}\":false"),
            1,
        ),
        valid.replacen(
            &format!("\"{PROPERTY_NAME}\":true"),
            "\"example/z\":true,\"example/a\":false",
            1,
        ),
        valid.replacen(
            &format!("\"{PROPERTY_NAME}\":true"),
            &format!("\"{PROPERTY_NAME}\":{{\"SECRET INVALID\":true}}"),
            1,
        ),
        valid.replacen(
            &format!("\"{PROPERTY_NAME}\":true"),
            &format!("\"{PROPERTY_NAME}\":9007199254740992"),
            1,
        ),
        valid.replacen(
            &format!("\"{PROPERTY_NAME}\":true"),
            &format!("\"{PROPERTY_NAME}\":1.5"),
            1,
        ),
        valid.replacen(
            &format!("\"properties\":{{\"{PROPERTY_NAME}\":true}}"),
            "\"properties\":true",
            1,
        ),
    ];

    for hostile in cases {
        let error = decode_error(&codec, &hostile)?;
        assert_eq!(error.code(), CodecErrorCode::InvalidJson);
        let diagnostic = error.to_string();
        assert!(!diagnostic.contains("SECRET"));
        assert!(!diagnostic.contains("9007199254740992"));
    }
    Ok(())
}

#[test]
fn preflight_limits_run_before_schema_validation_and_owned_property_records() -> TestResult {
    let schema = optional_property_schema("example/operation-v3-limits")?;
    let source =
        OperationJsonCodecV3::new(EditorContext::new(schema.clone(), DocumentLimits::default()));
    let valid = source.encode(&property_insertion(true)?)?;

    let string_payload = valid.replacen(
        &format!("\"{PROPERTY_NAME}\":true"),
        &format!("\"{PROPERTY_NAME}\":\"five!\""),
        1,
    );
    let string_limited = OperationJsonCodecV3::new(EditorContext::new(
        schema.clone(),
        DocumentLimits::default().with_max_property_string_bytes(3),
    ));
    assert!(matches!(
        string_limited.decode(&string_payload),
        Err(OperationV3CodecError::InvalidJson(_))
    ));

    let nested_payload = valid.replacen(
        &format!("\"{PROPERTY_NAME}\":true"),
        &format!("\"{PROPERTY_NAME}\":[[true]]"),
        1,
    );
    let depth_limited = OperationJsonCodecV3::new(EditorContext::new(
        schema,
        DocumentLimits::default().with_max_property_depth(0),
    ));
    assert!(matches!(
        depth_limited.decode(&nested_payload),
        Err(OperationV3CodecError::InvalidJson(_))
    ));
    Ok(())
}

#[test]
fn exact_input_and_output_byte_limits_are_symmetric() -> TestResult {
    let schema = optional_property_schema("example/operation-v3-bytes")?;
    let operation = property_insertion(true)?;
    let source =
        OperationJsonCodecV3::new(EditorContext::new(schema.clone(), DocumentLimits::default()));
    let encoded = source.encode(&operation)?;

    let exact = OperationJsonCodecV3::new(EditorContext::new(
        schema.clone(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    ));
    assert_eq!(exact.decode(&encoded)?, operation);
    assert_eq!(exact.encode(&operation)?, encoded);

    let limited = OperationJsonCodecV3::new(EditorContext::new(
        schema,
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    ));
    assert!(matches!(limited.decode(&encoded), Err(OperationV3CodecError::InputTooLarge { .. })));
    assert!(matches!(
        limited.encode(&operation),
        Err(OperationV3CodecError::OutputTooLarge { minimum, maximum })
            if minimum > maximum && maximum == encoded.len() - 1
    ));
    Ok(())
}

#[test]
fn schema_invalid_property_value_is_a_validation_failure() -> TestResult {
    let schema = optional_property_schema("example/operation-v3-validation")?;
    let codec = OperationJsonCodecV3::new(EditorContext::new(schema, DocumentLimits::default()));
    let valid = codec.encode(&property_insertion(true)?)?;
    let wrong_type = valid.replacen(
        &format!("\"{PROPERTY_NAME}\":true"),
        &format!("\"{PROPERTY_NAME}\":\"wrong\""),
        1,
    );
    assert!(matches!(codec.decode(&wrong_type), Err(OperationV3CodecError::Validation(_))));
    Ok(())
}
