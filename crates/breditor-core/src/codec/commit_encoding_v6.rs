//! Deterministic property-preserving commit encodings.

use serde::{Serialize, ser::SerializeStruct};

use crate::{
    record::{PendingFormatRecordV2, SelectionRecordV1, TransactionMetadataRecordV1},
    state::EditorContext,
};

use super::{
    commit_json::COMMIT_FORMAT, commit_json_v6::COMMIT_V6_FORMAT_VERSION,
    editor_state_encoding_v3::EditorStateEncodingV3,
    operation_sequence_v5::OperationSequenceEncodingV5,
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed deterministic encoding of one replay-proved commit as Commit V6.
pub(super) struct CommitEncodingV6<'a> {
    pub(super) context: &'a EditorContext,
    pub(super) before: EditorStateEncodingV3<'a>,
    pub(super) forward_operations: OperationSequenceEncodingV5<'a>,
    pub(super) result_selection: Option<SelectionRecordV1>,
    pub(super) result_pending_formats: Option<Vec<PendingFormatRecordV2>>,
    pub(super) metadata: TransactionMetadataRecordV1,
}

impl Serialize for CommitEncodingV6<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("CommitRecordV6", 9)?;
        record.serialize_field("format", COMMIT_FORMAT)?;
        record.serialize_field("formatVersion", &COMMIT_V6_FORMAT_VERSION)?;
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
