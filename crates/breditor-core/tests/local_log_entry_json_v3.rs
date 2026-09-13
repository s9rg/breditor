//! Public V3 local-log-entry wire, binding, and property-preservation contracts.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        COMMIT_V3_FORMAT_VERSION, CodecErrorCode, CommitV3CodecError, DocumentJsonCodecV2,
        LOCAL_LOG_ENTRY_FORMAT, LOCAL_LOG_ENTRY_FORMAT_VERSION, LOCAL_LOG_ENTRY_V2_FORMAT_VERSION,
        LOCAL_LOG_ENTRY_V3_FORMAT_VERSION, LocalLogCommitEventKind, LocalLogEntryJsonCodec,
        LocalLogEntryJsonCodecV2, LocalLogEntryJsonCodecV3, LocalLogEntryV2CodecError,
        LocalLogEntryV3CodecError,
    },
    document::{Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{Operation, TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{
        CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaBindingError, SchemaId,
        SchemaVersion,
    },
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, PendingFormatsUpdate, Transaction, TransactionOutcome},
};
use serde_json::{Map, Value, json};
use support::{TestResult, test_error};

const FORMAT_KIND: &str = "example/local-log-mark";
const PROPERTY_NAME: &str = "example/enabled";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let format_kind = name(FORMAT_KIND)?;
    let contract = InlineFormatPropertyContractV1::try_new(
        format_kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name(PROPERTY_NAME)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::boolean(),
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/local-log-v3-extension")?, ExtensionVersion::one()),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(format_kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/local-log-v3")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn context() -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(schema()?, DocumentLimits::default()))
}

fn properties() -> Result<PropertyMap, Box<dyn Error>> {
    PropertyMap::try_from_sorted(vec![(name(PROPERTY_NAME)?, PropertyValue::boolean(true))])
        .map_err(Into::into)
}

fn formats() -> Result<FormatSet, Box<dyn Error>> {
    FormatSet::try_from_formats(vec![Format::new(name(FORMAT_KIND)?, properties()?)])
        .map_err(Into::into)
}

fn empty_state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    let source = json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": context.schema().id().name().as_str(),
            "version": context.schema().id().version().get(),
        },
        "schemaFingerprint": context.schema().fingerprint().to_string(),
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
                "children": [],
            }],
        },
    })
    .to_string();
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&source)?;
    let parent_path = NodePath::try_from_indices(vec![0])?;
    let point = Point::Children { parent_path, child_index: 0, affinity: Affinity::After };
    let selection: Selection = RangeSelection::new(point.clone(), point).into();
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, Some(selection), None)
        .map_err(Into::into)
}

fn typed_commit(context: &EditorContext) -> Result<Commit, Box<dyn Error>> {
    let before = empty_state(context, "local-log-entry-v3-properties")?;
    let replacement = TextFragment::try_from_runs(vec![TextRun::try_new("x", formats()?)?])?;
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    let operation: Operation =
        TextSplice::try_new(range, TextFragment::empty(), replacement)?.into();
    let transaction = Transaction::new(&before, vec![operation])
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats()?)));
    let TransactionOutcome::Committed(commit) = transaction.apply(context, &before)? else {
        return Err(test_error("typed transaction unexpectedly remained unchanged").into());
    };
    Ok(*commit)
}

fn entry(
    context: &EditorContext,
    event: LocalLogEvent,
    replay_id: &str,
) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new_with_schema_binding(
        context.schema().durable_binding(),
        LocalSessionId::try_new("session:local-log-v3")?,
        LocalLogId::try_new("log:local-log-v3")?,
        LocalLogSequence::FIRST,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn rejected(
    codec: &LocalLogEntryJsonCodecV3,
    json: &str,
) -> Result<LocalLogEntryV3CodecError, Box<dyn Error>> {
    codec
        .decode(json)
        .err()
        .ok_or_else(|| test_error("hostile Local Log Entry V3 unexpectedly decoded").into())
}

#[test]
fn typed_commit_and_replay_events_round_trip_without_losing_properties() -> TestResult {
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT, "breditor/local-log-entry");
    assert_eq!(LOCAL_LOG_ENTRY_V3_FORMAT_VERSION, 3);
    assert_eq!(COMMIT_V3_FORMAT_VERSION, 3);

    let context = context()?;
    let codec = LocalLogEntryJsonCodecV3::new(context.clone());
    assert_eq!(codec.context(), &context);
    let edit = typed_commit(&context)?;
    let undo = edit
        .undo_transaction(edit.after())?
        .apply(&context, edit.after())?
        .into_commit()
        .ok_or_else(|| test_error("typed undo unexpectedly remained unchanged"))?;
    let redo = edit
        .redo_transaction(undo.after())?
        .apply(&context, undo.after())?
        .into_commit()
        .ok_or_else(|| test_error("typed redo unexpectedly remained unchanged"))?;
    let entries = [
        entry(&context, LocalLogEvent::commit(edit), "replay:typed-commit")?,
        entry(&context, LocalLogEvent::try_undo(undo)?, "replay:typed-undo")?,
        entry(&context, LocalLogEvent::try_redo(redo)?, "replay:typed-redo")?,
    ];

    for original in entries {
        let encoded = codec.encode(&original)?;
        let value: Value = serde_json::from_str(&encoded)?;
        assert_eq!(value["formatVersion"], json!(3));
        assert_eq!(value["event"]["commit"]["formatVersion"], json!(3));
        assert_eq!(value["schemaFingerprint"], value["event"]["commit"]["schemaFingerprint"]);
        assert!(
            encoded.contains(&format!(r#""{PROPERTY_NAME}":true"#)),
            "typed property disappeared from {} entry",
            original.event_kind(),
        );
        let decoded = codec.decode(&encoded)?;
        assert_eq!(decoded, original);
        assert_eq!(codec.encode(&decoded)?, encoded);
    }
    Ok(())
}

#[test]
fn outer_and_nested_generations_never_mix() -> TestResult {
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT_VERSION, 1);
    assert_eq!(LOCAL_LOG_ENTRY_V2_FORMAT_VERSION, 2);
    assert_eq!(LOCAL_LOG_ENTRY_V3_FORMAT_VERSION, 3);

    let context = context()?;
    let v3 = LocalLogEntryJsonCodecV3::new(context.clone());
    let control = entry(&context, LocalLogEvent::close_history_group(), "replay:control")?;
    let v3_json = v3.encode(&control)?;

    assert!(matches!(
        LocalLogEntryJsonCodecV2::new(context.clone()).decode(&v3_json),
        Err(LocalLogEntryV2CodecError::UnsupportedFormatVersion { found: 3, supported: 2 })
    ));
    let v2_json = LocalLogEntryJsonCodecV2::new(context.clone()).encode(&control)?;
    assert!(matches!(
        rejected(&v3, &v2_json)?,
        LocalLogEntryV3CodecError::UnsupportedFormatVersion { found: 2, supported: 3 }
    ));

    let base_context = EditorContext::default();
    let base_control = LocalLogEntry::new(
        LocalSessionId::try_new("session:local-log-v3-base")?,
        LocalLogId::try_new("log:local-log-v3-base")?,
        LocalLogSequence::FIRST,
        ReplayId::try_new("replay:base-control")?,
        LocalLogEvent::close_history_group(),
    );
    let base_v3 = LocalLogEntryJsonCodecV3::new(base_context.clone());
    let base_v3_json = base_v3.encode(&base_control)?;
    assert!(matches!(
        LocalLogEntryJsonCodec::new(base_context.clone()).decode(&base_v3_json),
        Err(breditor_core::codec::LocalLogEntryCodecError::UnsupportedFormatVersion {
            found: 3,
            supported: 1,
        })
    ));
    let v1_json = LocalLogEntryJsonCodec::new(base_context).encode(&base_control)?;
    assert!(matches!(
        rejected(&base_v3, &v1_json)?,
        LocalLogEntryV3CodecError::UnsupportedFormatVersion { found: 1, supported: 3 }
    ));

    let commit_entry =
        entry(&context, LocalLogEvent::commit(typed_commit(&context)?), "replay:mixed-commit")?;
    let mut mixed: Value = serde_json::from_str(&v3.encode(&commit_entry)?)?;
    mixed["event"]["commit"]["formatVersion"] = json!(2);
    assert!(matches!(
        rejected(&v3, &serde_json::to_string(&mixed)?)?,
        LocalLogEntryV3CodecError::InvalidCommit {
            event_kind: LocalLogCommitEventKind::Commit,
            source,
        } if matches!(*source, CommitV3CodecError::UnsupportedFormatVersion {
            found: 2,
            supported: 3,
        })
    ));
    Ok(())
}

#[test]
fn strict_shape_and_outer_binding_fail_closed_before_event_reconstruction() -> TestResult {
    let context = context()?;
    let codec = LocalLogEntryJsonCodecV3::new(context.clone());
    let baseline_json =
        codec.encode(&entry(&context, LocalLogEvent::close_history_group(), "replay:shape")?)?;
    let baseline: Value = serde_json::from_str(&baseline_json)?;
    assert_eq!(baseline.as_object().map(Map::len), Some(9));

    for field in ["schema", "schemaFingerprint", "event"] {
        let mut missing = baseline.clone();
        missing
            .as_object_mut()
            .ok_or_else(|| test_error("fixture is not an object"))?
            .remove(field);
        assert!(matches!(
            rejected(&codec, &serde_json::to_string(&missing)?)?,
            LocalLogEntryV3CodecError::InvalidJson(_)
        ));
    }

    let mut unknown = baseline.clone();
    unknown
        .as_object_mut()
        .ok_or_else(|| test_error("fixture is not an object"))?
        .insert("authorization".to_owned(), json!("smuggled"));
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&unknown)?)?,
        LocalLogEntryV3CodecError::InvalidJson(_)
    ));

    let fingerprint = context.schema().fingerprint().to_string();
    let fingerprint_field = format!(r#""schemaFingerprint":"{fingerprint}""#);
    let duplicate = baseline_json.replacen(
        &fingerprint_field,
        &format!("{fingerprint_field},{fingerprint_field}"),
        1,
    );
    assert!(matches!(rejected(&codec, &duplicate)?, LocalLogEntryV3CodecError::InvalidJson(_)));

    let mut wrong_fingerprint = baseline.clone();
    wrong_fingerprint["schemaFingerprint"] =
        json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&wrong_fingerprint)?)?,
        LocalLogEntryV3CodecError::SchemaBinding(
            SchemaBindingError::SchemaFingerprintMismatch { .. }
        )
    ));

    let mut wrong_id_and_bad_fingerprint = baseline.clone();
    wrong_id_and_bad_fingerprint["schema"]["name"] = json!("other/schema");
    wrong_id_and_bad_fingerprint["schemaFingerprint"] = json!("malformed");
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&wrong_id_and_bad_fingerprint)?)?,
        LocalLogEntryV3CodecError::SchemaBinding(SchemaBindingError::SchemaIdMismatch { .. })
    ));

    let mut event_extra = baseline;
    event_extra["event"]["unexpected"] = json!(true);
    assert!(matches!(
        rejected(&codec, &serde_json::to_string(&event_extra)?)?,
        LocalLogEntryV3CodecError::InvalidJson(_)
    ));
    Ok(())
}

#[test]
fn shared_json_limit_is_exact_for_input_and_output() -> TestResult {
    let base_context = EditorContext::default();
    let entry = LocalLogEntry::new(
        LocalSessionId::try_new("session:limit")?,
        LocalLogId::try_new("log:limit")?,
        LocalLogSequence::FIRST,
        ReplayId::try_new("replay:limit")?,
        LocalLogEvent::close_history_group(),
    );
    let baseline = LocalLogEntryJsonCodecV3::new(base_context.clone()).encode(&entry)?;
    let exact_context = EditorContext::new(
        base_context.schema().clone(),
        DocumentLimits::default().with_max_json_bytes(baseline.len()),
    );
    let exact = LocalLogEntryJsonCodecV3::new(exact_context);
    assert_eq!(exact.encode(&entry)?, baseline);
    assert_eq!(exact.decode(&baseline)?, entry);

    let short_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_json_bytes(baseline.len() - 1),
    );
    let short = LocalLogEntryJsonCodecV3::new(short_context);
    assert!(matches!(
        short.decode(&baseline),
        Err(LocalLogEntryV3CodecError::InputTooLarge { .. })
    ));
    assert!(matches!(short.encode(&entry), Err(LocalLogEntryV3CodecError::OutputTooLarge { .. })));
    assert_eq!(
        LocalLogEntryV3CodecError::OutputTooLarge { minimum: 2, maximum: 1 }.code(),
        CodecErrorCode::OutputTooLarge,
    );
    Ok(())
}
