use serde::{Serialize, ser::SerializeStruct};

use crate::{
    record::{PendingFormatRecordV1, SelectionRecordV1, SnapshotIdRecordV1},
    state::{EditorState, EditorStateCheckpointParts},
};

use super::{
    document_encoding::DocumentEncodingV2,
    editor_state_json::EDITOR_STATE_FORMAT,
    editor_state_json_v2::EDITOR_STATE_V2_FORMAT_VERSION,
    editor_value_payload_v1::{
        EditorValueRecordError, encode_pending_format_records_v1, encode_selection_record_v1,
        encode_snapshot_id_v1,
    },
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed deterministic encoding of one complete editor state as Editor State V2.
pub(crate) struct EditorStateEncodingV2<'a> {
    context: &'a crate::state::EditorContext,
    snapshot: SnapshotIdRecordV1,
    document: DocumentEncodingV2<'a>,
    selection: Option<SelectionRecordV1>,
    pending_formats: Option<Vec<PendingFormatRecordV1>>,
}

impl<'a> EditorStateEncodingV2<'a> {
    /// Borrows a state for serialization and checks its fallible value conversions.
    pub(crate) fn try_new(state: &'a EditorState) -> Result<Self, EditorValueRecordError> {
        let EditorStateCheckpointParts { context, snapshot, document, selection, pending_formats } =
            state.checkpoint_parts();
        let pending_formats = pending_formats
            .map(|formats| encode_pending_format_records_v1(formats, context))
            .transpose()?;

        Ok(Self {
            context,
            snapshot: encode_snapshot_id_v1(snapshot),
            document: DocumentEncodingV2::new(document),
            selection: selection.map(encode_selection_record_v1),
            pending_formats,
        })
    }
}

impl Serialize for EditorStateEncodingV2<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("EditorStateRecordV2", 8)?;
        record.serialize_field("format", EDITOR_STATE_FORMAT)?;
        record.serialize_field("formatVersion", &EDITOR_STATE_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.context.schema().id(), self.context.schema().fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("snapshot", &self.snapshot)?;
        record.serialize_field("document", &self.document)?;
        record.serialize_field("selection", &self.selection)?;
        record.serialize_field("pendingFormats", &self.pending_formats)?;
        record.end()
    }
}
