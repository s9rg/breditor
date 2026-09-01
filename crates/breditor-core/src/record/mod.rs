//! Owned, version-specific serialization records.

mod document_record;
mod operation_record;
mod strict_json;

pub(crate) use document_record::{
    DocumentEnvelopeHeader, DocumentRecordV1, FormatRecordV1, NodeRecordV1, SchemaIdRecord,
};
pub(crate) use operation_record::{
    EmptyPropertyMapRecord, OperationEnvelopeHeader, OperationFormatRecordV1,
    OperationRecordEnvelopeV1, OperationRecordV1, RootTextBoundaryRecordV1, RootTextRangeRecordV1,
    TextFragmentRecordV1, TextRangeRecordV1, TextRunRecordV1,
};
pub(crate) use strict_json::{PropertyMapRecord, PropertyValueRecord};
