//! Public V3 local-log-checkpoint wire, property, binding, nesting, and limit contracts.

mod support;

use std::{error::Error, io};

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, DocumentJsonCodecV2, LOCAL_LOG_CHECKPOINT_FORMAT,
        LOCAL_LOG_CHECKPOINT_FORMAT_VERSION, LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION,
        LOCAL_LOG_CHECKPOINT_V3_FORMAT_VERSION, LocalLogCheckpointBindingField,
        LocalLogCheckpointCodecError, LocalLogCheckpointJsonCodec, LocalLogCheckpointJsonCodecV2,
        LocalLogCheckpointJsonCodecV3, LocalLogCheckpointLimits, LocalLogCheckpointResourceLimit,
        LocalLogCheckpointV2CodecError, LocalLogCheckpointV3CodecError,
        SESSION_CHECKPOINT_V3_FORMAT_VERSION, SessionCheckpointJsonCodecV3,
        SessionCheckpointV3CodecError,
    },
    document::{
        Document, Format, FormatSet, PropertyInteger, PropertyMap, PropertyValue, TextFragment,
        TextRun,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits,
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogRecovery, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{
        CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaBindingError, SchemaId,
        SchemaVersion,
    },
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{PendingFormatsUpdate, SelectionUpdate, Transaction},
};
use serde_json::{Map, Value, json};
use support::{TestResult, document_json, paragraph, path, test_error};

const BASE_FINGERPRINT: &str =
    "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const SESSION_ID: &str = "session:checkpoint-v3";
const CHECKPOINT_LOG_ID: &str = "log:checkpoint-v3-prefix";
const SUCCESSOR_LOG_ID: &str = "log:checkpoint-v3-successor";

const LINK: &str = "example/link";
const ENABLED: &str = "example/enabled";
const HREF: &str = "example/href";
const PRIORITY: &str = "example/priority";
const SECRET: &str = "property-preserving-history-value";

fn base_state(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[])]))?;
    EditorState::try_new(
        context,
        LineageId::try_new("local-log-checkpoint-v3")?,
        document,
        None,
        None,
    )
    .map_err(Into::into)
}

fn binding() -> Result<LocalLogCheckpointBinding, Box<dyn Error>> {
    Ok(LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )?)
}

fn base_checkpoint_anchor(
    context: &EditorContext,
    replay_count: u64,
) -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    if replay_count > 2 {
        return Err(test_error("checkpoint fixture supports at most two entries").into());
    }
    let initial = base_state(context)?;
    let mut prefix = Vec::new();
    if replay_count >= 1 {
        let range = TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?;
        let replacement: TextFragment = TextRun::try_new("x", FormatSet::default())?.into();
        let splice = TextSplice::capture(context, initial.document(), range, replacement)?;
        let commit = Transaction::new(&initial, vec![splice.into()])
            .apply(context, &initial)?
            .into_commit()
            .ok_or_else(|| test_error("checkpoint fixture edit was unchanged"))?;
        prefix.push(LocalLogEntry::new(
            LocalSessionId::try_new(SESSION_ID)?,
            LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
            LocalLogSequence::FIRST,
            ReplayId::try_new("replay:checkpoint-v3-1")?,
            LocalLogEvent::commit(commit),
        ));
    }
    if replay_count == 2 {
        prefix.push(LocalLogEntry::new(
            LocalSessionId::try_new(SESSION_ID)?,
            LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
            LocalLogSequence::try_new(2)?,
            ReplayId::try_new("replay:checkpoint-v3-2")?,
            LocalLogEvent::clear_history(),
        ));
    }
    Ok(LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    )
    .recover(EditorSession::new(initial), prefix)?
    .try_into_checkpoint_anchor(
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
        LocalLogCompactionLimits::default(),
    )?)
}

fn checkpoint_codec(
    context: &EditorContext,
) -> Result<LocalLogCheckpointJsonCodecV3, Box<dyn Error>> {
    Ok(LocalLogCheckpointJsonCodecV3::new(context.clone(), binding()?))
}

fn rejected(
    codec: &LocalLogCheckpointJsonCodecV3,
    json: &str,
) -> Result<LocalLogCheckpointV3CodecError, Box<dyn Error>> {
    codec.decode(json).err().ok_or_else(|| {
        io::Error::other("hostile Local Log Checkpoint V3 unexpectedly decoded").into()
    })
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let contract = InlineFormatPropertyContractV1::try_new(
        name(LINK)?,
        vec![
            InlineFormatPropertySpecV1::new(
                name(ENABLED)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::boolean(),
            ),
            InlineFormatPropertySpecV1::new(
                name(HREF)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 64)?,
            ),
            InlineFormatPropertySpecV1::new(
                name(PRIORITY)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_integer(None, None)?,
            ),
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/local-log-v3-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/local-log-v3")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn typed_context() -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(typed_schema()?, DocumentLimits::default()))
}

fn typed_plain_document(context: &EditorContext) -> Result<Document, Box<dyn Error>> {
    let schema = context.schema();
    let json = json!({
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
                "children": [{"kind": "text", "text": "x", "formats": []}],
            }],
        },
    })
    .to_string();
    DocumentJsonCodecV2::new(schema.clone())
        .with_limits(context.limits().clone())
        .decode(&json)
        .map_err(Into::into)
}

fn selection(offset: u32, affinity: Affinity) -> Result<Selection, Box<dyn Error>> {
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: offset,
        affinity,
    };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn link_formats() -> Result<FormatSet, Box<dyn Error>> {
    let properties = PropertyMap::try_from_sorted(vec![
        (name(ENABLED)?, PropertyValue::boolean(true)),
        (name(HREF)?, PropertyValue::from_string(SECRET)),
        (name(PRIORITY)?, PropertyValue::from_integer(PropertyInteger::try_new(7)?)),
    ])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK)?, properties)]).map_err(Into::into)
}

fn typed_initial_state(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    EditorState::try_new(
        context,
        LineageId::try_new("local-log-checkpoint-v3-typed")?,
        typed_plain_document(context)?,
        Some(selection(0, Affinity::Before)?),
        None,
    )
    .map_err(Into::into)
}

fn typed_transaction(state: &EditorState) -> Result<Transaction, Box<dyn Error>> {
    let formats = link_formats()?;
    let replacement = TextFragment::try_from_runs(vec![TextRun::try_new("x", formats.clone())?])?;
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::try_new(1)?,
    )?;
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_selection_update(SelectionUpdate::Set(Some(selection(1, Affinity::After)?)))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats))))
}

fn typed_checkpoint_anchor(
    context: &EditorContext,
) -> Result<(LocalLogCheckpointAnchor, EditorState, EditorState), Box<dyn Error>> {
    let initial = typed_initial_state(context)?;
    let mut expected = EditorSession::new(initial.clone());
    let transaction = typed_transaction(expected.state())?;
    let commit = expected
        .apply_transaction(&transaction)?
        .into_commit()
        .ok_or_else(|| test_error("typed checkpoint transaction was unchanged"))?;
    let formatted = expected.state().clone();
    let entry = LocalLogEntry::new_with_schema_binding(
        context.schema().durable_binding(),
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogSequence::FIRST,
        ReplayId::try_new("replay:checkpoint-v3-typed")?,
        LocalLogEvent::commit(commit),
    );
    let anchor = LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    )
    .recover(EditorSession::new(initial.clone()), vec![entry])?
    .try_into_checkpoint_anchor(
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
        LocalLogCompactionLimits::default(),
    )?;
    Ok((anchor, initial, formatted))
}

fn assert_same_semantics(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.snapshot().lineage(), expected.snapshot().lineage());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn canonical_empty_outer_shape_is_exact_and_byte_stable() -> TestResult {
    assert_eq!(LOCAL_LOG_CHECKPOINT_FORMAT, "breditor/local-log-checkpoint");
    assert_eq!(LOCAL_LOG_CHECKPOINT_FORMAT_VERSION, 1);
    assert_eq!(LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION, 2);
    assert_eq!(LOCAL_LOG_CHECKPOINT_V3_FORMAT_VERSION, 3);
    assert_eq!(SESSION_CHECKPOINT_V3_FORMAT_VERSION, 3);

    let context = EditorContext::default();
    let anchor = base_checkpoint_anchor(&context, 0)?;
    let nested = SessionCheckpointJsonCodecV3::new(context.clone()).encode(anchor.session())?;
    let codec = checkpoint_codec(&context)?;
    let encoded = codec.encode(&anchor)?;
    let expected = format!(
        concat!(
            r#"{{"format":"breditor/local-log-checkpoint","formatVersion":3,"#,
            r#""schema":{{"name":"breditor/base","version":1}},"#,
            r#""schemaFingerprint":"{}","#,
            r#""sessionId":"{}","checkpointLogId":"{}","#,
            r#""successorLogId":"{}","coveredThrough":null,"#,
            r#""replayTombstones":[],"sessionCheckpoint":{}}}"#,
        ),
        BASE_FINGERPRINT, SESSION_ID, CHECKPOINT_LOG_ID, SUCCESSOR_LOG_ID, nested,
    );
    assert_eq!(encoded, expected);
    assert_eq!(codec.encode(&anchor)?, encoded);

    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value.as_object().map(Map::len), Some(10));
    assert_eq!(value["sessionCheckpoint"]["formatVersion"], 3);
    assert_eq!(value["sessionCheckpoint"]["schemaFingerprint"], BASE_FINGERPRINT);

    let restored = codec.decode(&encoded)?;
    assert_eq!(restored.schema_binding(), anchor.schema_binding());
    assert_eq!(restored.checkpoint_covered_through(), None);
    assert_eq!(restored.compacted_replay_count(), 0);
    assert_eq!(codec.encode(&restored)?, encoded);
    Ok(())
}

#[test]
fn outer_and_nested_v1_v2_v3_generations_never_mix() -> TestResult {
    let context = EditorContext::default();
    let anchor = base_checkpoint_anchor(&context, 0)?;
    let v1 = LocalLogCheckpointJsonCodec::new(context.clone(), binding()?);
    let v2 = LocalLogCheckpointJsonCodecV2::new(context.clone(), binding()?);
    let v3 = checkpoint_codec(&context)?;

    let v1_json = v1.encode(&anchor)?;
    let v2_json = v2.encode(&anchor)?;
    let v3_json = v3.encode(&anchor)?;

    assert!(matches!(
        v1.decode(&v3_json),
        Err(LocalLogCheckpointCodecError::UnsupportedFormatVersion { found: 3, supported: 1 })
    ));
    assert!(matches!(
        v2.decode(&v3_json),
        Err(LocalLogCheckpointV2CodecError::UnsupportedFormatVersion { found: 3, supported: 2 })
    ));
    assert!(matches!(
        rejected(&v3, &v1_json)?,
        LocalLogCheckpointV3CodecError::UnsupportedFormatVersion { found: 1, supported: 3 }
    ));
    assert!(matches!(
        rejected(&v3, &v2_json)?,
        LocalLogCheckpointV3CodecError::UnsupportedFormatVersion { found: 2, supported: 3 }
    ));

    for nested_version in [1, 2] {
        let mut mixed: Value = serde_json::from_str(&v3_json)?;
        mixed["sessionCheckpoint"]["formatVersion"] = json!(nested_version);
        assert!(matches!(
            rejected(&v3, &serde_json::to_string(&mixed)?)?,
            LocalLogCheckpointV3CodecError::InvalidSessionCheckpoint(source)
                if matches!(*source, SessionCheckpointV3CodecError::UnsupportedFormatVersion {
                    found,
                    supported: 3,
                } if found == nested_version)
        ));
    }
    Ok(())
}

#[test]
fn typed_properties_survive_history_current_state_and_both_replay_directions() -> TestResult {
    let context = typed_context()?;
    let (anchor, initial, formatted) = typed_checkpoint_anchor(&context)?;
    let codec = checkpoint_codec(&context)?;
    let encoded = codec.encode(&anchor)?;
    let value: Value = serde_json::from_str(&encoded)?;

    assert_eq!(value["formatVersion"], 3);
    assert_eq!(value["sessionCheckpoint"]["formatVersion"], 3);
    let operation_properties = &value["sessionCheckpoint"]["entries"][0]["forwardOperations"][0]["replacement"]
        ["runs"][0]["formats"][0]["properties"];
    assert_eq!(operation_properties[ENABLED], json!(true));
    assert_eq!(operation_properties[HREF], json!(SECRET));
    assert_eq!(operation_properties[PRIORITY], json!(7));
    assert_eq!(
        value["sessionCheckpoint"]["entries"][0]["resultPendingFormats"][0]["properties"],
        *operation_properties
    );

    let restored = codec.decode(&encoded)?;
    assert_eq!(restored.session().state(), anchor.session().state());
    assert_eq!((restored.session().undo_depth(), restored.session().redo_depth()), (1, 0));
    assert_eq!(restored.compacted_replay_count(), 1);
    assert_eq!(codec.encode(&restored)?, encoded);

    let mut session = restored.into_session();
    session.undo()?.ok_or_else(|| test_error("restored typed undo was unavailable"))?;
    assert_same_semantics(session.state(), &initial);
    session.redo()?.ok_or_else(|| test_error("restored typed redo was unavailable"))?;
    assert_same_semantics(session.state(), &formatted);
    Ok(())
}

#[test]
fn strict_binding_shape_and_authority_precedence_fail_closed() -> TestResult {
    let context = EditorContext::default();
    let codec = checkpoint_codec(&context)?;
    let baseline = codec.encode(&base_checkpoint_anchor(&context, 0)?)?;
    let value: Value = serde_json::from_str(&baseline)?;

    for field in ["schema", "schemaFingerprint"] {
        let mut missing = value.clone();
        missing
            .as_object_mut()
            .ok_or_else(|| test_error("fixture is not an object"))?
            .remove(field);
        assert!(matches!(
            rejected(&codec, &serde_json::to_string(&missing)?)?,
            LocalLogCheckpointV3CodecError::InvalidJson(_)
        ));
    }

    let mut unknown = value.clone();
    unknown
        .as_object_mut()
        .ok_or_else(|| test_error("fixture is not an object"))?
        .insert("authority".to_owned(), json!(true));
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&unknown)?)?,
        LocalLogCheckpointV3CodecError::InvalidJson(_)
    ));

    let fingerprint_field = format!(r#""schemaFingerprint":"{BASE_FINGERPRINT}""#);
    let duplicate = baseline.replacen(
        &fingerprint_field,
        &format!("{fingerprint_field},{fingerprint_field}"),
        1,
    );
    assert!(matches!(
        rejected(&codec, &duplicate)?,
        LocalLogCheckpointV3CodecError::InvalidJson(_)
    ));

    let mut wrong_id_bad_fingerprint = value.clone();
    wrong_id_bad_fingerprint["schema"]["name"] = json!("other/schema");
    wrong_id_bad_fingerprint["schemaFingerprint"] = json!("malformed");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&wrong_id_bad_fingerprint)?)?,
        LocalLogCheckpointV3CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));

    let other_expected = LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new("session:other")?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
    )?;
    let other_codec = LocalLogCheckpointJsonCodecV3::new(context, other_expected);
    let mut invalid_nested: Value = value;
    invalid_nested["sessionCheckpoint"]["formatVersion"] = json!(2);
    assert!(matches!(
        rejected(&other_codec, &serde_json::to_string(&invalid_nested)?)?,
        LocalLogCheckpointV3CodecError::InvalidCheckpoint(source)
            if matches!(*source, LocalLogCheckpointCodecError::BindingMismatch {
                field: LocalLogCheckpointBindingField::SessionId
            })
    ));
    Ok(())
}

#[test]
fn tombstone_and_outer_byte_limits_are_exact() -> TestResult {
    let context = EditorContext::default();
    let anchor = base_checkpoint_anchor(&context, 2)?;
    let codec = checkpoint_codec(&context)?
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(2));
    let encoded = codec.encode(&anchor)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["coveredThrough"], "2");
    assert_eq!(
        value["replayTombstones"],
        json!(["replay:checkpoint-v3-1", "replay:checkpoint-v3-2"])
    );
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);

    let limited = codec
        .clone()
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(1));
    assert!(matches!(
        limited.encode(&anchor),
        Err(LocalLogCheckpointV3CodecError::InvalidCheckpoint(source))
            if matches!(*source, LocalLogCheckpointCodecError::ResourceLimit(
                LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
            ))
    ));
    assert!(matches!(
        limited.decode(&encoded),
        Err(LocalLogCheckpointV3CodecError::InvalidCheckpoint(source))
            if matches!(*source, LocalLogCheckpointCodecError::ResourceLimit(
                LocalLogCheckpointResourceLimit::ReplayTombstones { actual: 2, maximum: 1 }
            ))
    ));

    let exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(encoded.len()),
    );
    let exact_anchor = base_checkpoint_anchor(&exact_context, 2)?;
    let exact_codec = checkpoint_codec(&exact_context)?;
    assert_eq!(exact_codec.encode(&exact_anchor)?.len(), encoded.len());
    exact_codec.decode(&encoded)?;

    let short_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(encoded.len() - 1),
    );
    let short_anchor = base_checkpoint_anchor(&short_context, 2)?;
    let short_codec = checkpoint_codec(&short_context)?;
    assert!(matches!(
        short_codec.decode(&encoded),
        Err(LocalLogCheckpointV3CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(
        short_codec.encode(&short_anchor),
        Err(LocalLogCheckpointV3CodecError::OutputTooLarge { .. })
    ));
    assert_eq!(
        LocalLogCheckpointV3CodecError::OutputTooLarge { minimum: 2, maximum: 1 }.code(),
        CodecErrorCode::OutputTooLarge
    );
    Ok(())
}
