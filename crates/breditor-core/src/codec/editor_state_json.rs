use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, DocumentCodecError, EditorStateCodecError, EditorStateRecordError,
        EditorStateRecordErrorCode, EditorStateRecordLocation, JsonFailure,
    },
    record::{
        EDITOR_STATE_FORMAT as RECORD_FORMAT, EDITOR_STATE_FORMAT_VERSION as RECORD_FORMAT_VERSION,
        PendingFormatRecordV1, SelectionRecordV1,
    },
    schema::require_exact_breditor_base,
    state::{EditorContext, EditorState},
};

use super::{
    document_json::{DOCUMENT_FORMAT_VERSION, DocumentJsonCodec},
    editor_state_encoding::EditorStateEncoding,
    editor_value_payload_v1::{
        EditorValueRecordError, SelectionEndpoint, SnapshotValueRecordError,
        decode_pending_format_records_v1, decode_selection_record_v1, decode_snapshot_id_v1,
    },
    json_size::JsonByteCounter,
    operation_preflight::{preflight_operation_payload, preflight_pending_formats_payload},
};

/// Stable identifier for Breditor's complete editor-state checkpoint envelope.
pub const EDITOR_STATE_FORMAT: &str = RECORD_FORMAT;

/// Editor-state checkpoint wire version implemented by this codec.
pub const EDITOR_STATE_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const EDITOR_STATE_DOCUMENT_FORMAT: &str = "breditor/document";
const EDITOR_STATE_DOCUMENT_FORMAT_VERSION: u32 = 1;

// Editor State V1 embeds Document V1 by value. A future default document
// encoder must not change this composition without an explicit state version.
const _: () = assert!(DOCUMENT_FORMAT_VERSION == EDITOR_STATE_DOCUMENT_FORMAT_VERSION);

/// Strict JSON codec for complete immutable editor-state checkpoints.
///
/// The codec's complete [`EditorContext`] is authoritative. Wire data selects
/// neither compiled schema definitions nor resource limits. A snapshot ID is
/// restored exactly but is an identity assertion, not a content hash or proof
/// that a lineage/revision pair has never been reused.
#[derive(Clone, Debug)]
pub struct EditorStateJsonCodec {
    context: EditorContext,
    document_codec: DocumentJsonCodec,
}

impl EditorStateJsonCodec {
    /// Creates an editor-state codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let document_codec =
            DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
        Self { context, document_codec }
    }

    /// Returns the complete context installed on every decoded state.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes and proves one complete editor-state checkpoint.
    ///
    /// The embedded document is passed directly to [`DocumentJsonCodec`] as a
    /// borrowed raw JSON value, preserving Document V1's duplicate-field and
    /// canonical-property checks. Selection and pending formats are resolved
    /// together against that exact validated document before publication.
    ///
    /// # Errors
    ///
    /// Returns [`EditorStateCodecError`] for an oversized or malformed record,
    /// unsupported state/document format, invalid snapshot or state value,
    /// document failure, or failed complete editor-state validation.
    pub fn decode(&self, json: &str) -> Result<EditorState, EditorStateCodecError> {
        require_exact_breditor_base(self.context.schema())
            .map_err(|_| EditorStateCodecError::ContextConfigurationMismatch)?;
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(EditorStateCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedEditorStateHeader<'_> = decode_json(json)?;
        if header.format != EDITOR_STATE_FORMAT {
            return Err(EditorStateCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_FORMAT,
            });
        }
        if header.format_version != EDITOR_STATE_FORMAT_VERSION {
            return Err(EditorStateCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_FORMAT_VERSION,
            });
        }
        let envelope: BorrowedEditorStateRecordV1<'_> = decode_json(json)?;
        let snapshot_record: BorrowedSnapshotIdRecord<'_> = decode_raw_record(envelope.snapshot)?;
        let snapshot = decode_snapshot_id_v1(
            snapshot_record.lineage.as_ref(),
            snapshot_record.revision.as_ref(),
        )
        .map_err(|error| editor_state_record_error_from_snapshot(&error))?;

        preflight_operation_payload(envelope.selection.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateCodecError::InvalidJson)?;
        preflight_pending_formats_payload(envelope.pending_formats.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateCodecError::InvalidJson)?;

        validate_editor_state_document_header(envelope.document)?;
        let document = self
            .document_codec
            .decode(envelope.document.get())
            .map_err(EditorStateCodecError::InvalidDocument)?;
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
        .map_err(EditorStateCodecError::Validation)
    }

    /// Encodes one context-equal state into deterministic compact JSON.
    ///
    /// The honest law is `decode(encode(state)) == state`. The nested document
    /// remains the complete existing Document V1 value rather than a forked
    /// state-specific root encoding. This checkpoint contains no session
    /// history, commit, action cache, delivery identity, signature, or log data.
    ///
    /// # Errors
    ///
    /// Returns [`EditorStateCodecError`] when the state's complete context
    /// differs, a state value cannot be represented by V1, serialization fails,
    /// or the result exceeds the same byte budget enforced by decode.
    pub fn encode(&self, state: &EditorState) -> Result<String, EditorStateCodecError> {
        require_exact_breditor_base(self.context.schema())
            .map_err(|_| EditorStateCodecError::ContextConfigurationMismatch)?;
        if state.context() != &self.context {
            return Err(EditorStateCodecError::ContextConfigurationMismatch);
        }
        let encoding = EditorStateEncoding::try_new(state)
            .map_err(|error| editor_state_record_error_from_editor_value(&error))?;

        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &encoding);
        if byte_counter.exceeded() {
            return Err(EditorStateCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateCodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(EditorStateCodecError::Encoding)
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
#[serde(rename_all = "camelCase")]
struct BorrowedEditorStateDocumentHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedEditorStateRecordV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
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
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecord<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, EditorStateCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateCodecError::InvalidJson)
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, EditorStateCodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn validate_editor_state_document_header(raw: &RawValue) -> Result<(), EditorStateCodecError> {
    let header: BorrowedEditorStateDocumentHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(DocumentCodecError::InvalidJson)
        .map_err(EditorStateCodecError::InvalidDocument)?;
    if header.format != EDITOR_STATE_DOCUMENT_FORMAT {
        return Err(EditorStateCodecError::InvalidDocument(
            DocumentCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_DOCUMENT_FORMAT,
            },
        ));
    }
    if header.format_version != EDITOR_STATE_DOCUMENT_FORMAT_VERSION {
        return Err(EditorStateCodecError::InvalidDocument(
            DocumentCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_DOCUMENT_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

fn editor_state_record_error_from_snapshot(
    error: &SnapshotValueRecordError,
) -> EditorStateCodecError {
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
    EditorStateRecordError::new(code, location, error.to_string()).into()
}

pub(crate) fn editor_state_record_error_from_editor_value(
    error: &EditorValueRecordError,
) -> EditorStateCodecError {
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
    EditorStateRecordError::new(code, location, error.to_string()).into()
}
