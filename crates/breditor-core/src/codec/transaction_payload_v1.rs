//! Checked conversion between transaction-request V1 state records and runtime values.

use crate::{
    codec::{TransactionRecordError, TransactionRecordErrorCode, TransactionRecordLocation},
    document::{Format, FormatSet, PropertyMap},
    identity::QualifiedName,
    operation::{DeletedPointPolicy, SelectionRelocationPolicy},
    position::{Affinity, NodePath, Point},
    record::{
        AffinityRecordV1, DeletedPointPolicyRecordV1, EmptyPropertyMapRecord,
        HistoryIntentRecordV1, PendingFormatRecordV1, PendingFormatsUpdateRecordV1, PointRecordV1,
        SelectionRecordV1, SelectionRelocationRecordV1, SelectionUpdateRecordV1,
        TransactionMetadataRecordV1,
    },
    selection::{RangeSelection, Selection},
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
        SelectionUpdateRecordV1::Set { selection } => {
            selection.map(selection_from_record).transpose().map(SelectionUpdate::Set)
        }
    }
}

pub(crate) fn encode_selection_update_v1(update: &SelectionUpdate) -> SelectionUpdateRecordV1 {
    match update {
        SelectionUpdate::Relocate => SelectionUpdateRecordV1::Relocate {},
        SelectionUpdate::Set(selection) => SelectionUpdateRecordV1::Set {
            selection: selection.as_ref().map(selection_record_from_runtime),
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
            .map(|formats| pending_formats_from_records(formats, context))
            .transpose()
            .map(PendingFormatsUpdate::Set),
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
                .map(|formats| pending_format_records_from_runtime(formats, context))
                .transpose()?,
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

fn selection_from_record(record: SelectionRecordV1) -> Result<Selection, TransactionRecordError> {
    match record {
        SelectionRecordV1::Range { anchor, focus } => Ok(RangeSelection::new(
            point_from_record(anchor, TransactionRecordLocation::SelectionAnchor)?,
            point_from_record(focus, TransactionRecordLocation::SelectionFocus)?,
        )
        .into()),
    }
}

fn selection_record_from_runtime(selection: &Selection) -> SelectionRecordV1 {
    match selection {
        Selection::Range(range) => SelectionRecordV1::Range {
            anchor: point_record_from_runtime(range.anchor()),
            focus: point_record_from_runtime(range.focus()),
        },
    }
}

fn point_from_record(
    record: PointRecordV1,
    location: TransactionRecordLocation,
) -> Result<Point, TransactionRecordError> {
    match record {
        PointRecordV1::Text { text_path, utf16_offset, affinity } => Ok(Point::Text {
            text_path: path_from_record(text_path, location)?,
            utf16_offset,
            affinity: affinity_from_record(affinity),
        }),
        PointRecordV1::Children { parent_path, child_index, affinity } => Ok(Point::Children {
            parent_path: path_from_record(parent_path, location)?,
            child_index,
            affinity: affinity_from_record(affinity),
        }),
    }
}

fn point_record_from_runtime(point: &Point) -> PointRecordV1 {
    match point {
        Point::Text { text_path, utf16_offset, affinity } => PointRecordV1::Text {
            text_path: text_path.to_vec(),
            utf16_offset: *utf16_offset,
            affinity: affinity_record_from_runtime(*affinity),
        },
        Point::Children { parent_path, child_index, affinity } => PointRecordV1::Children {
            parent_path: parent_path.to_vec(),
            child_index: *child_index,
            affinity: affinity_record_from_runtime(*affinity),
        },
    }
}

fn path_from_record(
    indices: Vec<u32>,
    location: TransactionRecordLocation,
) -> Result<NodePath, TransactionRecordError> {
    NodePath::try_from_indices(indices).map_err(|error| {
        record_error(TransactionRecordErrorCode::InvalidSelectionPath, location, &error)
    })
}

fn pending_formats_from_records(
    records: Vec<PendingFormatRecordV1>,
    context: &EditorContext,
) -> Result<FormatSet, TransactionRecordError> {
    check_pending_format_count(records.len(), context)?;
    let mut formats = Vec::with_capacity(records.len());
    for (format_index, record) in records.into_iter().enumerate() {
        let location =
            TransactionRecordLocation::PendingFormat { format_index: usize_to_u64(format_index) };
        let kind = qualified_name_from_record(record.format_type, location)?;
        if !context.schema().allows_text_format(&kind) {
            return Err(TransactionRecordError::new(
                TransactionRecordErrorCode::PendingFormatNotAllowed,
                location,
                "pending format is not registered by the active schema",
            ));
        }
        debug_assert_eq!(record.properties, EmptyPropertyMapRecord);
        formats.push(Format::new(kind, PropertyMap::default()));
    }
    FormatSet::try_from_formats(formats).map_err(|error| {
        record_error(
            TransactionRecordErrorCode::NonCanonicalPendingFormats,
            TransactionRecordLocation::PendingFormats,
            &error,
        )
    })
}

fn pending_format_records_from_runtime(
    formats: &FormatSet,
    context: &EditorContext,
) -> Result<Vec<PendingFormatRecordV1>, TransactionRecordError> {
    check_pending_format_count(formats.len(), context)?;
    formats
        .iter()
        .enumerate()
        .map(|(format_index, format)| {
            let location = TransactionRecordLocation::PendingFormat {
                format_index: usize_to_u64(format_index),
            };
            if !context.schema().allows_text_format(format.kind()) {
                return Err(TransactionRecordError::new(
                    TransactionRecordErrorCode::PendingFormatNotAllowed,
                    location,
                    "pending format is not registered by the active schema",
                ));
            }
            if !format.properties().is_empty() {
                return Err(TransactionRecordError::new(
                    TransactionRecordErrorCode::PendingFormatNotAllowed,
                    location,
                    "transaction-request V1 pending formats do not support properties",
                ));
            }
            Ok(PendingFormatRecordV1 {
                format_type: format.kind().as_str().to_owned(),
                properties: EmptyPropertyMapRecord,
            })
        })
        .collect()
}

fn check_pending_format_count(
    actual: usize,
    context: &EditorContext,
) -> Result<(), TransactionRecordError> {
    let maximum = context.limits().max_formats_per_text();
    if actual > maximum {
        return Err(TransactionRecordError::new(
            TransactionRecordErrorCode::PendingFormatLimit,
            TransactionRecordLocation::PendingFormats,
            format!("pending format count is {actual}; the configured maximum is {maximum}"),
        ));
    }
    Ok(())
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

const fn affinity_from_record(record: AffinityRecordV1) -> Affinity {
    match record {
        AffinityRecordV1::Before => Affinity::Before,
        AffinityRecordV1::After => Affinity::After,
    }
}

const fn affinity_record_from_runtime(affinity: Affinity) -> AffinityRecordV1 {
    match affinity {
        Affinity::Before => AffinityRecordV1::Before,
        Affinity::After => AffinityRecordV1::After,
    }
}

fn record_error(
    code: TransactionRecordErrorCode,
    location: TransactionRecordLocation,
    diagnostic: &impl ToString,
) -> TransactionRecordError {
    TransactionRecordError::new(code, location, diagnostic.to_string())
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
