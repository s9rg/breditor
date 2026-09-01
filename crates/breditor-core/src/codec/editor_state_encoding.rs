use serde::{Serialize, ser::SerializeStruct};

use crate::{
    record::{PendingFormatRecordV1, SelectionRecordV1, SnapshotIdRecordV1},
    state::{EditorState, EditorStateCheckpointParts},
};

use super::{
    document_encoding::DocumentEncoding,
    editor_state_json::{EDITOR_STATE_FORMAT, EDITOR_STATE_FORMAT_VERSION},
    editor_value_payload_v1::{
        EditorValueRecordError, encode_pending_format_records_v1, encode_selection_record_v1,
        encode_snapshot_id_v1,
    },
};

/// Borrowed deterministic encoding of one complete editor state as Editor State V1.
pub(crate) struct EditorStateEncoding<'a> {
    snapshot: SnapshotIdRecordV1,
    document: DocumentEncoding<'a>,
    selection: Option<SelectionRecordV1>,
    pending_formats: Option<Vec<PendingFormatRecordV1>>,
}

impl<'a> EditorStateEncoding<'a> {
    /// Borrows a state for serialization and checks its fallible V1 value conversions.
    pub(crate) fn try_new(state: &'a EditorState) -> Result<Self, EditorValueRecordError> {
        let EditorStateCheckpointParts { context, snapshot, document, selection, pending_formats } =
            state.checkpoint_parts();
        let pending_formats = pending_formats
            .map(|formats| encode_pending_format_records_v1(formats, context))
            .transpose()?;

        Ok(Self {
            snapshot: encode_snapshot_id_v1(snapshot),
            document: DocumentEncoding::new(document),
            selection: selection.map(encode_selection_record_v1),
            pending_formats,
        })
    }
}

impl Serialize for EditorStateEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("EditorStateRecordV1", 6)?;
        record.serialize_field("format", EDITOR_STATE_FORMAT)?;
        record.serialize_field("formatVersion", &EDITOR_STATE_FORMAT_VERSION)?;
        record.serialize_field("snapshot", &self.snapshot)?;
        record.serialize_field("document", &self.document)?;
        record.serialize_field("selection", &self.selection)?;
        record.serialize_field("pendingFormats", &self.pending_formats)?;
        record.end()
    }
}
