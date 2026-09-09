//! Deterministic property-preserving commit encodings.

use serde::{Serialize, ser::SerializeStruct};

use crate::{
    record::{PendingFormatRecordV2, SelectionRecordV1, TransactionMetadataRecordV1},
    state::EditorContext,
};

use super::{
    commit_json::COMMIT_FORMAT, commit_json_v3::COMMIT_V3_FORMAT_VERSION,
    editor_state_encoding_v3::EditorStateEncodingV3,
    operation_sequence_v2::OperationSequenceEncodingV2,
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed deterministic encoding of one replay-proved commit as Commit V3.
pub(crate) struct CommitEncodingV3<'a> {
    pub(crate) context: &'a EditorContext,
    pub(crate) before: EditorStateEncodingV3<'a>,
    pub(crate) forward_operations: OperationSequenceEncodingV2<'a>,
    pub(crate) result_selection: Option<SelectionRecordV1>,
    pub(crate) result_pending_formats: Option<Vec<PendingFormatRecordV2>>,
    pub(crate) metadata: TransactionMetadataRecordV1,
}

impl Serialize for CommitEncodingV3<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("CommitRecordV3", 9)?;
        record.serialize_field("format", COMMIT_FORMAT)?;
        record.serialize_field("formatVersion", &COMMIT_V3_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.context.schema().id(), self.context.schema().fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("before", &self.before)?;
        record.serialize_field("forwardOperations", &self.forward_operations)?;
        record.serialize_field("resultSelection", &self.result_selection)?;
        record.serialize_field("resultPendingFormats", &self.result_pending_formats)?;
        record.serialize_field("metadata", &self.metadata)?;
        record.end()
    }
}
