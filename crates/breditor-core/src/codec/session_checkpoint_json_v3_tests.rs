use std::{error::Error, io};

use serde_json::{Value, json};

use crate::{
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
    operation::{TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionOutcome},
};

use super::{
    CodecErrorCode, DocumentJsonCodecV2, RetainedResourceKind,
    SESSION_CHECKPOINT_V3_FORMAT_VERSION, SessionCheckpointApplicationErrorCode,
    SessionCheckpointCodecError, SessionCheckpointJsonCodecV3, SessionCheckpointLimits,
    SessionCheckpointRecordErrorCode, SessionCheckpointRecordLocation,
    SessionCheckpointReplayDirection, SessionCheckpointResourceLimit,
    SessionCheckpointV3CodecError,
};

const LINK: &str = "example/link";
const ENABLED: &str = "example/enabled";
const HREF: &str = "example/href";
const PRIORITY: &str = "example/priority";
const SECRET: &str = "top-secret-history-value";

type TestResult = Result<(), Box<dyn Error>>;

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
        ExtensionId::new(name("example/session-v3-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/session-v3")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn context() -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(typed_schema()?, DocumentLimits::default()))
}

fn plain_document(context: &EditorContext) -> Result<Document, Box<dyn Error>> {
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

fn link_formats(value: &str) -> Result<FormatSet, Box<dyn Error>> {
    let properties = PropertyMap::try_from_sorted(vec![
        (name(ENABLED)?, PropertyValue::boolean(true)),
        (name(HREF)?, PropertyValue::from_string(value)),
        (name(PRIORITY)?, PropertyValue::from_integer(PropertyInteger::try_new(7)?)),
    ])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK)?, properties)]).map_err(Into::into)
}

fn initial_state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        plain_document(context)?,
        Some(selection(0, Affinity::Before)?),
        None,
    )
    .map_err(Into::into)
}

fn format_transaction(state: &EditorState) -> Result<Transaction, Box<dyn Error>> {
    let formats = link_formats(SECRET)?;
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

fn recorded_session(
    context: &EditorContext,
    lineage: &str,
) -> Result<(EditorSession, EditorState, EditorState), Box<dyn Error>> {
    let initial = initial_state(context, lineage)?;
    let mut session = EditorSession::new(initial.clone());
    let outcome = session.apply_transaction(&format_transaction(session.state())?)?;
    if !matches!(outcome, TransactionOutcome::Committed(_)) {
        return Err(io::Error::other("format transaction unexpectedly remained unchanged").into());
    }
    let formatted = session.state().clone();
    Ok((session, initial, formatted))
}

fn pending_only_state(
    context: &EditorContext,
    lineage: &str,
    href: &str,
) -> Result<EditorState, Box<dyn Error>> {
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        plain_document(context)?,
        Some(selection(0, Affinity::Before)?),
        Some(link_formats(href)?),
    )
    .map_err(Into::into)
}

fn replace_plain_text_and_set_pending(
    state: &EditorState,
    replacement: &str,
    href: &str,
) -> Result<Transaction, Box<dyn Error>> {
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::try_new(1)?,
    )?;
    let replacement = TextFragment::from(TextRun::try_new(replacement, FormatSet::default())?);
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(link_formats(href)?))))
}

fn pending_only_history_session(
    context: &EditorContext,
    lineage: &str,
) -> Result<EditorSession, Box<dyn Error>> {
    let mut session = EditorSession::new(pending_only_state(context, lineage, "a")?);
    for (replacement, href) in [("y", "bb"), ("z", "ccc")] {
        let transaction = replace_plain_text_and_set_pending(session.state(), replacement, href)?;
        let outcome = session.apply_transaction(&transaction)?;
        if !matches!(outcome, TransactionOutcome::Committed(_)) {
            return Err(io::Error::other(
                "pending-only budget fixture unexpectedly remained unchanged",
            )
            .into());
        }
    }
    assert_eq!(session.undo_depth(), 2);
    assert_eq!(session.state().document().summary().property_value_count(), 0);
    assert_eq!(session.state().document().summary().total_property_string_bytes(), 0);
    Ok(session)
}

fn assert_same_semantics(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.snapshot().lineage(), expected.snapshot().lineage());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

fn decode_error(
    codec: &SessionCheckpointJsonCodecV3,
    json: &str,
) -> Result<SessionCheckpointV3CodecError, Box<dyn Error>> {
    codec.decode(json).err().ok_or_else(|| {
        io::Error::other("invalid Session Checkpoint V3 unexpectedly decoded").into()
    })
}

fn encode_error(
    codec: &SessionCheckpointJsonCodecV3,
    session: &EditorSession,
) -> Result<SessionCheckpointV3CodecError, Box<dyn Error>> {
    codec.encode(session).err().ok_or_else(|| {
        io::Error::other("over-limit Session Checkpoint V3 unexpectedly encoded").into()
    })
}

fn is_retained_limit_error(
    error: &SessionCheckpointV3CodecError,
    expected_kind: RetainedResourceKind,
    expected_boundary: u64,
    expected_actual: u64,
    expected_maximum: u64,
) -> bool {
    matches!(
        error,
        SessionCheckpointV3CodecError::InvalidCheckpoint(source)
            if matches!(
                source.as_ref(),
                SessionCheckpointCodecError::ResourceLimit(
                    SessionCheckpointResourceLimit::Retained {
                        kind,
                        boundary_index,
                        actual,
                        maximum,
                    }
                ) if *kind == expected_kind
                    && *boundary_index == expected_boundary
                    && *actual == expected_actual
                    && *maximum == expected_maximum
            )
    )
}

#[test]
fn typed_history_and_pending_formats_round_trip_through_both_replay_directions() -> TestResult {
    assert_eq!(SESSION_CHECKPOINT_V3_FORMAT_VERSION, 3);
    let context = context()?;
    let (session, initial, formatted) = recorded_session(&context, "session-v3-round-trip")?;
    let codec = SessionCheckpointJsonCodecV3::new(context.clone());
    assert_eq!(codec.context(), &context);
    assert_eq!(codec.limits(), &SessionCheckpointLimits::default());

    let encoded = codec.encode(&session)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["formatVersion"], json!(3));
    assert_eq!(value["historyBase"]["formatVersion"], json!(3));
    assert_eq!(value["historyBase"]["document"]["formatVersion"], json!(2));
    let operation_properties = &value["entries"][0]["forwardOperations"][0]["replacement"]["runs"]
        [0]["formats"][0]["properties"];
    assert_eq!(operation_properties[ENABLED], json!(true));
    assert_eq!(operation_properties[HREF], json!(SECRET));
    assert_eq!(operation_properties[PRIORITY], json!(7));
    assert_eq!(value["entries"][0]["resultPendingFormats"][0]["properties"], *operation_properties);

    let mut restored = codec.decode(&encoded)?;
    assert_eq!(restored.state(), session.state());
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 0);
    assert_eq!(codec.encode(&restored)?, encoded);

    assert!(restored.undo()?.is_some());
    assert_same_semantics(restored.state(), &initial);
    assert_eq!(restored.undo_depth(), 0);
    assert_eq!(restored.redo_depth(), 1);
    assert!(restored.redo()?.is_some());
    assert_same_semantics(restored.state(), &formatted);
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 0);

    let mut redo_source = codec.decode(&encoded)?;
    assert!(redo_source.undo()?.is_some());
    let redo_checkpoint = codec.encode(&redo_source)?;
    let mut restored_redo = codec.decode(&redo_checkpoint)?;
    assert_eq!(restored_redo.undo_depth(), 0);
    assert_eq!(restored_redo.redo_depth(), 1);
    assert_same_semantics(restored_redo.state(), &initial);
    assert!(restored_redo.redo()?.is_some());
    assert_same_semantics(restored_redo.state(), &formatted);
    Ok(())
}

#[test]
fn input_and_output_use_the_exact_same_utf8_byte_ceiling() -> TestResult {
    let schema = typed_schema()?;
    let generous = EditorContext::new(schema.clone(), DocumentLimits::default());
    let (session, _, _) = recorded_session(&generous, "session-v3-byte-limit")?;
    let encoded = SessionCheckpointJsonCodecV3::new(generous).encode(&session)?;
    let exact_size = encoded.len();

    let exact_context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default().with_max_json_bytes(exact_size),
    );
    let (exact_session, _, _) = recorded_session(&exact_context, "session-v3-byte-limit")?;
    let exact_codec = SessionCheckpointJsonCodecV3::new(exact_context);
    assert_eq!(exact_codec.encode(&exact_session)?, encoded);
    assert_eq!(exact_codec.decode(&encoded)?.state(), exact_session.state());

    let tight_context =
        EditorContext::new(schema, DocumentLimits::default().with_max_json_bytes(exact_size - 1));
    let (tight_session, _, _) = recorded_session(&tight_context, "session-v3-byte-limit")?;
    let tight_codec = SessionCheckpointJsonCodecV3::new(tight_context);
    assert!(matches!(
        tight_codec.encode(&tight_session),
        Err(SessionCheckpointV3CodecError::OutputTooLarge { maximum, .. })
            if maximum == exact_size - 1
    ));
    assert!(matches!(
        tight_codec.decode(&encoded),
        Err(SessionCheckpointV3CodecError::InputTooLarge { actual, maximum })
            if actual == exact_size && maximum == exact_size - 1
    ));
    Ok(())
}

#[test]
fn hostile_property_payloads_are_rejected_without_retaining_names_or_values() -> TestResult {
    let context = context()?;
    let (session, _, _) = recorded_session(&context, "session-v3-hostile")?;
    let codec = SessionCheckpointJsonCodecV3::new(context);
    let valid = codec.encode(&session)?;
    let hostile = valid.replacen(
        &format!(r#""{HREF}":"{SECRET}""#),
        r#""SECRET INVALID":"SENSITIVE_HOSTILE_VALUE""#,
        1,
    );
    assert_ne!(hostile, valid);

    let error = decode_error(&codec, &hostile)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidJson);
    let diagnostic = error.to_string();
    assert!(!diagnostic.contains("SECRET INVALID"));
    assert!(!diagnostic.contains("SENSITIVE_HOSTILE_VALUE"));
    assert!(!diagnostic.contains(SECRET));
    Ok(())
}

#[test]
fn aggregate_operation_and_retained_property_limits_apply_both_directions() -> TestResult {
    let context = context()?;
    let (session, _, _) = recorded_session(&context, "session-v3-limits")?;
    let encoded = SessionCheckpointJsonCodecV3::new(context.clone()).encode(&session)?;
    let secret_bytes = u64::try_from(SECRET.len())?;
    let limits = [
        SessionCheckpointLimits::default().with_max_aggregate_forward_operations(0),
        SessionCheckpointLimits::default().with_max_retained_property_values(2),
        SessionCheckpointLimits::default()
            .with_max_retained_property_string_bytes(secret_bytes.saturating_sub(1)),
    ];

    for limits in limits {
        let limited = SessionCheckpointJsonCodecV3::new(context.clone()).with_limits(limits);
        assert_eq!(decode_error(&limited, &encoded)?.code(), CodecErrorCode::ResourceLimit);
        assert_eq!(encode_error(&limited, &session)?.code(), CodecErrorCode::ResourceLimit);
    }
    Ok(())
}

#[test]
fn retained_budget_counts_pending_properties_on_a_history_free_base_exactly_once() -> TestResult {
    let context = context()?;
    let session =
        EditorSession::new(pending_only_state(&context, "session-v3-pending-base-budget", SECRET)?);
    assert_eq!(session.state().document().summary().property_value_count(), 0);
    let encoded = SessionCheckpointJsonCodecV3::new(context.clone()).encode(&session)?;
    let secret_bytes = u64::try_from(SECRET.len())?;

    let exact_limits = SessionCheckpointLimits::default()
        .with_max_retained_property_values(3)
        .with_max_retained_property_string_bytes(secret_bytes);
    let exact_codec = SessionCheckpointJsonCodecV3::new(context.clone()).with_limits(exact_limits);
    assert_eq!(exact_codec.encode(&session)?, encoded);
    assert_eq!(exact_codec.decode(&encoded)?.state(), session.state());

    let value_excess = SessionCheckpointJsonCodecV3::new(context.clone())
        .with_limits(exact_limits.with_max_retained_property_values(2));
    for error in [decode_error(&value_excess, &encoded)?, encode_error(&value_excess, &session)?] {
        assert!(is_retained_limit_error(&error, RetainedResourceKind::PropertyValues, 0, 3, 2,));
        assert!(!error.to_string().contains("session-v3-pending-base-budget"));
        assert!(!error.to_string().contains(SECRET));
    }

    let string_excess = SessionCheckpointJsonCodecV3::new(context)
        .with_limits(exact_limits.with_max_retained_property_string_bytes(secret_bytes - 1));
    for error in [decode_error(&string_excess, &encoded)?, encode_error(&string_excess, &session)?]
    {
        assert!(is_retained_limit_error(
            &error,
            RetainedResourceKind::PropertyStringBytes,
            0,
            secret_bytes,
            secret_bytes - 1,
        ));
    }
    Ok(())
}

#[test]
fn retained_budget_counts_pending_properties_at_every_entry_result_boundary() -> TestResult {
    let context = context()?;
    let session = pending_only_history_session(&context, "session-v3-pending-entry-budget")?;
    let encoded = SessionCheckpointJsonCodecV3::new(context.clone()).encode(&session)?;
    let wire: Value = serde_json::from_str(&encoded)?;
    assert_eq!(wire["historyBase"]["pendingFormats"][0]["properties"][HREF], json!("a"));
    assert_eq!(wire["entries"][0]["resultPendingFormats"][0]["properties"][HREF], json!("bb"));
    assert_eq!(wire["entries"][1]["resultPendingFormats"][0]["properties"][HREF], json!("ccc"));

    // Three scalar properties and 1 + 2 + 3 property-string bytes are retained
    // at each of the base, first-result, and second-result boundaries.
    let exact_limits = SessionCheckpointLimits::default()
        .with_max_retained_property_values(9)
        .with_max_retained_property_string_bytes(6);
    let exact_codec = SessionCheckpointJsonCodecV3::new(context.clone()).with_limits(exact_limits);
    assert_eq!(exact_codec.encode(&session)?, encoded);
    assert_eq!(exact_codec.decode(&encoded)?.state(), session.state());

    let value_excess = SessionCheckpointJsonCodecV3::new(context.clone())
        .with_limits(exact_limits.with_max_retained_property_values(8));
    for error in [decode_error(&value_excess, &encoded)?, encode_error(&value_excess, &session)?] {
        assert!(is_retained_limit_error(&error, RetainedResourceKind::PropertyValues, 2, 9, 8,));
    }

    let string_excess = SessionCheckpointJsonCodecV3::new(context)
        .with_limits(exact_limits.with_max_retained_property_string_bytes(5));
    for error in [decode_error(&string_excess, &encoded)?, encode_error(&string_excess, &session)?]
    {
        assert!(is_retained_limit_error(
            &error,
            RetainedResourceKind::PropertyStringBytes,
            2,
            6,
            5,
        ));
    }
    Ok(())
}

#[test]
fn outer_state_pending_and_operation_generations_cannot_be_mixed() -> TestResult {
    let context = context()?;
    let (session, _, _) = recorded_session(&context, "session-v3-mixed")?;
    let codec = SessionCheckpointJsonCodecV3::new(context);
    let encoded = codec.encode(&session)?;

    let outer_v2 = encoded.replacen(r#""formatVersion":3"#, r#""formatVersion":2"#, 1);
    assert_eq!(decode_error(&codec, &outer_v2)?.code(), CodecErrorCode::UnsupportedFormatVersion);

    let mut mixed_base: Value = serde_json::from_str(&encoded)?;
    mixed_base["historyBase"]["formatVersion"] = json!(2);
    assert!(matches!(
        decode_error(&codec, &serde_json::to_string(&mixed_base)?)?,
        SessionCheckpointV3CodecError::InvalidHistoryBase(source)
            if source.code() == CodecErrorCode::UnsupportedFormatVersion
    ));

    let mut mixed_pending: Value = serde_json::from_str(&encoded)?;
    mixed_pending["entries"][0]["resultPendingFormats"][0]["properties"] = json!({});
    let error = decode_error(&codec, &serde_json::to_string(&mixed_pending)?)?;
    let SessionCheckpointV3CodecError::InvalidCheckpoint(source) = error else {
        return Err(io::Error::other("mixed pending format returned the wrong error layer").into());
    };
    let SessionCheckpointCodecError::InvalidRecord(record) = *source else {
        return Err(
            io::Error::other("mixed pending format returned the wrong payload error").into()
        );
    };
    assert_eq!(record.code(), SessionCheckpointRecordErrorCode::PendingFormatNotAllowed);
    assert_eq!(
        record.location(),
        SessionCheckpointRecordLocation::EntryResultPendingFormat {
            entry_index: 0,
            format_index: 0,
        }
    );

    let mut mixed_operation: Value = serde_json::from_str(&encoded)?;
    mixed_operation["entries"][0]["forwardOperations"][0]["replacement"]["runs"][0]["formats"][0]
        ["properties"] = json!({});
    assert_eq!(
        decode_error(&codec, &serde_json::to_string(&mixed_operation)?)?.code(),
        CodecErrorCode::ValidationFailed
    );
    Ok(())
}

#[test]
fn guarded_forward_replay_is_proved_instead_of_trusting_the_wire() -> TestResult {
    let context = context()?;
    let (session, _, _) = recorded_session(&context, "session-v3-replay")?;
    let codec = SessionCheckpointJsonCodecV3::new(context);
    let mut hostile: Value = serde_json::from_str(&codec.encode(&session)?)?;
    hostile["entries"][0]["forwardOperations"][0]["expectedRemoved"]["runs"][0]["text"] =
        json!("y");

    let error = decode_error(&codec, &serde_json::to_string(&hostile)?)?;
    assert_eq!(error.code(), CodecErrorCode::InvalidSessionCheckpoint);
    let SessionCheckpointV3CodecError::InvalidCheckpoint(source) = error else {
        return Err(io::Error::other("replay failure returned the wrong error layer").into());
    };
    let SessionCheckpointCodecError::Apply(application) = *source else {
        return Err(io::Error::other("guard mismatch was not classified as replay failure").into());
    };
    assert_eq!(application.entry_index(), 0);
    assert_eq!(application.direction(), SessionCheckpointReplayDirection::Forward);
    assert_eq!(application.code(), SessionCheckpointApplicationErrorCode::Operation);
    assert_eq!(application.operation_index(), Some(0));
    Ok(())
}
