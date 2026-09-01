//! Strict versioned codecs for untrusted persisted data.

mod diagnostic;
mod document_encoding;
mod document_json;
mod document_preflight;
mod editor_state_error;
mod editor_state_json;
mod editor_value_payload_v1;
mod error;
mod json_size;
mod operation_error;
mod operation_json;
mod operation_payload_v1;
mod operation_preflight;
mod transaction_error;
mod transaction_json;
mod transaction_payload_v1;

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
pub use operation_error::{
    OperationCodecError, OperationFragmentField, OperationOffsetField, OperationPathField,
    OperationRecordError, OperationRecordErrorCode, OperationRecordLocation,
};
pub use operation_json::{OPERATION_FORMAT, OPERATION_FORMAT_VERSION, OperationJsonCodec};
pub use transaction_error::{
    TransactionCodecError, TransactionRecordError, TransactionRecordErrorCode,
    TransactionRecordLocation,
};
pub use transaction_json::{
    TRANSACTION_REQUEST_FORMAT, TRANSACTION_REQUEST_FORMAT_VERSION, TransactionJsonCodec,
};
