use std::collections::BTreeMap;

use crate::{
    codec::LocalLogCheckpointJsonCodecV2,
    local_log::{LocalLogCheckpointAnchor, LocalLogCompactionLimits},
    session::EditorSession,
    state::EditorState,
};

use super::{PreparedSchemaAdmission, SchemaAdmissionError, SchemaAdmissionRequest};

pub(super) fn prepare(
    source: &LocalLogCheckpointAnchor,
    request: &SchemaAdmissionRequest,
) -> Result<PreparedSchemaAdmission, SchemaAdmissionError> {
    let source_state = source.session().state();
    let source_context = source_state.context();
    let source_schema_binding = source.schema_binding();
    let target_schema_binding = request.target_context.schema().durable_binding();

    if source_schema_binding.fingerprint() == target_schema_binding.fingerprint() {
        return Err(SchemaAdmissionError::UnchangedFingerprint {
            fingerprint: source_schema_binding.fingerprint(),
        });
    }
    if source_state.snapshot().lineage() == &request.target_lineage {
        return Err(SchemaAdmissionError::ReusedLineage {
            lineage: request.target_lineage.clone(),
        });
    }
    if source.session_id() == request.target_checkpoint_binding.session_id() {
        return Err(SchemaAdmissionError::ReusedSession {
            session_id: source.session_id().clone(),
        });
    }

    let target_document = source_state
        .document()
        .try_admit_to_schema(
            source_context.schema(),
            source_context.limits(),
            request.target_context.schema(),
            request.target_context.limits(),
        )
        .map_err(|error| SchemaAdmissionError::Document(Box::new(error)))?;
    let target_state = EditorState::try_new(
        &request.target_context,
        request.target_lineage.clone(),
        target_document,
        None,
        None,
    )
    .map_err(|error| SchemaAdmissionError::TargetState(Box::new(error)))?;
    let target_session =
        EditorSession::with_history_capacity(target_state, request.target_history_capacity);
    let target_checkpoint = LocalLogCheckpointAnchor::try_from_checkpoint_parts(
        request.target_checkpoint_binding.session_id().clone(),
        request.target_checkpoint_binding.checkpoint_log_id().clone(),
        request.target_checkpoint_binding.successor_log_id().clone(),
        LocalLogCompactionLimits::new(request.checkpoint_limits.max_replay_tombstones()),
        target_session,
        BTreeMap::new(),
        None,
    )
    .map_err(|_| SchemaAdmissionError::CheckpointInvariant)?;

    let checkpoint_codec = LocalLogCheckpointJsonCodecV2::new(
        request.target_context.clone(),
        request.target_checkpoint_binding.clone(),
    )
    .with_limits(request.checkpoint_limits);
    let target_checkpoint_json = checkpoint_codec
        .encode(&target_checkpoint)
        .map_err(|error| SchemaAdmissionError::CheckpointEncoding(Box::new(error)))?;

    Ok(PreparedSchemaAdmission {
        source_schema_binding,
        target_schema_binding,
        source_lineage: source_state.snapshot().lineage().clone(),
        target_lineage: request.target_lineage.clone(),
        source_session_id: source.session_id().clone(),
        target_checkpoint,
        target_checkpoint_json,
    })
}
