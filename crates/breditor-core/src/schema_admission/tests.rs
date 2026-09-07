use std::{collections::BTreeMap, error::Error, io};

use crate::{
    codec::{
        LOCAL_LOG_CHECKPOINT_FORMAT, LocalLogCheckpointJsonCodecV2, LocalLogCheckpointLimits,
        LocalLogFrameLimits, LocalLogStorageRootBinding, LocalLogStorageRootJsonCodecV2,
        LocalLogStorageRootPreparationInputs, SessionCheckpointLimits,
    },
    document::{
        Document, DocumentSchemaAdmissionError, ElementNode, FormatSet, NodeRef, PropertyMap,
        TextFragment, TextRun,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1,
    },
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId,
        LocalLogSequence, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
        LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    session::{EditorSession, HistoryCapacity},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{HistoryIntent, Transaction, TransactionMetadata},
};

use super::{SchemaAdmissionError, SchemaAdmissionErrorCode, SchemaAdmissionRequest};

type TestResult = Result<(), Box<dyn Error>>;

fn test_failure(message: impl Into<String>) -> io::Error {
    io::Error::other(message.into())
}

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

fn state(
    context: &EditorContext,
    lineage: &str,
    paragraphs: usize,
) -> Result<EditorState, Box<dyn Error>> {
    let children = (0..paragraphs).map(|_| empty_paragraph()).collect::<Result<Vec<_>, _>>()?;
    let root = ElementNode::try_new(
        QualifiedName::from_known_static("breditor/document"),
        None,
        PropertyMap::default(),
        children,
    )
    .map(NodeRef::element)?;
    let document = Document::try_new(context.schema(), root, context.limits())?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insert_text(session: &mut EditorSession, text: &str) -> TestResult {
    let offset = TextOffset::try_new(0)?;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(
        session.state().context(),
        session.state().document(),
        range,
        replacement,
    )?;
    let transaction = Transaction::new(session.state(), vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let outcome = session.apply_transaction(&transaction)?;
    if outcome.into_commit().is_none() {
        return Err(test_failure("test insertion unexpectedly remained unchanged").into());
    }
    Ok(())
}

fn source_anchor(
    paragraphs: usize,
    with_history: bool,
) -> Result<LocalLogCheckpointAnchor, Box<dyn Error>> {
    let context = EditorContext::default();
    let mut session = EditorSession::with_history_capacity(
        state(&context, "source-lineage", paragraphs)?,
        HistoryCapacity::try_new(7)?,
    );
    if with_history {
        insert_text(&mut session, "PRIVATE_ADMISSION_DOCUMENT")?;
    }

    let mut tombstones = BTreeMap::new();
    let covered_through = if with_history {
        tombstones.insert(ReplayId::try_new("replay:source")?, LocalLogSequence::FIRST);
        Some(LocalLogSequence::FIRST)
    } else {
        None
    };
    LocalLogCheckpointAnchor::try_from_checkpoint_parts(
        LocalSessionId::try_new("session:source")?,
        LocalLogId::try_new("log:source-sealed")?,
        LocalLogId::try_new("log:source-active")?,
        LocalLogCompactionLimits::default(),
        session,
        tombstones,
        covered_through,
    )
    .map_err(|error| test_failure(format!("invalid test source checkpoint: {error:?}")).into())
}

fn target_request() -> Result<SchemaAdmissionRequest, Box<dyn Error>> {
    let context = EditorContext::new(
        CompiledSchema::test_semantic_variant_same_id(),
        DocumentLimits::default(),
    );
    let binding = LocalLogCheckpointBinding::try_new(
        LocalSessionId::try_new("session:target")?,
        LocalLogId::try_new("log:target-sealed")?,
        LocalLogId::try_new("log:target-active")?,
    )?;
    Ok(SchemaAdmissionRequest::new(
        context,
        LineageId::try_new("target-lineage")?,
        binding,
        HistoryCapacity::try_new(9)?,
    ))
}

fn extension_profile_request() -> Result<SchemaAdmissionRequest, Box<dyn Error>> {
    let manifest = ExtensionManifest::try_new_with_inline_formats(
        ExtensionId::new(
            QualifiedName::try_new("example/admission-extension")?,
            ExtensionVersion::try_new(1)?,
        ),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(
            QualifiedName::try_new("example/emphasis")?,
            PersistedTypeRevision::one(),
        )],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    let schema = CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(
            QualifiedName::try_new("example/admission-profile")?,
            SchemaVersion::try_new(1)?,
        ),
        &extensions,
    )?;
    Ok(SchemaAdmissionRequest::new(
        EditorContext::new(schema, DocumentLimits::default()),
        LineageId::try_new("extension-profile-lineage")?,
        LocalLogCheckpointBinding::try_new(
            LocalSessionId::try_new("session:extension-profile")?,
            LocalLogId::try_new("log:extension-profile-sealed")?,
            LocalLogId::try_new("log:extension-profile-active")?,
        )?,
        HistoryCapacity::try_new(9)?,
    ))
}

#[test]
fn compiled_extension_profile_is_a_real_structural_admission_target() -> TestResult {
    let source = source_anchor(1, false)?;
    let request = extension_profile_request()?;
    let prepared = request.try_prepare(&source)?;

    assert_eq!(
        prepared.target_schema_binding(),
        &request.target_context().schema().durable_binding()
    );
    assert!(
        source.session().state().document().root().shares_allocation_with(
            prepared.target_checkpoint().session().state().document().root()
        )
    );
    let codec = LocalLogCheckpointJsonCodecV2::new(
        request.target_context().clone(),
        request.target_checkpoint_binding().clone(),
    );
    let decoded = codec.decode(prepared.target_checkpoint_json())?;
    assert_eq!(codec.encode(&decoded)?, prepared.target_checkpoint_json());
    Ok(())
}

#[test]
fn success_preserves_ast_resets_history_and_emits_one_canonical_v2_checkpoint() -> TestResult {
    let source = source_anchor(2, true)?;
    let request = target_request()?;
    let source_state = source.session().state().clone();
    let source_history = source.session().history_status();
    let source_codec = LocalLogCheckpointJsonCodecV2::new(
        source.session().state().context().clone(),
        LocalLogCheckpointBinding::try_new(
            source.session_id().clone(),
            source.checkpoint_log_id().clone(),
            source.successor_log_id().clone(),
        )?,
    );
    let source_json = source_codec.encode(&source)?;

    let prepared = request.try_prepare(&source)?;
    let target = prepared.target_checkpoint();
    assert_ne!(prepared.source_schema_binding(), prepared.target_schema_binding());
    assert_eq!(prepared.source_lineage(), source_state.snapshot().lineage());
    assert_eq!(prepared.target_lineage(), request.target_lineage());
    assert_eq!(prepared.source_session_id(), source.session_id());
    assert_eq!(target.session_id(), request.target_checkpoint_binding().session_id());
    assert_eq!(target.session().state().snapshot().revision(), Revision::ZERO);
    assert_eq!(target.session().history_capacity(), HistoryCapacity::try_new(9)?);
    assert_eq!((target.session().undo_depth(), target.session().redo_depth()), (0, 0));
    assert_eq!(target.checkpoint_covered_through(), None);
    assert_eq!(target.compacted_replay_count(), 0);
    assert_eq!(target.session().state().selection(), None);
    assert_eq!(target.session().state().pending_formats(), None);
    assert!(
        source_state
            .document()
            .root()
            .shares_allocation_with(target.session().state().document().root())
    );
    assert!(prepared.target_checkpoint_json().starts_with(&format!(
        "{{\"format\":\"{LOCAL_LOG_CHECKPOINT_FORMAT}\",\"formatVersion\":2"
    )));

    let target_codec = LocalLogCheckpointJsonCodecV2::new(
        request.target_context().clone(),
        request.target_checkpoint_binding().clone(),
    )
    .with_limits(*request.checkpoint_limits());
    let decoded = target_codec.decode(prepared.target_checkpoint_json())?;
    assert_eq!(target_codec.encode(&decoded)?, prepared.target_checkpoint_json());

    assert_eq!(source.session().state(), &source_state);
    assert_eq!(source.session().history_status(), source_history);
    assert_eq!(source_codec.encode(&source)?, source_json);
    let debug = format!("{prepared:?}");
    assert!(!debug.contains("PRIVATE_ADMISSION_DOCUMENT"));
    assert!(!debug.contains(prepared.target_checkpoint_json()));
    Ok(())
}

#[test]
fn admission_prepares_one_unpublished_exact_v2_storage_root() -> TestResult {
    let source = source_anchor(2, true)?;
    let source_state = source.session().state().clone();
    let source_history = source.session().history_status();
    let request = target_request()?;
    let prepared = request.try_prepare(&source)?;
    let root_binding = LocalLogStorageRootBinding::new(
        LocalLogStorageProfileId::try_new("breditor/admission-storage-tests")?,
        LocalLogStorageProfileVersion::try_new(1)?,
        LocalLogStorageScopeId::try_new("scope:admission-storage-tests")?,
        LocalLogStorageHeadId::try_new("head:admission-storage-tests:h0")?,
    );
    let inputs = LocalLogStorageRootPreparationInputs::new(
        LocalLogStorageTransactionId::try_new("transaction:admission-storage-tests:root")?,
        LocalLogStorageFenceId::try_new("fence:admission-storage-tests:f0")?,
        LocalLogFrameLimits::new(8_192),
    );
    let codec = LocalLogStorageRootJsonCodecV2::new(request.target_context().clone(), root_binding);

    let selection = codec.prepare_root_from_schema_admission(&prepared, &inputs)?;
    assert_eq!(selection.schema_binding(), prepared.target_schema_binding());
    assert_eq!(selection.session_id(), prepared.target_checkpoint().session_id());
    assert_eq!(selection.checkpoint_log_id(), prepared.target_checkpoint().checkpoint_log_id());
    assert_eq!(selection.active_log_id(), prepared.target_checkpoint().successor_log_id());
    assert_eq!(selection.active_frame().format_version(), 2);
    assert_eq!(selection.checkpoint_json(), prepared.target_checkpoint_json());

    let encoded = codec.encode_root(&selection)?;
    let decoded = codec.decode_root(&encoded)?;
    assert_eq!(decoded, selection);
    assert_eq!(codec.encode_root(&decoded)?, encoded);
    assert_eq!(source.session().state(), &source_state);
    assert_eq!(source.session().history_status(), source_history);
    Ok(())
}

#[test]
fn identity_and_same_fingerprint_rejections_leave_source_unchanged() -> TestResult {
    let source = source_anchor(2, false)?;
    let before_state = source.session().state().clone();
    let before_history = source.session().history_status();

    let same_schema = SchemaAdmissionRequest::new(
        EditorContext::default(),
        LineageId::try_new("different-lineage")?,
        LocalLogCheckpointBinding::try_new(
            LocalSessionId::try_new("session:different")?,
            LocalLogId::try_new("log:different-sealed")?,
            LocalLogId::try_new("log:different-active")?,
        )?,
        HistoryCapacity::default(),
    );
    let Err(error) = same_schema.try_prepare(&source) else {
        return Err(test_failure("same-fingerprint admission unexpectedly succeeded").into());
    };
    assert_eq!(error.code(), SchemaAdmissionErrorCode::UnchangedFingerprint);

    let request = target_request()?;
    let reused_lineage = SchemaAdmissionRequest::new(
        request.target_context().clone(),
        source.session().state().snapshot().lineage().clone(),
        request.target_checkpoint_binding().clone(),
        request.target_history_capacity(),
    );
    let Err(error) = reused_lineage.try_prepare(&source) else {
        return Err(test_failure("reused lineage unexpectedly succeeded").into());
    };
    assert_eq!(error.code(), SchemaAdmissionErrorCode::ReusedLineage);

    let reused_session = SchemaAdmissionRequest::new(
        request.target_context().clone(),
        request.target_lineage().clone(),
        LocalLogCheckpointBinding::try_new(
            source.session_id().clone(),
            LocalLogId::try_new("log:reused-session-sealed")?,
            LocalLogId::try_new("log:reused-session-active")?,
        )?,
        request.target_history_capacity(),
    );
    let Err(error) = reused_session.try_prepare(&source) else {
        return Err(test_failure("reused session unexpectedly succeeded").into());
    };
    assert_eq!(error.code(), SchemaAdmissionErrorCode::ReusedSession);
    assert_eq!(source.session().state(), &before_state);
    assert_eq!(source.session().history_status(), before_history);
    Ok(())
}

#[test]
fn target_rejection_and_checkpoint_policy_failure_are_non_destructive() -> TestResult {
    let source = source_anchor(1, false)?;
    let before_state = source.session().state().clone();
    let before_history = source.session().history_status();
    let request = target_request()?;
    let Err(error) = request.try_prepare(&source) else {
        return Err(test_failure("target-incompatible tree unexpectedly admitted").into());
    };
    assert_eq!(error.code(), SchemaAdmissionErrorCode::Document);
    assert!(matches!(
        error,
        SchemaAdmissionError::Document(source)
            if matches!(*source, DocumentSchemaAdmissionError::TargetValidation(_))
    ));

    let source = source_anchor(2, false)?;
    let before_state_2 = source.session().state().clone();
    let before_history_2 = source.session().history_status();
    let denied_capacity = LocalLogCheckpointLimits::default().with_session_checkpoint(
        SessionCheckpointLimits::default().with_max_history_capacity(HistoryCapacity::DISABLED),
    );
    let Err(error) = target_request()?.with_checkpoint_limits(denied_capacity).try_prepare(&source)
    else {
        return Err(test_failure("over-policy target checkpoint unexpectedly encoded").into());
    };
    assert_eq!(error.code(), SchemaAdmissionErrorCode::CheckpointEncoding);

    assert_eq!(source.session().state(), &before_state_2);
    assert_eq!(source.session().history_status(), before_history_2);
    assert_eq!(before_state.snapshot().lineage().as_str(), "source-lineage");
    assert_eq!(before_history.undo_depth(), 0);
    Ok(())
}

#[test]
fn error_codes_are_stable_and_complete() {
    assert_eq!(
        SchemaAdmissionErrorCode::UnchangedFingerprint.as_str(),
        "schema_admission.unchanged_fingerprint"
    );
    assert_eq!(SchemaAdmissionErrorCode::ReusedLineage.as_str(), "schema_admission.reused_lineage");
    assert_eq!(SchemaAdmissionErrorCode::ReusedSession.as_str(), "schema_admission.reused_session");
    assert_eq!(SchemaAdmissionErrorCode::Document.as_str(), "schema_admission.document");
    assert_eq!(SchemaAdmissionErrorCode::TargetState.as_str(), "schema_admission.target_state");
    assert_eq!(
        SchemaAdmissionErrorCode::CheckpointInvariant.as_str(),
        "schema_admission.checkpoint_invariant"
    );
    assert_eq!(
        SchemaAdmissionErrorCode::CheckpointEncoding.as_str(),
        "schema_admission.checkpoint_encoding"
    );
}
