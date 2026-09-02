//! Strict versioned codecs for untrusted persisted data.

mod commit_error;
mod commit_json;
mod diagnostic;
mod document_encoding;
mod document_json;
mod document_preflight;
mod editor_state_encoding;
mod editor_state_error;
mod editor_state_json;
mod editor_value_payload_v1;
mod error;
mod json_size;
mod local_log_checkpoint_error;
mod local_log_checkpoint_json;
mod local_log_checkpoint_limits;
mod local_log_checkpoint_tombstones_v1;
mod local_log_entry_error;
mod local_log_entry_json;
mod local_log_frame_binding;
mod local_log_frame_checksum;
mod local_log_frame_codec;
mod local_log_frame_error;
mod local_log_frame_limits;
mod local_log_frame_scan;
mod local_log_storage_attempt_plan;
mod local_log_storage_attempt_preparation_error;
mod local_log_storage_attempt_request;
mod local_log_storage_attempt_transition_error;
mod local_log_storage_generation_binding;
mod local_log_storage_generation_checkpoint_preflight;
mod local_log_storage_generation_decode;
mod local_log_storage_generation_decode_from_selected;
mod local_log_storage_generation_encode;
mod local_log_storage_generation_encode_from_selected;
mod local_log_storage_generation_error;
mod local_log_storage_generation_frame_v1;
mod local_log_storage_generation_json;
mod local_log_storage_generation_limits;
mod local_log_storage_generation_manifest;
mod local_log_storage_generation_preparation_inputs;
mod local_log_storage_generation_prepare;
mod local_log_storage_generation_prepare_from_selected;
#[cfg(test)]
mod local_log_storage_generation_selected_tests;
#[cfg(test)]
mod local_log_storage_generation_tests;
mod local_log_storage_prepared_attempt;
mod local_log_storage_prepared_begin_attempt;
mod local_log_storage_root_attempt_prepare;
mod local_log_storage_root_binding;
mod local_log_storage_root_decode;
mod local_log_storage_root_encode;
mod local_log_storage_root_error;
mod local_log_storage_root_json;
mod local_log_storage_root_preparation_inputs;
mod local_log_storage_root_prepare;
mod local_log_storage_root_selection;
#[cfg(test)]
mod local_log_storage_root_tests;
mod local_log_storage_rotation_attempt_prepare;
mod local_log_storage_selected_binding;
mod local_log_storage_selected_envelope_error;
mod local_log_storage_selected_envelope_validate;
mod local_log_storage_selected_generation_binding;
mod local_log_storage_selected_json;
mod local_log_storage_selected_root;
mod local_log_storage_selected_root_error;
mod local_log_storage_selected_root_normalize;
mod local_log_storage_selected_rotation_normalize;
#[cfg(test)]
mod local_log_storage_selected_tests;
mod local_log_storage_selection_kind;
mod local_log_storage_selection_receipt_binding;
mod local_log_storage_uncertain_adapter_request;
mod local_log_storage_uncertain_attempt;
mod local_log_storage_uncertain_attempt_match;
mod local_log_storage_uncertain_resubmit;
mod local_log_tail_begin;
mod local_log_tail_compaction;
mod local_log_tail_compaction_outcome;
mod local_log_tail_compaction_reauthorization;
mod local_log_tail_cursor;
mod local_log_tail_error;
mod local_log_tail_failure;
mod local_log_tail_observation;
mod local_log_tail_step;
mod operation_error;
mod operation_json;
mod operation_payload_v1;
mod operation_preflight;
mod operation_sequence_v1;
mod session_checkpoint_entries_v1;
mod session_checkpoint_error;
mod session_checkpoint_json;
mod session_checkpoint_limits;
mod transaction_error;
mod transaction_json;
mod transaction_payload_v1;

pub use commit_error::{
    CommitApplicationError, CommitApplicationErrorCode, CommitCodecError, CommitRecordError,
    CommitRecordErrorCode, CommitRecordLocation,
};
pub use commit_json::{COMMIT_FORMAT, COMMIT_FORMAT_VERSION, CommitJsonCodec};
pub use diagnostic::{BoundedDiagnostic, MAX_DIAGNOSTIC_PREVIEW_BYTES};
pub use document_json::{DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, DocumentJsonCodec};
pub use editor_state_error::{
    EditorStateCodecError, EditorStateRecordError, EditorStateRecordErrorCode,
    EditorStateRecordLocation,
};
pub use editor_state_json::{
    EDITOR_STATE_FORMAT, EDITOR_STATE_FORMAT_VERSION, EditorStateJsonCodec,
};
pub use error::{CodecErrorCode, DocumentCodecError, JsonFailure, JsonFailureKind};
pub use local_log_checkpoint_error::{
    LocalLogCheckpointBindingField, LocalLogCheckpointCodecError, LocalLogCheckpointRecordError,
    LocalLogCheckpointRecordErrorCode, LocalLogCheckpointRecordLocation,
    LocalLogCheckpointResourceLimit, LocalLogCheckpointResourceLimitCode,
    LocalLogCheckpointTopologyError, LocalLogCheckpointTopologyErrorCode,
};
pub use local_log_checkpoint_json::{
    LOCAL_LOG_CHECKPOINT_FORMAT, LOCAL_LOG_CHECKPOINT_FORMAT_VERSION, LocalLogCheckpointJsonCodec,
};
pub use local_log_checkpoint_limits::{
    DEFAULT_LOCAL_LOG_CHECKPOINT_MAX_REPLAY_TOMBSTONES, LocalLogCheckpointLimits,
};
pub use local_log_entry_error::{
    LocalLogCommitEventKind, LocalLogEntryCodecError, LocalLogEntryRecordError,
    LocalLogEntryRecordErrorCode, LocalLogEntryRecordLocation,
};
pub use local_log_entry_json::{
    LOCAL_LOG_ENTRY_FORMAT, LOCAL_LOG_ENTRY_FORMAT_VERSION, LocalLogEntryJsonCodec,
};
pub use local_log_frame_binding::LocalLogFrameBinding;
pub use local_log_frame_codec::{
    LOCAL_LOG_FRAME_FORMAT_VERSION, LOCAL_LOG_FRAME_HEADER_BYTES, LOCAL_LOG_FRAME_MAGIC,
    LocalLogFrameCodec,
};
pub use local_log_frame_error::{LocalLogFrameCodecError, LocalLogFrameErrorCode};
pub use local_log_frame_limits::{DEFAULT_LOCAL_LOG_FRAME_MAX_PAYLOAD_BYTES, LocalLogFrameLimits};
pub use local_log_frame_scan::{
    BorrowedLocalLogFrame, LocalLogFrameScan, LocalLogFrameTruncation, LocalLogFrameTruncationStage,
};
pub use local_log_storage_attempt_preparation_error::{
    LocalLogStorageAttemptPreparationError, LocalLogStorageAttemptPreparationErrorCode,
};
pub use local_log_storage_attempt_request::{
    LocalLogStorageAttemptRequest, LocalLogStorageRootAttemptRequest,
    LocalLogStorageRotationAttemptRequest,
};
pub use local_log_storage_attempt_transition_error::{
    LocalLogStorageAttemptTransitionError, LocalLogStorageAttemptTransitionErrorCode,
};
pub use local_log_storage_generation_binding::{
    LocalLogStorageGenerationBinding, LocalLogStorageGenerationBindingError,
};
pub use local_log_storage_generation_error::{
    LocalLogStorageGenerationBindingField, LocalLogStorageGenerationCodecError,
    LocalLogStorageGenerationContinuityError, LocalLogStorageGenerationContinuityErrorCode,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationRecordError,
    LocalLogStorageGenerationRecordErrorCode, LocalLogStorageGenerationRecordLocation,
    LocalLogStorageGenerationResourceLimit, LocalLogStorageGenerationResourceLimitCode,
    LocalLogStorageGenerationTopologyError, LocalLogStorageGenerationTopologyErrorCode,
};
pub use local_log_storage_generation_frame_v1::LocalLogStorageGenerationFrameV1;
pub use local_log_storage_generation_json::{
    LOCAL_LOG_STORAGE_GENERATION_FORMAT, LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION,
    LocalLogStorageGenerationJsonCodec,
};
pub use local_log_storage_generation_limits::{
    DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_CHECKPOINT_JSON_BYTES,
    DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_INPUT_BYTES,
    DEFAULT_LOCAL_LOG_STORAGE_GENERATION_MAX_OUTPUT_BYTES, LocalLogStorageGenerationLimits,
};
pub use local_log_storage_generation_manifest::LocalLogStorageGenerationManifest;
pub(crate) use local_log_storage_generation_manifest::LocalLogStorageGenerationManifestParts;
pub use local_log_storage_generation_preparation_inputs::LocalLogStorageGenerationPreparationInputs;
pub use local_log_storage_prepared_attempt::LocalLogStoragePreparedAttempt;
pub use local_log_storage_root_binding::LocalLogStorageRootBinding;
pub use local_log_storage_root_error::{
    LocalLogStorageRootBindingField, LocalLogStorageRootCodecError, LocalLogStorageRootJsonFailure,
    LocalLogStorageRootRecordError, LocalLogStorageRootRecordErrorCode,
    LocalLogStorageRootRecordLocation, LocalLogStorageRootResourceLimit,
    LocalLogStorageRootResourceLimitCode, LocalLogStorageRootTopologyError,
    LocalLogStorageRootTopologyErrorCode,
};
pub use local_log_storage_root_json::{
    LOCAL_LOG_STORAGE_ROOT_FORMAT, LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION,
    LocalLogStorageRootJsonCodec,
};
pub use local_log_storage_root_preparation_inputs::LocalLogStorageRootPreparationInputs;
pub use local_log_storage_root_selection::LocalLogStorageRootSelection;
pub(crate) use local_log_storage_root_selection::LocalLogStorageRootSelectionParts;
pub use local_log_storage_selected_binding::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectedBindingError,
    LocalLogStorageSelectedBindingErrorCode, LocalLogStorageSelectedGenerationMismatchField,
    LocalLogStorageSelectedReceiptMismatchField,
};
pub use local_log_storage_selected_envelope_error::{
    LocalLogStorageSelectedEnvelopeError, LocalLogStorageSelectedEnvelopeErrorCode,
};
pub use local_log_storage_selected_generation_binding::{
    LocalLogStorageSelectedActiveGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationState,
};
pub use local_log_storage_selected_json::LocalLogStorageSelectedJsonCodec;
pub use local_log_storage_selected_root::LocalLogStorageSelectedRoot;
pub use local_log_storage_selected_root_error::{
    LocalLogStorageSelectedRootError, LocalLogStorageSelectedRootErrorCode,
    LocalLogStorageSelectedRootGenerationField, LocalLogStorageSelectedRootReceiptField,
    LocalLogStorageSelectedRootValueRole,
};
pub use local_log_storage_selection_kind::LocalLogStorageSelectionKind;
pub use local_log_storage_selection_receipt_binding::{
    LocalLogStorageSelectionReceiptBinding, LocalLogStorageSelectionReceiptBindingError,
    LocalLogStorageSelectionReceiptBindingErrorCode,
};
pub use local_log_storage_uncertain_attempt::LocalLogStorageUncertainAttempt;
pub use local_log_tail_compaction_outcome::LocalLogTailCompactionOutcome;
pub use local_log_tail_cursor::LocalLogTailCursor;
pub use local_log_tail_error::{LocalLogTailError, LocalLogTailErrorCode};
pub use local_log_tail_failure::LocalLogTailFailure;
pub use local_log_tail_step::{LocalLogTailStatus, LocalLogTailStep};
pub use operation_error::{
    OperationCodecError, OperationFragmentField, OperationOffsetField, OperationPathField,
    OperationRecordError, OperationRecordErrorCode, OperationRecordLocation,
};
pub use operation_json::{OPERATION_FORMAT, OPERATION_FORMAT_VERSION, OperationJsonCodec};
pub use session_checkpoint_error::{
    RetainedResourceKind, SessionCheckpointApplicationError, SessionCheckpointApplicationErrorCode,
    SessionCheckpointCodecError, SessionCheckpointRecordError, SessionCheckpointRecordErrorCode,
    SessionCheckpointRecordLocation, SessionCheckpointReplayDirection,
    SessionCheckpointResourceLimit, SessionCheckpointResourceLimitCode,
    SessionCheckpointTopologyError, SessionCheckpointTopologyErrorCode,
};
pub use session_checkpoint_json::{
    SESSION_CHECKPOINT_FORMAT, SESSION_CHECKPOINT_FORMAT_VERSION, SessionCheckpointJsonCodec,
};
pub use session_checkpoint_limits::{
    DEFAULT_SESSION_CHECKPOINT_MAX_AGGREGATE_FORWARD_OPERATIONS,
    DEFAULT_SESSION_CHECKPOINT_MAX_HISTORY_CAPACITY, DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_NODES,
    DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_PROPERTY_VALUES,
    DEFAULT_SESSION_CHECKPOINT_MAX_RETAINED_TEXT_BYTES, SessionCheckpointLimits,
};
pub use transaction_error::{
    TransactionCodecError, TransactionRecordError, TransactionRecordErrorCode,
    TransactionRecordLocation,
};
pub use transaction_json::{
    TRANSACTION_REQUEST_FORMAT, TRANSACTION_REQUEST_FORMAT_VERSION, TransactionJsonCodec,
};
