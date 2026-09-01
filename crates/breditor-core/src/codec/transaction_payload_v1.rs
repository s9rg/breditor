//! Checked conversion between transaction-request V1 state records and runtime values.

use crate::{
    codec::{
        TransactionRecordError, TransactionRecordErrorCode, TransactionRecordLocation,
        editor_value_payload_v1::{
            EditorValueRecordError, SelectionEndpoint, decode_pending_format_records_v1,
            decode_selection_record_v1, encode_pending_format_records_v1,
            encode_selection_record_v1,
        },
    },
    identity::QualifiedName,
    operation::{DeletedPointPolicy, SelectionRelocationPolicy},
    record::{
        DeletedPointPolicyRecordV1, HistoryIntentRecordV1, PendingFormatsUpdateRecordV1,
        SelectionRelocationRecordV1, SelectionUpdateRecordV1, TransactionMetadataRecordV1,
    },
    state::EditorContext,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate, TransactionMetadata},
};

pub(crate) fn decode_selection_relocation_v1(
    record: SelectionRelocationRecordV1,
) -> SelectionRelocationPolicy {
    SelectionRelocationPolicy::new(
        deleted_point_policy_from_record(record.anchor),
        deleted_point_policy_from_record(record.focus),
    )
}

pub(crate) fn encode_selection_relocation_v1(
    policy: SelectionRelocationPolicy,
) -> SelectionRelocationRecordV1 {
    SelectionRelocationRecordV1 {
        anchor: deleted_point_policy_record_from_runtime(policy.anchor()),
        focus: deleted_point_policy_record_from_runtime(policy.focus()),
    }
}

pub(crate) fn decode_selection_update_v1(
    record: SelectionUpdateRecordV1,
) -> Result<SelectionUpdate, TransactionRecordError> {
    match record {
        SelectionUpdateRecordV1::Relocate {} => Ok(SelectionUpdate::Relocate),
        SelectionUpdateRecordV1::Set { selection } => selection
            .map(decode_selection_record_v1)
            .transpose()
            .map(SelectionUpdate::Set)
            .map_err(|error| transaction_record_error_from_editor_value(&error)),
    }
}

pub(crate) fn encode_selection_update_v1(update: &SelectionUpdate) -> SelectionUpdateRecordV1 {
    match update {
        SelectionUpdate::Relocate => SelectionUpdateRecordV1::Relocate {},
        SelectionUpdate::Set(selection) => SelectionUpdateRecordV1::Set {
            selection: selection.as_ref().map(encode_selection_record_v1),
        },
    }
}

pub(crate) fn decode_pending_formats_update_v1(
    record: PendingFormatsUpdateRecordV1,
    context: &EditorContext,
) -> Result<PendingFormatsUpdate, TransactionRecordError> {
    match record {
        PendingFormatsUpdateRecordV1::Preserve {} => Ok(PendingFormatsUpdate::Preserve),
        PendingFormatsUpdateRecordV1::Set { formats } => formats
            .map(|formats| decode_pending_format_records_v1(formats, context))
            .transpose()
            .map(PendingFormatsUpdate::Set)
            .map_err(|error| transaction_record_error_from_editor_value(&error)),
    }
}

pub(crate) fn encode_pending_formats_update_v1(
    update: &PendingFormatsUpdate,
    context: &EditorContext,
) -> Result<PendingFormatsUpdateRecordV1, TransactionRecordError> {
    match update {
        PendingFormatsUpdate::Preserve => Ok(PendingFormatsUpdateRecordV1::Preserve {}),
        PendingFormatsUpdate::Set(formats) => Ok(PendingFormatsUpdateRecordV1::Set {
            formats: formats
                .as_ref()
                .map(|formats| encode_pending_format_records_v1(formats, context))
                .transpose()
                .map_err(|error| transaction_record_error_from_editor_value(&error))?,
        }),
    }
}

pub(crate) fn decode_transaction_metadata_v1(
    record: TransactionMetadataRecordV1,
) -> Result<TransactionMetadata, TransactionRecordError> {
    let action = record
        .action
        .map(|value| qualified_name_from_record(value, TransactionRecordLocation::MetadataAction))
        .transpose()?;
    let history = match record.history {
        HistoryIntentRecordV1::Record {} => HistoryIntent::Record,
        HistoryIntentRecordV1::Merge { group } => HistoryIntent::Merge {
            group: qualified_name_from_record(
                group,
                TransactionRecordLocation::MetadataHistoryGroup,
            )?,
        },
        HistoryIntentRecordV1::Ignore {} => HistoryIntent::Ignore,
    };
    Ok(TransactionMetadata::new(action, history))
}

pub(crate) fn encode_transaction_metadata_v1(
    metadata: &TransactionMetadata,
) -> TransactionMetadataRecordV1 {
    let history = match metadata.history() {
        HistoryIntent::Record => HistoryIntentRecordV1::Record {},
        HistoryIntent::Merge { group } => {
            HistoryIntentRecordV1::Merge { group: group.as_str().to_owned() }
        }
        HistoryIntent::Ignore => HistoryIntentRecordV1::Ignore {},
    };
    TransactionMetadataRecordV1 {
        action: metadata.action().map(|action| action.as_str().to_owned()),
        history,
    }
}

fn qualified_name_from_record(
    value: String,
    location: TransactionRecordLocation,
) -> Result<QualifiedName, TransactionRecordError> {
    QualifiedName::try_from(value).map_err(|error| {
        record_error(TransactionRecordErrorCode::InvalidQualifiedName, location, &error)
    })
}

const fn deleted_point_policy_from_record(
    record: DeletedPointPolicyRecordV1,
) -> DeletedPointPolicy {
    match record {
        DeletedPointPolicyRecordV1::Reject => DeletedPointPolicy::Reject,
        DeletedPointPolicyRecordV1::Before => DeletedPointPolicy::Before,
        DeletedPointPolicyRecordV1::After => DeletedPointPolicy::After,
    }
}

const fn deleted_point_policy_record_from_runtime(
    policy: DeletedPointPolicy,
) -> DeletedPointPolicyRecordV1 {
    match policy {
        DeletedPointPolicy::Reject => DeletedPointPolicyRecordV1::Reject,
        DeletedPointPolicy::Before => DeletedPointPolicyRecordV1::Before,
        DeletedPointPolicy::After => DeletedPointPolicyRecordV1::After,
    }
}

fn transaction_record_error_from_editor_value(
    error: &EditorValueRecordError,
) -> TransactionRecordError {
    let (code, location) = match error {
        EditorValueRecordError::InvalidSelectionPath { endpoint, .. } => (
            TransactionRecordErrorCode::InvalidSelectionPath,
            match endpoint {
                SelectionEndpoint::Anchor => TransactionRecordLocation::SelectionAnchor,
                SelectionEndpoint::Focus => TransactionRecordLocation::SelectionFocus,
            },
        ),
        EditorValueRecordError::InvalidPendingFormatName { format_index, .. } => (
            TransactionRecordErrorCode::InvalidQualifiedName,
            TransactionRecordLocation::PendingFormat { format_index: *format_index },
        ),
        EditorValueRecordError::PendingFormatLimit { .. } => (
            TransactionRecordErrorCode::PendingFormatLimit,
            TransactionRecordLocation::PendingFormats,
        ),
        EditorValueRecordError::NonCanonicalPendingFormats { .. } => (
            TransactionRecordErrorCode::NonCanonicalPendingFormats,
            TransactionRecordLocation::PendingFormats,
        ),
        EditorValueRecordError::PendingFormatNotAllowed { format_index }
        | EditorValueRecordError::PendingFormatPropertiesNotAllowed { format_index } => (
            TransactionRecordErrorCode::PendingFormatNotAllowed,
            TransactionRecordLocation::PendingFormat { format_index: *format_index },
        ),
    };
    TransactionRecordError::new(code, location, error.to_string())
}

fn record_error(
    code: TransactionRecordErrorCode,
    location: TransactionRecordLocation,
    diagnostic: &impl ToString,
) -> TransactionRecordError {
    TransactionRecordError::new(code, location, diagnostic.to_string())
}
