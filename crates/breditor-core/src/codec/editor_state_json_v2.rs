use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, EditorStateRecordError, EditorStateRecordErrorCode,
        EditorStateRecordLocation, JsonFailure,
    },
    identity::QualifiedName,
    record::{PendingFormatRecordV1, SelectionRecordV1},
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    state::{EditorContext, EditorState},
};

use super::{
    document_json::DOCUMENT_FORMAT,
    document_json_v2::{DOCUMENT_V2_FORMAT_VERSION, DocumentJsonCodecV2},
    editor_state_encoding_v2::EditorStateEncodingV2,
    editor_state_json::EDITOR_STATE_FORMAT,
    editor_state_v2_error::EditorStateV2CodecError,
    editor_value_payload_v1::{
        EditorValueRecordError, SelectionEndpoint, SnapshotValueRecordError,
        decode_pending_format_records_v1, decode_selection_record_v1, decode_snapshot_id_v1,
    },
    json_size::JsonByteCounter,
    operation_preflight::{preflight_operation_payload, preflight_pending_formats_payload},
};

/// Wire version accepted and emitted by [`EditorStateJsonCodecV2`].
pub const EDITOR_STATE_V2_FORMAT_VERSION: u32 = 2;

/// Strict JSON codec for complete, fingerprint-bearing editor-state checkpoints.
#[derive(Clone, Debug)]
pub struct EditorStateJsonCodecV2 {
    context: EditorContext,
    document_codec: DocumentJsonCodecV2,
}

impl EditorStateJsonCodecV2 {
    /// Creates an Editor State V2 codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let document_codec = DocumentJsonCodecV2::new(context.schema().clone())
            .with_limits(context.limits().clone());
        Self { context, document_codec }
    }

    /// Returns the complete context installed on every decoded state.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes and completely validates one Editor State V2 checkpoint.
    ///
    /// The outer binding and embedded Document V2 binding are independently
    /// admitted against this codec's compiled schema. No runtime value is
    /// published until document, selection, pending formats, and snapshot all
    /// pass the receiving context's complete proof boundary.
    ///
    /// # Errors
    ///
    /// Returns [`EditorStateV2CodecError`] for an oversized or malformed
    /// record, unsupported generation, malformed or mismatched binding,
    /// invalid nested Document V2, or complete state-validation failure.
    pub fn decode(&self, json: &str) -> Result<EditorState, EditorStateV2CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(EditorStateV2CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedEditorStateHeader<'_> = decode_json(json)?;
        if header.format != EDITOR_STATE_FORMAT {
            return Err(EditorStateV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_FORMAT,
            });
        }
        if header.format_version != EDITOR_STATE_V2_FORMAT_VERSION {
            return Err(EditorStateV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedEditorStateRecordV2<'_> = decode_json(json)?;
        let _binding = decode_and_admit_binding(&envelope, self.context.schema())?;

        let snapshot_record: BorrowedSnapshotIdRecord<'_> = decode_raw_record(envelope.snapshot)?;
        let snapshot = decode_snapshot_id_v1(
            snapshot_record.lineage.as_ref(),
            snapshot_record.revision.as_ref(),
        )
        .map_err(|error| editor_state_record_error_from_snapshot(&error))?;

        preflight_operation_payload(envelope.selection.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateV2CodecError::InvalidJson)?;
        preflight_pending_formats_payload(envelope.pending_formats.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateV2CodecError::InvalidJson)?;

        validate_document_header(envelope.document)?;
        let document = self
            .document_codec
            .decode(envelope.document.get())
            .map_err(EditorStateV2CodecError::InvalidDocument)?;
        let selection_record: Option<SelectionRecordV1> = decode_raw_record(envelope.selection)?;
        let selection = selection_record
            .map(decode_selection_record_v1)
            .transpose()
            .map_err(|error| editor_state_record_error_from_editor_value(&error))?;
        let pending_format_records: Option<Vec<PendingFormatRecordV1>> =
            decode_raw_record(envelope.pending_formats)?;
        let pending_formats = pending_format_records
            .map(|records| decode_pending_format_records_v1(records, &self.context))
            .transpose()
            .map_err(|error| editor_state_record_error_from_editor_value(&error))?;

        EditorState::try_from_validated_parts(
            &self.context,
            snapshot,
            document,
            selection,
            pending_formats,
        )
        .map_err(EditorStateV2CodecError::Validation)
    }

    /// Encodes one exactly context-bound state into deterministic compact V2 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`EditorStateV2CodecError`] when the state's complete context
    /// differs, a state value cannot be represented, serialization fails, or
    /// the result exceeds the same byte budget enforced by decode.
    pub fn encode(&self, state: &EditorState) -> Result<String, EditorStateV2CodecError> {
        if state.context() != &self.context {
            return Err(EditorStateV2CodecError::ContextConfigurationMismatch);
        }
        let encoding = EditorStateEncodingV2::try_new(state)
            .map_err(|error| editor_state_record_error_from_editor_value(&error))?;

        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &encoding);
        if byte_counter.exceeded() {
            return Err(EditorStateV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateV2CodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateV2CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedEditorStateHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedEditorStateRecordV2<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: BorrowedSchemaIdRecord<'a>,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
    #[serde(borrow)]
    snapshot: &'a RawValue,
    #[serde(borrow)]
    document: &'a RawValue,
    #[serde(borrow)]
    selection: &'a RawValue,
    #[serde(borrow)]
    pending_formats: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedNestedDocumentHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecord<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, EditorStateV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateV2CodecError::InvalidJson)
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, EditorStateV2CodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn decode_and_admit_binding(
    envelope: &BorrowedEditorStateRecordV2<'_>,
    compiled: &crate::schema::CompiledSchema,
) -> Result<DurableSchemaBinding, EditorStateV2CodecError> {
    let name = QualifiedName::try_new(envelope.schema.name.as_ref()).map_err(|source| {
        EditorStateV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(envelope.schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(envelope.schema.version).map_err(|source| {
        EditorStateV2CodecError::InvalidSchemaVersion { value: envelope.schema.version, source }
    })?;
    let schema = SchemaId::new(name, version);
    require_schema_id(compiled, &schema)?;
    let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
    require_schema_fingerprint(compiled, fingerprint)?;
    Ok(DurableSchemaBinding::new(schema, fingerprint))
}

fn validate_document_header(raw: &RawValue) -> Result<(), EditorStateV2CodecError> {
    let header: BorrowedNestedDocumentHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(super::DocumentV2CodecError::InvalidJson)
        .map_err(EditorStateV2CodecError::InvalidDocument)?;
    if header.format != DOCUMENT_FORMAT {
        return Err(EditorStateV2CodecError::InvalidDocument(
            super::DocumentV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: DOCUMENT_FORMAT,
            },
        ));
    }
    if header.format_version != DOCUMENT_V2_FORMAT_VERSION {
        return Err(EditorStateV2CodecError::InvalidDocument(
            super::DocumentV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: DOCUMENT_V2_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

fn editor_state_record_error_from_snapshot(
    error: &SnapshotValueRecordError,
) -> EditorStateRecordError {
    let (code, location) = match error {
        SnapshotValueRecordError::InvalidLineage(_) => (
            EditorStateRecordErrorCode::InvalidSnapshotLineage,
            EditorStateRecordLocation::SnapshotLineage,
        ),
        SnapshotValueRecordError::InvalidRevision(_) => (
            EditorStateRecordErrorCode::InvalidSnapshotRevision,
            EditorStateRecordLocation::SnapshotRevision,
        ),
    };
    EditorStateRecordError::new(code, location, error.to_string())
}

pub(crate) fn editor_state_record_error_from_editor_value(
    error: &EditorValueRecordError,
) -> EditorStateRecordError {
    let (code, location) = match error {
        EditorValueRecordError::InvalidSelectionPath { endpoint, .. } => (
            EditorStateRecordErrorCode::InvalidSelectionPath,
            match endpoint {
                SelectionEndpoint::Anchor => EditorStateRecordLocation::SelectionAnchor,
                SelectionEndpoint::Focus => EditorStateRecordLocation::SelectionFocus,
            },
        ),
        EditorValueRecordError::InvalidPendingFormatName { format_index, .. } => (
            EditorStateRecordErrorCode::InvalidQualifiedName,
            EditorStateRecordLocation::PendingFormat { format_index: *format_index },
        ),
        EditorValueRecordError::PendingFormatLimit { .. } => (
            EditorStateRecordErrorCode::PendingFormatLimit,
            EditorStateRecordLocation::PendingFormats,
        ),
        EditorValueRecordError::NonCanonicalPendingFormats { format_index, .. } => (
            EditorStateRecordErrorCode::NonCanonicalPendingFormats,
            EditorStateRecordLocation::PendingFormat { format_index: *format_index },
        ),
        EditorValueRecordError::PendingFormatNotAllowed { format_index }
        | EditorValueRecordError::PendingFormatPropertiesNotAllowed { format_index } => (
            EditorStateRecordErrorCode::PendingFormatNotAllowed,
            EditorStateRecordLocation::PendingFormat { format_index: *format_index },
        ),
    };
    EditorStateRecordError::new(code, location, error.to_string())
}
