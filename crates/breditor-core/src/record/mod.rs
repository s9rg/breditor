//! Owned, version-specific serialization records.

mod commit_record;
mod document_record;
mod editor_state_record;
mod editor_value_record;
mod operation_record;
mod strict_json;
mod transaction_record;

pub(crate) use commit_record::{COMMIT_FORMAT, COMMIT_FORMAT_VERSION, CommitRecordV1};
pub(crate) use document_record::{
    DocumentEnvelopeHeader, DocumentRecordV1, FormatRecordV1, NodeRecordV1, SchemaIdRecord,
};
pub(crate) use editor_state_record::{EDITOR_STATE_FORMAT, EDITOR_STATE_FORMAT_VERSION};
pub(crate) use editor_value_record::{
    AffinityRecordV1, DecimalU64Record, DecimalU64RecordError, PendingFormatRecordV1,
    PointRecordV1, SelectionRecordV1, SnapshotIdRecordV1,
};
pub(crate) use operation_record::{
    EmptyPropertyMapRecord, OperationEnvelopeHeader, OperationFormatRecordV1,
    OperationRecordEnvelopeV1, OperationRecordV1, RootTextBoundaryRecordV1, RootTextRangeRecordV1,
    TextFragmentRecordV1, TextRangeRecordV1, TextRunRecordV1,
};
pub(crate) use strict_json::{PropertyMapRecord, PropertyValueRecord};
pub(crate) use transaction_record::{
    DeletedPointPolicyRecordV1, HistoryIntentRecordV1, PendingFormatsUpdateRecordV1,
    SelectionRelocationRecordV1, SelectionUpdateRecordV1, TRANSACTION_REQUEST_FORMAT,
    TRANSACTION_REQUEST_FORMAT_VERSION, TransactionMetadataRecordV1, TransactionRequestRecordV1,
};
