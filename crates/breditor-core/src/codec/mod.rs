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
mod local_log_entry_error;
mod local_log_entry_json;
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
pub use local_log_entry_error::{
    LocalLogCommitEventKind, LocalLogEntryCodecError, LocalLogEntryRecordError,
    LocalLogEntryRecordErrorCode, LocalLogEntryRecordLocation,
};
pub use local_log_entry_json::{
    LOCAL_LOG_ENTRY_FORMAT, LOCAL_LOG_ENTRY_FORMAT_VERSION, LocalLogEntryJsonCodec,
};
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
