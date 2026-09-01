//! Owned, version-specific serialization records.

mod document_record;
mod operation_record;
mod strict_json;
mod transaction_record;

pub(crate) use document_record::{
    DocumentEnvelopeHeader, DocumentRecordV1, FormatRecordV1, NodeRecordV1, SchemaIdRecord,
};
pub(crate) use operation_record::{
    EmptyPropertyMapRecord, OperationEnvelopeHeader, OperationFormatRecordV1,
    OperationRecordEnvelopeV1, OperationRecordV1, RootTextBoundaryRecordV1, RootTextRangeRecordV1,
    TextFragmentRecordV1, TextRangeRecordV1, TextRunRecordV1,
};
pub(crate) use strict_json::{PropertyMapRecord, PropertyValueRecord};
pub(crate) use transaction_record::{
    AffinityRecordV1, DecimalU64Record, DeletedPointPolicyRecordV1, HistoryIntentRecordV1,
    PendingFormatRecordV1, PendingFormatsUpdateRecordV1, PointRecordV1, SelectionRecordV1,
    SelectionRelocationRecordV1, SelectionUpdateRecordV1, SnapshotIdRecordV1,
    TRANSACTION_REQUEST_FORMAT, TRANSACTION_REQUEST_FORMAT_VERSION, TransactionMetadataRecordV1,
    TransactionRequestRecordV1,
};
