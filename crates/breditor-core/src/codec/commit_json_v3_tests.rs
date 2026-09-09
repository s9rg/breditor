//! Commit V3 property-persistence and replay-proof contracts.

use std::{error::Error, fmt};

use serde_json::{Value, json};

use crate::{
    codec::{
        COMMIT_V3_FORMAT_VERSION, CodecErrorCode, CommitApplicationErrorCode, CommitCodecError,
        CommitJsonCodecV2, CommitJsonCodecV3, CommitRecordErrorCode, CommitRecordLocation,
        CommitV3CodecError, EditorStateV3CodecError,
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
    transaction::{Commit, PendingFormatsUpdate, Transaction, TransactionOutcome},
};

const FORMAT_KIND: &str = "example/highlight";
const PROPERTY_NAME: &str = "example/enabled";
const STRING_PROPERTY_NAME: &str = "example/href";

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

fn schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let format_kind = name(FORMAT_KIND)?;
    let contract = InlineFormatPropertyContractV1::try_new(
        format_kind.clone(),
        vec![
            InlineFormatPropertySpecV1::new(
                name(PROPERTY_NAME)?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::boolean(),
            ),
            InlineFormatPropertySpecV1::new(
                name(STRING_PROPERTY_NAME)?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_string(0, 64)?,
            ),
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/commit-v3-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(format_kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/commit-v3")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn property_map(value: bool) -> Result<PropertyMap, Box<dyn Error>> {
    PropertyMap::try_from_sorted(vec![(name(PROPERTY_NAME)?, PropertyValue::boolean(value))])
        .map_err(Into::into)
}

fn string_property_map(value: &str) -> Result<PropertyMap, Box<dyn Error>> {
    PropertyMap::try_from_sorted(vec![(
        name(STRING_PROPERTY_NAME)?,
        PropertyValue::from_string(value),
    )])
    .map_err(Into::into)
}

fn formats(properties: PropertyMap) -> Result<FormatSet, Box<dyn Error>> {
    FormatSet::try_from_formats(vec![Format::new(name(FORMAT_KIND)?, properties)])
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
        LineageId::try_new("commit-v3-properties")?,
        document,
        Some(collapsed_selection()?),
        None,
    )
    .map_err(Into::into)
}

fn typed_commit(context: &EditorContext) -> Result<Commit, Box<dyn Error>> {
    let base = state(context)?;
    let transaction = Transaction::new(&base, vec![insertion(property_map(true)?)?])
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats(property_map(
            true,
        )?)?)));
    let TransactionOutcome::Committed(commit) = transaction.apply(context, &base)? else {
        return Err(test_error("typed transaction unexpectedly made no change"));
    };
    Ok(*commit)
}

fn operation_only_commit(context: &EditorContext) -> Result<Commit, Box<dyn Error>> {
    let base = state(context)?;
    let transaction = Transaction::new(&base, vec![insertion(property_map(true)?)?]);
    let TransactionOutcome::Committed(commit) = transaction.apply(context, &base)? else {
        return Err(test_error("typed operation unexpectedly made no change"));
    };
    Ok(*commit)
}

fn pending_only_commit(
    context: &EditorContext,
    properties: PropertyMap,
) -> Result<Commit, Box<dyn Error>> {
    let base = state(context)?;
    let transaction = Transaction::new(&base, Vec::new())
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats(properties)?)));
    let TransactionOutcome::Committed(commit) = transaction.apply(context, &base)? else {
        return Err(test_error("pending-format update unexpectedly made no change"));
    };
    Ok(*commit)
}

fn decode_error(
    codec: &CommitJsonCodecV3,
    json: &str,
) -> Result<CommitV3CodecError, Box<dyn Error>> {
    codec.decode(json).err().ok_or_else(|| test_error("invalid Commit V3 unexpectedly decoded"))
}

#[test]
fn typed_operation_and_pending_result_round_trip_exactly() -> TestResult {
    assert_eq!(COMMIT_V3_FORMAT_VERSION, 3);
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let commit = typed_commit(&context)?;
    let codec = CommitJsonCodecV3::new(context.clone());
    assert_eq!(codec.context(), &context);

    let encoded = codec.encode(&commit)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["formatVersion"], json!(3));
    assert_eq!(value["before"]["formatVersion"], json!(3));
    assert_eq!(
        value.pointer(
            "/forwardOperations/0/replacement/runs/0/formats/0/properties/example~1enabled"
        ),
        Some(&Value::Bool(true)),
    );
    assert_eq!(
        value.pointer("/resultPendingFormats/0/properties/example~1enabled"),
        Some(&Value::Bool(true)),
    );

    let decoded = codec.decode(&encoded)?;
    assert_eq!(decoded, commit);
    assert_eq!(codec.encode(&decoded)?, encoded);
    Ok(())
}

#[test]
fn optional_only_typed_contract_is_preserved_and_v2_fails_closed() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let base = state(&context)?;
    let transaction = Transaction::new(&base, vec![insertion(PropertyMap::default())?])
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats(
            PropertyMap::default(),
        )?)));
    let TransactionOutcome::Committed(commit) = transaction.apply(&context, &base)? else {
        return Err(test_error("optional typed transaction unexpectedly made no change"));
    };
    let v3 = CommitJsonCodecV3::new(context.clone());
    let encoded = v3.encode(&commit)?;
    assert!(encoded.matches(r#""properties":{}"#).count() >= 2);
    assert_eq!(v3.decode(&encoded)?, *commit);
    assert!(CommitJsonCodecV2::new(context).encode(&commit).is_err());
    Ok(())
}

#[test]
fn mixed_nested_and_payload_generations_are_rejected() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let commit = typed_commit(&context)?;
    let codec = CommitJsonCodecV3::new(context);
    let encoded = codec.encode(&commit)?;

    let mut mixed: Value = serde_json::from_str(&encoded)?;
    mixed["before"]["formatVersion"] = json!(2);
    let mixed_error = decode_error(&codec, &serde_json::to_string(&mixed)?)?;
    assert!(matches!(mixed_error, CommitV3CodecError::InvalidBeforeState(_)));

    let mut mixed_document: Value = serde_json::from_str(&encoded)?;
    mixed_document["before"]["document"]["formatVersion"] = json!(1);
    assert!(matches!(
        decode_error(&codec, &serde_json::to_string(&mixed_document)?)?,
        CommitV3CodecError::InvalidBeforeState(source)
            if matches!(*source, EditorStateV3CodecError::InvalidDocument(_))
    ));

    let mut mixed_operation: Value = serde_json::from_str(&encoded)?;
    mixed_operation
        .pointer_mut("/forwardOperations/0/replacement/runs/0/formats/0")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| test_error("typed operation fixture format is missing"))?
        .remove("properties");
    let operation_error = decode_error(&codec, &serde_json::to_string(&mixed_operation)?)?;
    assert_eq!(operation_error.code(), CodecErrorCode::InvalidJson);
    assert!(
        matches!(
            operation_error,
            CommitV3CodecError::InvalidCommit(CommitCodecError::InvalidOperationJson {
                operation_index: 0,
                ..
            })
        ),
        "unexpected mixed operation error: {operation_error:?}"
    );

    let mut mixed_pending: Value = serde_json::from_str(&encoded)?;
    mixed_pending
        .pointer_mut("/resultPendingFormats/0")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| test_error("typed pending-format fixture is missing"))?
        .remove("properties");
    assert!(matches!(
        decode_error(&codec, &serde_json::to_string(&mixed_pending)?)?,
        CommitV3CodecError::InvalidJson(_)
    ));
    Ok(())
}

#[test]
fn replay_tampering_and_hidden_noops_are_rejected() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let commit = typed_commit(&context)?;
    let codec = CommitJsonCodecV3::new(context);
    let encoded = codec.encode(&commit)?;

    let mut tampered: Value = serde_json::from_str(&encoded)?;
    tampered["forwardOperations"][0]["range"]["end"] = json!(5);
    tampered["forwardOperations"][0]["expectedRemoved"] = json!({
        "runs": [{"text": "stale", "formats": []}]
    });
    let tampered_error = decode_error(&codec, &serde_json::to_string(&tampered)?)?;
    match tampered_error {
        CommitV3CodecError::InvalidCommit(CommitCodecError::Apply(source)) => {
            assert_eq!(source.code(), CommitApplicationErrorCode::Operation);
            assert_eq!(source.operation_index(), Some(0));
        }
        other => return Err(test_error(format!("expected typed replay failure, got {other}"))),
    }

    let no_op = json!({
        "kind": "textSplice",
        "range": {"containerPath": [0], "start": 0, "end": 0},
        "expectedRemoved": {"runs": []},
        "replacement": {"runs": []}
    });
    let mut hidden_noop: Value = serde_json::from_str(&encoded)?;
    hidden_noop["forwardOperations"] = json!([no_op, hidden_noop["forwardOperations"][0].clone()]);
    assert!(matches!(
        decode_error(&codec, &serde_json::to_string(&hidden_noop)?)?,
        CommitV3CodecError::InvalidCommit(CommitCodecError::NonCanonicalForwardOperations {
            operation_index: 0
        })
    ));
    Ok(())
}

#[test]
fn replay_guard_failures_do_not_retain_typed_source_fragments() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let empty = state(&context)?;
    let base_transaction =
        Transaction::new(&empty, vec![insertion(string_property_map("base-value")?)?]);
    let TransactionOutcome::Committed(base_commit) = base_transaction.apply(&context, &empty)?
    else {
        return Err(test_error("base insertion unexpectedly made no change"));
    };
    let base = base_commit.after().clone();
    let guarded_replacement = TextSplice::try_new(
        TextRange::try_new(
            NodePath::try_from_indices(vec![0])?,
            TextOffset::ZERO,
            TextOffset::try_new(1)?,
        )?,
        TextFragment::try_from_runs(vec![TextRun::try_new(
            "x",
            formats(string_property_map("base-value")?)?,
        )?])?,
        TextFragment::try_from_runs(vec![TextRun::try_new("y", formats(property_map(false)?)?)?])?,
    )?;
    let TransactionOutcome::Committed(commit) =
        Transaction::new(&base, vec![guarded_replacement.into()]).apply(&context, &base)?
    else {
        return Err(test_error("guarded replacement unexpectedly made no change"));
    };
    let codec = CommitJsonCodecV3::new(context);
    let encoded = codec.encode(&commit)?;
    assert_eq!(codec.decode(&encoded)?, *commit);
    let mut tampered: Value = serde_json::from_str(&encoded)?;
    *tampered
        .pointer_mut(
            "/forwardOperations/0/expectedRemoved/runs/0/formats/0/properties/example~1href",
        )
        .ok_or_else(|| test_error("guarded property fixture is missing"))? = json!("guard-secret");

    let error = decode_error(&codec, &serde_json::to_string(&tampered)?)?;
    let CommitV3CodecError::InvalidCommit(CommitCodecError::Apply(source)) = &error else {
        return Err(test_error(format!("expected replay guard failure, got {error}")));
    };
    assert_eq!(source.code(), CommitApplicationErrorCode::Operation);
    assert_eq!(source.operation_index(), Some(0));
    for diagnostic in [error.to_string(), format!("{error:?}")] {
        assert!(!diagnostic.contains("guard-secret"));
        assert!(!diagnostic.contains("base-value"));
        assert!(!diagnostic.contains(STRING_PROPERTY_NAME));
    }
    Ok(())
}

#[test]
fn hostile_property_payloads_are_bounded_and_redacted() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let commit = typed_commit(&context)?;
    let codec = CommitJsonCodecV3::new(context);
    let valid = codec.encode(&commit)?;
    for hostile in [
        valid.replacen(&format!(r#""{PROPERTY_NAME}":true"#), r#""SECRET INVALID":true"#, 1),
        valid.replacen(
            &format!(r#""{PROPERTY_NAME}":true"#),
            &format!(r#""{PROPERTY_NAME}":9007199254740992"#),
            1,
        ),
    ] {
        let error = decode_error(&codec, &hostile)?;
        assert_eq!(error.code(), CodecErrorCode::InvalidJson);
        let diagnostic = error.to_string();
        assert!(!diagnostic.contains("SECRET"));
        assert!(!diagnostic.contains("9007199254740992"));
        assert!(!diagnostic.contains(PROPERTY_NAME));
    }
    Ok(())
}

#[test]
fn schema_invalid_result_pending_format_has_a_stable_redacted_location() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default());
    let commit = pending_only_commit(&context, property_map(true)?)?;
    let codec = CommitJsonCodecV3::new(context);
    let mut invalid: Value = serde_json::from_str(&codec.encode(&commit)?)?;
    *invalid
        .pointer_mut("/resultPendingFormats/0/properties/example~1enabled")
        .ok_or_else(|| test_error("pending-format property fixture is missing"))? =
        json!("pending-secret");

    let error = decode_error(&codec, &serde_json::to_string(&invalid)?)?;
    let CommitV3CodecError::InvalidCommit(CommitCodecError::InvalidCommit(source)) = &error else {
        return Err(test_error(format!(
            "expected a typed result-pending-format failure, got {error}"
        )));
    };
    assert_eq!(source.code(), CommitRecordErrorCode::PendingFormatNotAllowed);
    assert_eq!(source.location(), CommitRecordLocation::ResultPendingFormat { format_index: 0 });
    for diagnostic in [error.to_string(), format!("{error:?}")] {
        assert!(!diagnostic.contains("pending-secret"));
        assert!(!diagnostic.contains(PROPERTY_NAME));
    }
    Ok(())
}

#[test]
fn operation_count_limit_precedes_the_first_hostile_excess_payload() -> TestResult {
    let context = EditorContext::new(schema()?, DocumentLimits::default())
        .with_max_operations_per_transaction(0);
    let commit = pending_only_commit(&context, property_map(true)?)?;
    let codec = CommitJsonCodecV3::new(context);
    let mut hostile: Value = serde_json::from_str(&codec.encode(&commit)?)?;
    hostile["forwardOperations"] = json!([{
        "kind": "textSplice",
        "properties": {"SECRET INVALID": 9_007_199_254_740_992_u64}
    }]);

    let error = decode_error(&codec, &serde_json::to_string(&hostile)?)?;
    assert!(matches!(
        error,
        CommitV3CodecError::InvalidCommit(CommitCodecError::OperationLimit {
            actual: 1,
            maximum: 0
        })
    ));
    let diagnostic = format!("{error:?}");
    assert!(!diagnostic.contains("SECRET"));
    assert!(!diagnostic.contains("9007199254740992"));
    Ok(())
}

#[test]
fn exact_json_and_pending_property_limits_are_symmetric() -> TestResult {
    let compiled = schema()?;
    let source_context = EditorContext::new(compiled.clone(), DocumentLimits::default());
    let source_codec = CommitJsonCodecV3::new(source_context.clone());
    let encoded = source_codec.encode(&typed_commit(&source_context)?)?;

    let exact_context = EditorContext::new(
        compiled.clone(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    );
    let exact_codec = CommitJsonCodecV3::new(exact_context.clone());
    let exact_commit = typed_commit(&exact_context)?;
    assert_eq!(exact_codec.encode(&exact_commit)?, encoded);
    assert_eq!(exact_codec.decode(&encoded)?, exact_commit);
    assert!(matches!(
        source_codec.encode(&exact_commit),
        Err(CommitV3CodecError::ContextConfigurationMismatch)
    ));

    let byte_limited_context = EditorContext::new(
        compiled.clone(),
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    );
    let byte_limited_codec = CommitJsonCodecV3::new(byte_limited_context.clone());
    let byte_limited_commit = typed_commit(&byte_limited_context)?;
    assert!(matches!(
        byte_limited_codec.decode(&encoded),
        Err(CommitV3CodecError::InputTooLarge { actual, maximum })
            if actual == encoded.len() && maximum == encoded.len() - 1
    ));
    assert!(matches!(
        byte_limited_codec.encode(&byte_limited_commit),
        Err(CommitV3CodecError::OutputTooLarge { minimum, maximum })
            if minimum > maximum && maximum == encoded.len() - 1
    ));

    let pending_value =
        source_codec.encode(&pending_only_commit(&source_context, property_map(true)?)?)?;
    let exact_value_codec = CommitJsonCodecV3::new(EditorContext::new(
        compiled.clone(),
        DocumentLimits::default().with_max_property_values(1),
    ));
    assert_eq!(exact_value_codec.encode(&exact_value_codec.decode(&encoded)?)?, encoded);
    assert_eq!(
        exact_value_codec.encode(&exact_value_codec.decode(&pending_value)?)?,
        pending_value
    );
    let excess_value_codec = CommitJsonCodecV3::new(EditorContext::new(
        compiled.clone(),
        DocumentLimits::default().with_max_property_values(0),
    ));
    assert!(matches!(
        excess_value_codec.decode(&pending_value),
        Err(CommitV3CodecError::InvalidJson(_))
    ));
    let operation_value = source_codec.encode(&operation_only_commit(&source_context)?)?;
    let excess_operation_error = decode_error(&excess_value_codec, &operation_value)?;
    assert!(
        matches!(
            excess_operation_error,
            CommitV3CodecError::InvalidCommit(CommitCodecError::OperationValidation {
                operation_index: 0,
                ..
            })
        ),
        "unexpected operation property-limit error: {excess_operation_error:?}"
    );

    let pending_string =
        source_codec.encode(&pending_only_commit(&source_context, string_property_map("é")?)?)?;
    let exact_string_codec = CommitJsonCodecV3::new(EditorContext::new(
        compiled.clone(),
        DocumentLimits::default()
            .with_max_property_values(1)
            .with_max_property_string_bytes(2)
            .with_max_total_property_string_bytes(2),
    ));
    assert_eq!(
        exact_string_codec.encode(&exact_string_codec.decode(&pending_string)?)?,
        pending_string
    );
    for limits in [
        DocumentLimits::default()
            .with_max_property_string_bytes(1)
            .with_max_total_property_string_bytes(2),
        DocumentLimits::default()
            .with_max_property_string_bytes(2)
            .with_max_total_property_string_bytes(1),
    ] {
        assert!(matches!(
            CommitJsonCodecV3::new(EditorContext::new(compiled.clone(), limits))
                .decode(&pending_string),
            Err(CommitV3CodecError::InvalidJson(_))
        ));
    }
    Ok(())
}
