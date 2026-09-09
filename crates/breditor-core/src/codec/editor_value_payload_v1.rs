//! Neutral checked conversions for V1 records shared by editor-state values.

use thiserror::Error;

use crate::{
    document::{Format, FormatSet, FormatSetError, PropertyMap},
    identity::{QualifiedName, QualifiedNameError},
    position::{Affinity, NodePath, NodePathError, Point},
    record::{
        AffinityRecordV1, DecimalU64Record, DecimalU64RecordError, EmptyPropertyMapRecord,
        PendingFormatRecordV1, PointRecordV1, SelectionRecordV1, SnapshotIdRecordV1,
    },
    selection::{RangeSelection, Selection},
    state::{EditorContext, LineageId, LineageIdError, Revision, SnapshotId},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SelectionEndpoint {
    Anchor,
    Focus,
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum EditorValueRecordError {
    #[error("invalid {endpoint:?} selection path: {source}")]
    InvalidSelectionPath { endpoint: SelectionEndpoint, source: NodePathError },
    #[error("pending format {format_index} has an invalid qualified name: {source}")]
    InvalidPendingFormatName { format_index: u64, source: QualifiedNameError },
    #[error("pending format count is {actual}; the configured maximum is {maximum}")]
    PendingFormatLimit { actual: u64, maximum: u64 },
    #[error("pending format {format_index} is not canonical: {source}")]
    NonCanonicalPendingFormats { format_index: u64, source: FormatSetError },
    #[error("pending format {format_index} is not registered by the active schema")]
    PendingFormatNotAllowed { format_index: u64 },
    #[error("pending format {format_index} has properties unsupported by V1")]
    PendingFormatPropertiesNotAllowed { format_index: u64 },
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum SnapshotValueRecordError {
    #[error("invalid snapshot lineage: {0}")]
    InvalidLineage(LineageIdError),
    #[error("invalid snapshot revision: {0}")]
    InvalidRevision(DecimalU64RecordError),
}

pub(crate) fn decode_snapshot_id_v1(
    lineage: &str,
    revision: &str,
) -> Result<SnapshotId, SnapshotValueRecordError> {
    let lineage = LineageId::try_new(lineage).map_err(SnapshotValueRecordError::InvalidLineage)?;
    let revision = DecimalU64Record::try_from_decimal(revision)
        .map_err(SnapshotValueRecordError::InvalidRevision)?;
    Ok(SnapshotId::new(lineage, Revision::new(revision.get())))
}

pub(crate) fn encode_snapshot_id_v1(snapshot: &SnapshotId) -> SnapshotIdRecordV1 {
    SnapshotIdRecordV1 {
        lineage: snapshot.lineage().as_str().to_owned(),
        revision: DecimalU64Record::new(snapshot.revision().get()),
    }
}

pub(crate) fn decode_selection_record_v1(
    record: SelectionRecordV1,
) -> Result<Selection, EditorValueRecordError> {
    match record {
        SelectionRecordV1::Range { anchor, focus } => Ok(RangeSelection::new(
            point_from_record(anchor, SelectionEndpoint::Anchor)?,
            point_from_record(focus, SelectionEndpoint::Focus)?,
        )
        .into()),
    }
}

pub(crate) fn encode_selection_record_v1(selection: &Selection) -> SelectionRecordV1 {
    match selection {
        Selection::Range(range) => SelectionRecordV1::Range {
            anchor: point_record_from_runtime(range.anchor()),
            focus: point_record_from_runtime(range.focus()),
        },
    }
}

pub(crate) fn decode_pending_format_records_v1(
    records: Vec<PendingFormatRecordV1>,
    context: &EditorContext,
) -> Result<FormatSet, EditorValueRecordError> {
    check_pending_format_count(records.len(), context)?;
    let mut formats = Vec::with_capacity(records.len());
    for (format_index, record) in records.into_iter().enumerate() {
        let format_index = usize_to_u64(format_index);
        let kind = QualifiedName::try_from(record.format_type).map_err(|source| {
            EditorValueRecordError::InvalidPendingFormatName { format_index, source }
        })?;
        if !context.schema().is_property_free_inline_format(&kind) {
            return Err(EditorValueRecordError::PendingFormatNotAllowed { format_index });
        }
        debug_assert_eq!(record.properties, EmptyPropertyMapRecord);
        formats.push(Format::new(kind, PropertyMap::default()));
    }
    FormatSet::try_from_formats(formats).map_err(|source| {
        let format_index = match source {
            FormatSetError::DuplicateFormat { index }
            | FormatSetError::NonCanonicalOrder { index } => usize_to_u64(index),
        };
        EditorValueRecordError::NonCanonicalPendingFormats { format_index, source }
    })
}

pub(crate) fn encode_pending_format_records_v1(
    formats: &FormatSet,
    context: &EditorContext,
) -> Result<Vec<PendingFormatRecordV1>, EditorValueRecordError> {
    check_pending_format_count(formats.len(), context)?;
    formats
        .iter()
        .enumerate()
        .map(|(format_index, format)| {
            let format_index = usize_to_u64(format_index);
            if !context.schema().is_property_free_inline_format(format.kind()) {
                return Err(EditorValueRecordError::PendingFormatNotAllowed { format_index });
            }
            if !format.properties().is_empty() {
                return Err(EditorValueRecordError::PendingFormatPropertiesNotAllowed {
                    format_index,
                });
            }
            Ok(PendingFormatRecordV1 {
                format_type: format.kind().as_str().to_owned(),
                properties: EmptyPropertyMapRecord,
            })
        })
        .collect()
}

fn point_from_record(
    record: PointRecordV1,
    endpoint: SelectionEndpoint,
) -> Result<Point, EditorValueRecordError> {
    match record {
        PointRecordV1::Text { text_path, utf16_offset, affinity } => Ok(Point::Text {
            text_path: path_from_record(text_path, endpoint)?,
            utf16_offset,
            affinity: affinity_from_record(affinity),
        }),
        PointRecordV1::Children { parent_path, child_index, affinity } => Ok(Point::Children {
            parent_path: path_from_record(parent_path, endpoint)?,
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
    endpoint: SelectionEndpoint,
) -> Result<NodePath, EditorValueRecordError> {
    NodePath::try_from_indices(indices)
        .map_err(|source| EditorValueRecordError::InvalidSelectionPath { endpoint, source })
}

fn check_pending_format_count(
    actual: usize,
    context: &EditorContext,
) -> Result<(), EditorValueRecordError> {
    let maximum = context.limits().max_formats_per_text();
    if actual > maximum {
        return Err(EditorValueRecordError::PendingFormatLimit {
            actual: usize_to_u64(actual),
            maximum: usize_to_u64(maximum),
        });
    }
    Ok(())
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

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
