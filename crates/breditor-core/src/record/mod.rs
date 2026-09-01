//! Owned, version-specific serialization records.

mod document_record;
mod strict_json;

pub(crate) use document_record::{
    DocumentEnvelopeHeader, DocumentRecordV1, FormatRecordV1, NodeRecordV1, SchemaIdRecord,
};
pub(crate) use strict_json::{PropertyMapRecord, PropertyValueRecord};
