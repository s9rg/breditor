use std::error::Error;

use crate::{
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
        LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
        LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
        LocalSessionId,
    },
    schema::{CompiledSchema, DocumentLimits},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};

use super::{
    DocumentJsonCodec, LOCAL_LOG_CHECKPOINT_FORMAT, LOCAL_LOG_STORAGE_GENERATION_FORMAT,
    LOCAL_LOG_STORAGE_ROOT_FORMAT, LocalLogCheckpointJsonCodecV2, LocalLogFrameLimits,
    LocalLogStorageGenerationBinding, LocalLogStorageGenerationJsonCodecV2,
    LocalLogStorageGenerationLimits, LocalLogStorageGenerationPreparationInputs,
    LocalLogStorageGenerationV2CodecError, LocalLogStorageRootBinding,
    LocalLogStorageRootCodecError, LocalLogStorageRootJsonCodec, LocalLogStorageRootJsonCodecV2,
    LocalLogStorageRootPreparationInputs, LocalLogStorageRootResourceLimit,
    LocalLogStorageRootV2CodecError, LocalLogStorageSelectedActiveGenerationBindingV2,
    LocalLogStorageSelectedBindingV2, LocalLogStorageSelectedCheckpointGenerationBindingV2,
    LocalLogStorageSelectedJsonCodecV2, LocalLogStorageSelectedRootV2,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding, LocalLogTailCursor,
    LocalLogTailCursorV2,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PROFILE: &str = "breditor/storage-v2-tests";
const SCOPE: &str = "scope:storage-v2-tests";
const DATABASE_INCARNATION: &str = "database:storage-v2-tests";
const SCOPE_INCARNATION: &str = "scope-incarnation:storage-v2-tests";
const SESSION: &str = "session:storage-v2-tests";
const ROOT_TRANSACTION: &str = "transaction:storage-v2-tests:root";
const ROOT_HEAD: &str = "head:storage-v2-tests:h0";
const ROOT_FENCE: &str = "fence:storage-v2-tests:f0";
const ROTATION_TRANSACTION: &str = "transaction:storage-v2-tests:rotation";
const ROTATION_HEAD: &str = "head:storage-v2-tests:h1";
const ROTATION_FENCE: &str = "fence:storage-v2-tests:f1";

struct StorageV2Fixture {
    context: EditorContext,
    root_binding: LocalLogStorageRootBinding,
    root_outcome: super::LocalLogTailCompactionOutcomeV2,
    root_inputs: LocalLogStorageRootPreparationInputs,
    database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    scope_incarnation_id: LocalLogStorageScopeIncarnationId,
}

impl StorageV2Fixture {
    fn new() -> TestResult<Self> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"STORAGEV2PAYLOADSENTINEL","formats":[]}]}]}}"#,
            )?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("storage-v2-tests")?,
            document,
            None,
            None,
        )?;
        let initial = LocalLogRecovery::new(
            LocalSessionId::try_new(SESSION)?,
            LocalLogId::try_new("log:storage-v2-tests:g0")?,
        )
        .recover(EditorSession::new(state), Vec::new())?
        .try_into_checkpoint_anchor(
            LocalLogId::try_new("log:storage-v2-tests:g1")?,
            LocalLogCompactionLimits::default(),
        )?;
        let sealed_frame_limits = LocalLogFrameLimits::new(4_096);
        let cursor =
            initial.begin_successor_tail_v2(LocalLogRecoveryLimits::default(), sealed_frame_limits);
        let (owner, _, retained_limits, _) = cursor.into_parts();
        let root_outcome = LocalLogTailCursorV2::from_trusted_parts(owner, 123, retained_limits)
            .try_into_checkpoint_anchor(LocalLogId::try_new("log:storage-v2-tests:g2")?)?;

        let root_binding = LocalLogStorageRootBinding::new(
            LocalLogStorageProfileId::try_new(PROFILE)?,
            LocalLogStorageProfileVersion::try_new(1)?,
            LocalLogStorageScopeId::try_new(SCOPE)?,
            LocalLogStorageHeadId::try_new(ROOT_HEAD)?,
        );
        let root_inputs = LocalLogStorageRootPreparationInputs::new(
            LocalLogStorageTransactionId::try_new(ROOT_TRANSACTION)?,
            LocalLogStorageFenceId::try_new(ROOT_FENCE)?,
            LocalLogFrameLimits::new(8_192),
        );
        Ok(Self {
            context,
            root_binding,
            root_outcome,
            root_inputs,
            database_incarnation_id: LocalLogStorageDatabaseIncarnationId::try_new(
                DATABASE_INCARNATION,
            )?,
            scope_incarnation_id: LocalLogStorageScopeIncarnationId::try_new(SCOPE_INCARNATION)?,
        })
    }

    fn root_codec(&self) -> LocalLogStorageRootJsonCodecV2 {
        LocalLogStorageRootJsonCodecV2::new(self.context.clone(), self.root_binding.clone())
    }

    fn encoded_root(&self) -> TestResult<String> {
        let selection = self.root_codec().prepare_root(&self.root_outcome, &self.root_inputs)?;
        self.root_codec().encode_root(&selection).map_err(Into::into)
    }

    fn receipt(
        &self,
        kind: LocalLogStorageSelectionKind,
        transaction_id: &str,
        expected_head_id: Option<&str>,
        committed_head_id: &str,
    ) -> TestResult<LocalLogStorageSelectionReceiptBinding> {
        Ok(LocalLogStorageSelectionReceiptBinding::try_new_with_schema_binding(
            self.context.schema().durable_binding(),
            self.root_binding.profile_id().clone(),
            self.root_binding.profile_version(),
            self.database_incarnation_id.clone(),
            self.root_binding.scope_id().clone(),
            self.scope_incarnation_id.clone(),
            LocalLogStorageTransactionId::try_new(transaction_id)?,
            expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
            LocalLogStorageHeadId::try_new(committed_head_id)?,
            kind,
            LocalSessionId::try_new(SESSION)?,
        )?)
    }

    fn normalize_root(&self, json: &str) -> TestResult<LocalLogStorageSelectedRootV2> {
        let root = self.root_codec().decode_root(json)?;
        let binding = LocalLogStorageSelectedBindingV2::try_new(
            self.receipt(LocalLogStorageSelectionKind::Root, ROOT_TRANSACTION, None, ROOT_HEAD)?,
            None,
            LocalLogStorageSelectedCheckpointGenerationBindingV2::checkpoint_only(
                root.checkpoint_log_id().clone(),
                root.session_id().clone(),
                root.committed_head_id().clone(),
            ),
            LocalLogStorageSelectedActiveGenerationBindingV2::new(
                root.active_log_id().clone(),
                root.session_id().clone(),
                root.active_frame(),
                root.fence_id().clone(),
                root.committed_head_id().clone(),
            ),
        )?;
        LocalLogStorageSelectedJsonCodecV2::new(self.context.clone(), binding)
            .normalize_root_v2(json)
            .map_err(Into::into)
    }

    fn rotation_outcome(
        &self,
        selected: &LocalLogStorageSelectedRootV2,
    ) -> TestResult<super::LocalLogTailCompactionOutcomeV2> {
        let checkpoint = LocalLogCheckpointJsonCodecV2::new(
            self.context.clone(),
            LocalLogCheckpointBinding::try_new(
                selected.session_id().clone(),
                selected.checkpoint_log_id().clone(),
                selected.active_log_id().clone(),
            )?,
        )
        .decode(selected.checkpoint_json())?;
        let cursor = checkpoint.begin_successor_tail_v2(
            LocalLogRecoveryLimits::default(),
            selected.active_frame().limits(),
        );
        let (owner, _, retained_limits, _) = cursor.into_parts();
        LocalLogTailCursorV2::from_trusted_parts(owner, 57, retained_limits)
            .try_into_checkpoint_anchor(LocalLogId::try_new("log:storage-v2-tests:g3")?)
            .map_err(Into::into)
    }

    fn rotation_codec(&self) -> TestResult<LocalLogStorageGenerationJsonCodecV2> {
        Ok(LocalLogStorageGenerationJsonCodecV2::new(
            self.context.clone(),
            LocalLogStorageGenerationBinding::try_new(
                self.root_binding.profile_id().clone(),
                self.root_binding.profile_version(),
                self.root_binding.scope_id().clone(),
                LocalLogStorageHeadId::try_new(ROOT_HEAD)?,
                LocalLogStorageHeadId::try_new(ROTATION_HEAD)?,
            )?,
        ))
    }
}

#[test]
fn root_v2_prepare_encode_decode_and_normalize_are_exact() -> TestResult {
    let fixture = StorageV2Fixture::new()?;
    let selection =
        fixture.root_codec().prepare_root(&fixture.root_outcome, &fixture.root_inputs)?;
    let encoded = fixture.root_codec().encode_root(&selection)?;
    let prefix = format!(
        r#"{{"format":"{LOCAL_LOG_STORAGE_ROOT_FORMAT}","formatVersion":2,"schema":{{"name":"breditor/base","version":1}},"schemaFingerprint":"{}""#,
        fixture.context.schema().fingerprint()
    );
    assert!(encoded.starts_with(&prefix));
    assert!(
        selection.checkpoint_json().starts_with(&format!(
            r#"{{"format":"{LOCAL_LOG_CHECKPOINT_FORMAT}","formatVersion":2"#
        ))
    );
    assert_eq!(selection.schema_binding(), &fixture.context.schema().durable_binding());
    assert_eq!(selection.active_frame().format_version(), 2);
    assert_eq!(fixture.root_outcome.accepted_prefix_bytes(), 123);

    let decoded = fixture.root_codec().decode_root(&encoded)?;
    assert_eq!(decoded, selection);
    assert_eq!(fixture.root_codec().encode_root(&decoded)?, encoded);

    let normalized = fixture.normalize_root(&encoded)?;
    assert_eq!(normalized.schema_binding(), selection.schema_binding());
    assert_eq!(normalized.selection_kind(), LocalLogStorageSelectionKind::Root);
    assert_eq!(normalized.active_frame(), selection.active_frame());
    assert_eq!(normalized.current_selection_json_bytes(), encoded.len());
    assert_eq!(normalized.predecessor_selection_json_bytes(), None);
    let debug = format!("{normalized:?}");
    assert!(!debug.contains("STORAGEV2PAYLOADSENTINEL"));
    assert!(!debug.contains(normalized.checkpoint_json()));
    Ok(())
}

#[test]
fn root_v2_routing_fingerprint_frame_and_limits_fail_closed() -> TestResult {
    let fixture = StorageV2Fixture::new()?;
    let encoded = fixture.encoded_root()?;
    assert!(matches!(
        LocalLogStorageRootJsonCodec::new(fixture.context.clone(), fixture.root_binding.clone())
            .decode_root(&encoded),
        Err(LocalLogStorageRootCodecError::UnsupportedFormatVersion { found: 2, supported: 1 })
    ));

    let anchor = fixture.root_outcome.anchor();
    let checkpoint = LocalLogCheckpointJsonCodecV2::new(
        fixture.context.clone(),
        LocalLogCheckpointBinding::try_new(
            anchor.session_id().clone(),
            anchor.checkpoint_log_id().clone(),
            anchor.successor_log_id().clone(),
        )?,
    )
    .decode(fixture.root_codec().decode_root(&encoded)?.checkpoint_json())?;
    let cursor = checkpoint
        .begin_successor_tail(LocalLogRecoveryLimits::default(), LocalLogFrameLimits::new(8_192));
    let (owner, _, limits) = cursor.into_parts();
    let v1_outcome = LocalLogTailCursor::from_trusted_parts(owner, 0, limits)
        .try_into_checkpoint_anchor(LocalLogId::try_new("log:storage-v2-tests:v1-active")?)?;
    let v1_codec =
        LocalLogStorageRootJsonCodec::new(fixture.context.clone(), fixture.root_binding.clone());
    let v1_root = v1_codec.prepare_root(&v1_outcome, &fixture.root_inputs)?;
    let v1_json = v1_codec.encode_root(&v1_root)?;
    assert!(matches!(
        fixture.root_codec().decode_root(&v1_json),
        Err(LocalLogStorageRootV2CodecError::UnsupportedFormatVersion { found: 1, supported: 2 })
    ));

    let fingerprint = fixture.context.schema().fingerprint().to_string();
    let malformed = encoded.replacen(&fingerprint, &fingerprint.replacen('a', "A", 1), 1);
    assert!(matches!(
        fixture.root_codec().decode_root(&malformed),
        Err(LocalLogStorageRootV2CodecError::InvalidSchemaFingerprint(_))
    ));
    let mismatch = encoded.replacen(
        &fingerprint,
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        1,
    );
    assert!(matches!(
        fixture.root_codec().decode_root(&mismatch),
        Err(LocalLogStorageRootV2CodecError::SchemaBinding(_))
    ));
    let mixed_frame = encoded.replacen(
        r#""activeFrame":{"formatVersion":2"#,
        r#""activeFrame":{"formatVersion":1"#,
        1,
    );
    assert_ne!(mixed_frame, encoded);
    assert!(matches!(
        fixture.root_codec().decode_root(&mixed_frame),
        Err(LocalLogStorageRootV2CodecError::InvalidRecord(_))
    ));

    let checkpoint_bytes = fixture.root_codec().decode_root(&encoded)?.checkpoint_json_bytes();
    let short_input = fixture.root_codec().with_limits(
        LocalLogStorageGenerationLimits::default().with_max_input_bytes(encoded.len() - 1),
    );
    assert!(matches!(
        short_input.decode_root(&encoded),
        Err(LocalLogStorageRootV2CodecError::InputTooLarge { .. })
    ));
    let short_checkpoint = fixture.root_codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_checkpoint_json_bytes(checkpoint_bytes - 1),
    );
    assert!(matches!(
        short_checkpoint.decode_root(&encoded),
        Err(LocalLogStorageRootV2CodecError::ResourceLimit(
            LocalLogStorageRootResourceLimit::CheckpointJsonBytes { .. }
        ))
    ));
    let zero_output = fixture
        .root_codec()
        .with_limits(LocalLogStorageGenerationLimits::default().with_max_output_bytes(0));
    let selection = fixture.root_codec().decode_root(&encoded)?;
    assert!(matches!(
        zero_output.encode_root(&selection),
        Err(LocalLogStorageRootV2CodecError::OutputTooLarge { maximum: 0, .. })
    ));
    Ok(())
}

#[test]
fn selected_root_rotates_and_normalizes_without_losing_v2_binding() -> TestResult {
    let fixture = StorageV2Fixture::new()?;
    let root_json = fixture.encoded_root()?;
    let selected_root = fixture.normalize_root(&root_json)?;
    let outcome = fixture.rotation_outcome(&selected_root)?;
    let inputs = LocalLogStorageGenerationPreparationInputs::new(
        LocalLogStorageTransactionId::try_new(ROTATION_TRANSACTION)?,
        LocalLogStorageFenceId::try_new(ROTATION_FENCE)?,
        LocalLogFrameLimits::new(16_384),
    );
    let codec = fixture.rotation_codec()?;
    let manifest = codec.prepare_rotation_from_selected(&selected_root, &outcome, &inputs)?;
    let encoded = codec.encode_rotation_from_selected(&manifest, &selected_root)?;
    assert!(encoded.starts_with(&format!(
        r#"{{"format":"{LOCAL_LOG_STORAGE_GENERATION_FORMAT}","formatVersion":2,"schema":{{"name":"breditor/base","version":1}},"schemaFingerprint":"{}""#,
        fixture.context.schema().fingerprint()
    )));
    assert_eq!(manifest.schema_binding(), selected_root.schema_binding());
    assert_eq!(manifest.sealed_log_id(), selected_root.active_log_id());
    assert_eq!(manifest.sealed_frame(), selected_root.active_frame());
    assert_eq!(manifest.accepted_prefix_bytes(), 57);
    assert_eq!(manifest.successor_frame().format_version(), 2);
    let decoded = codec.decode_rotation_from_selected(&encoded, &selected_root)?;
    assert_eq!(decoded, manifest);
    assert_eq!(codec.encode_rotation_from_selected(&decoded, &selected_root)?, encoded);

    let current_receipt = fixture.receipt(
        LocalLogStorageSelectionKind::Rotation,
        ROTATION_TRANSACTION,
        Some(ROOT_HEAD),
        ROTATION_HEAD,
    )?;
    let predecessor_receipt =
        fixture.receipt(LocalLogStorageSelectionKind::Root, ROOT_TRANSACTION, None, ROOT_HEAD)?;
    let selected_binding = LocalLogStorageSelectedBindingV2::try_new(
        current_receipt,
        Some(predecessor_receipt),
        LocalLogStorageSelectedCheckpointGenerationBindingV2::retired(
            manifest.sealed_log_id().clone(),
            manifest.session_id().clone(),
            manifest.sealed_frame(),
            selected_root.activation_fence_id().clone(),
            selected_root.selected_head_id().clone(),
            manifest.committed_head_id().clone(),
        ),
        LocalLogStorageSelectedActiveGenerationBindingV2::new(
            manifest.successor_log_id().clone(),
            manifest.session_id().clone(),
            manifest.successor_frame(),
            manifest.fence_id().clone(),
            manifest.committed_head_id().clone(),
        ),
    )?;
    let normalized =
        LocalLogStorageSelectedJsonCodecV2::new(fixture.context.clone(), selected_binding)
            .normalize_rotation_v2(&encoded, &root_json)?;
    assert_eq!(normalized.selection_kind(), LocalLogStorageSelectionKind::Rotation);
    assert_eq!(normalized.schema_binding(), selected_root.schema_binding());
    assert_eq!(normalized.checkpoint_log_id(), manifest.sealed_log_id());
    assert_eq!(normalized.active_log_id(), manifest.successor_log_id());
    assert_eq!(normalized.active_frame(), manifest.successor_frame());
    assert_eq!(normalized.current_selection_json_bytes(), encoded.len());
    assert_eq!(normalized.predecessor_selection_json_bytes(), Some(root_json.len()));

    let variant_context = EditorContext::new(
        CompiledSchema::test_semantic_variant_same_id(),
        DocumentLimits::default(),
    );
    let drifted_codec = LocalLogStorageGenerationJsonCodecV2::new(
        variant_context,
        LocalLogStorageGenerationBinding::try_new(
            fixture.root_binding.profile_id().clone(),
            fixture.root_binding.profile_version(),
            fixture.root_binding.scope_id().clone(),
            LocalLogStorageHeadId::try_new(ROOT_HEAD)?,
            LocalLogStorageHeadId::try_new(ROTATION_HEAD)?,
        )?,
    );
    assert!(matches!(
        drifted_codec.decode_rotation_from_selected(&encoded, &selected_root),
        Err(LocalLogStorageGenerationV2CodecError::ContextConfigurationMismatch)
    ));
    Ok(())
}
