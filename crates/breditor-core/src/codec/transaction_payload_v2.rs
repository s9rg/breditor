//! Checked property-preserving transaction state-update conversions.

use crate::{
    codec::{TransactionRecordError, TransactionRecordErrorCode, TransactionRecordLocation},
    record::PendingFormatsUpdateRecordV2,
    state::EditorContext,
    transaction::PendingFormatsUpdate,
};

use super::editor_value_payload_v2::{
    EditorValueRecordV2Error, EditorValueRecordV2ErrorCode, decode_pending_format_records_v2,
    encode_pending_format_records_v2,
};

pub(crate) fn decode_pending_formats_update_v2(
    record: PendingFormatsUpdateRecordV2,
    context: &EditorContext,
) -> Result<PendingFormatsUpdate, TransactionRecordError> {
    match record {
        PendingFormatsUpdateRecordV2::Preserve {} => Ok(PendingFormatsUpdate::Preserve),
        PendingFormatsUpdateRecordV2::Set { formats } => formats
            .map(|formats| decode_pending_format_records_v2(formats, context))
            .transpose()
            .map(PendingFormatsUpdate::Set)
            .map_err(|error| transaction_record_error_from_editor_value_v2(&error)),
    }
}

pub(crate) fn encode_pending_formats_update_v2(
    update: &PendingFormatsUpdate,
    context: &EditorContext,
) -> Result<PendingFormatsUpdateRecordV2, TransactionRecordError> {
    match update {
        PendingFormatsUpdate::Preserve => Ok(PendingFormatsUpdateRecordV2::Preserve {}),
        PendingFormatsUpdate::Set(formats) => Ok(PendingFormatsUpdateRecordV2::Set {
            formats: formats
                .as_ref()
                .map(|formats| encode_pending_format_records_v2(formats, context))
                .transpose()
                .map_err(|error| transaction_record_error_from_editor_value_v2(&error))?,
        }),
    }
}

fn transaction_record_error_from_editor_value_v2(
    error: &EditorValueRecordV2Error,
) -> TransactionRecordError {
    let code = match error.code() {
        EditorValueRecordV2ErrorCode::InvalidFormatName => {
            TransactionRecordErrorCode::InvalidQualifiedName
        }
        EditorValueRecordV2ErrorCode::InvalidPropertyName => {
            TransactionRecordErrorCode::InvalidPendingFormatPropertyName
        }
        EditorValueRecordV2ErrorCode::InvalidPropertyValue => {
            TransactionRecordErrorCode::InvalidPendingFormatPropertyValue
        }
        EditorValueRecordV2ErrorCode::InvalidFormatInstance => {
            TransactionRecordErrorCode::PendingFormatNotAllowed
        }
        EditorValueRecordV2ErrorCode::PendingFormatLimit => {
            TransactionRecordErrorCode::PendingFormatLimit
        }
        EditorValueRecordV2ErrorCode::NonCanonicalPendingFormats => {
            TransactionRecordErrorCode::NonCanonicalPendingFormats
        }
        EditorValueRecordV2ErrorCode::PropertyValueCountOverflow
        | EditorValueRecordV2ErrorCode::PropertyValueCountLimit => {
            TransactionRecordErrorCode::PendingFormatPropertyValueLimit
        }
        EditorValueRecordV2ErrorCode::PropertyStringBytesOverflow
        | EditorValueRecordV2ErrorCode::PropertyStringBytesLimit => {
            TransactionRecordErrorCode::PendingFormatPropertyStringBytesLimit
        }
    };
    let location =
        error.format_index().map_or(TransactionRecordLocation::PendingFormats, |format_index| {
            TransactionRecordLocation::PendingFormat { format_index }
        });
    TransactionRecordError::new(code, location, error.diagnostic().to_owned())
}
