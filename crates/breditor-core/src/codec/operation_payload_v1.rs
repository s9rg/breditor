//! Checked conversion between the V1 wire payload and runtime operations.

use crate::{
    codec::{
        OperationFragmentField, OperationOffsetField, OperationPathField, OperationRecordError,
        OperationRecordErrorCode, OperationRecordLocation,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, OperationKind, ParagraphJoin, ParagraphJoinError, ParagraphSplit,
        ParagraphSplitError, RootTextBoundary, RootTextRange, RootTextReplace, TextRange,
        TextSplice,
    },
    position::{NodePath, TextOffset},
    record::{
        EmptyPropertyMapRecord, OperationFormatRecordV1, OperationRecordV1,
        RootTextBoundaryRecordV1, RootTextRangeRecordV1, TextFragmentRecordV1, TextRangeRecordV1,
        TextRunRecordV1,
    },
};

/// Reconstructs one strict V1 payload through the runtime checked constructors.
pub(crate) fn decode_operation_payload_v1(
    record: OperationRecordV1,
) -> Result<Operation, OperationRecordError> {
    match record {
        OperationRecordV1::TextSplice { range, expected_removed, replacement } => {
            let range = text_range_from_record(range)?;
            let expected_removed = fragment_from_record(
                expected_removed,
                OperationFragmentField::TextSpliceExpectedRemoved,
                0,
            )?;
            let replacement = fragment_from_record(
                replacement,
                OperationFragmentField::TextSpliceReplacement,
                0,
            )?;
            TextSplice::try_new(range, expected_removed, replacement)
                .map(Operation::from)
                .map_err(|error| operation_contract_error(OperationKind::TextSplice, &error))
        }
        OperationRecordV1::ParagraphSplit { paragraph_path, offset, expected } => {
            let paragraph_path =
                path_from_record(paragraph_path, OperationPathField::ParagraphSplitParagraph)?;
            let offset = offset_from_record(offset, OperationOffsetField::ParagraphSplit)?;
            let expected =
                fragment_from_record(expected, OperationFragmentField::ParagraphSplitExpected, 0)?;
            ParagraphSplit::try_new(paragraph_path, offset, expected)
                .map(Operation::from)
                .map_err(|error| paragraph_split_record_error(&error))
        }
        OperationRecordV1::ParagraphJoin { left_path, expected_left, expected_right } => {
            let left_path = path_from_record(left_path, OperationPathField::ParagraphJoinLeft)?;
            let expected_left = fragment_from_record(
                expected_left,
                OperationFragmentField::ParagraphJoinExpectedLeft,
                0,
            )?;
            let expected_right = fragment_from_record(
                expected_right,
                OperationFragmentField::ParagraphJoinExpectedRight,
                0,
            )?;
            ParagraphJoin::try_new(left_path, expected_left, expected_right)
                .map(Operation::from)
                .map_err(|error| paragraph_join_record_error(&error))
        }
        OperationRecordV1::RootTextReplace {
            range,
            expected_paragraphs,
            replacement_paragraphs,
        } => {
            let range = root_text_range_from_record(range)?;
            let expected_paragraphs = fragment_list_from_record(
                expected_paragraphs,
                OperationFragmentField::RootTextReplaceExpectedParagraph,
            )?;
            let replacement_paragraphs = fragment_list_from_record(
                replacement_paragraphs,
                OperationFragmentField::RootTextReplaceReplacementParagraph,
            )?;
            RootTextReplace::try_new(range, expected_paragraphs, replacement_paragraphs)
                .map(Operation::from)
                .map_err(|error| operation_contract_error(OperationKind::RootTextReplace, &error))
        }
    }
}

/// Projects one checked runtime operation into its exact V1 payload.
pub(crate) fn encode_operation_payload_v1(operation: &Operation) -> OperationRecordV1 {
    match operation {
        Operation::TextSplice(operation) => OperationRecordV1::TextSplice {
            range: TextRangeRecordV1 {
                container_path: operation.range().container_path().to_vec(),
                start: operation.range().start().get(),
                end: operation.range().end().get(),
            },
            expected_removed: fragment_record_from_runtime(operation.expected_removed()),
            replacement: fragment_record_from_runtime(operation.replacement()),
        },
        Operation::ParagraphSplit(operation) => OperationRecordV1::ParagraphSplit {
            paragraph_path: operation.paragraph_path().to_vec(),
            offset: operation.offset().get(),
            expected: fragment_record_from_runtime(operation.expected()),
        },
        Operation::ParagraphJoin(operation) => OperationRecordV1::ParagraphJoin {
            left_path: operation.left_path().to_vec(),
            expected_left: fragment_record_from_runtime(operation.expected_left()),
            expected_right: fragment_record_from_runtime(operation.expected_right()),
        },
        Operation::RootTextReplace(operation) => OperationRecordV1::RootTextReplace {
            range: RootTextRangeRecordV1 {
                start: boundary_record_from_runtime(operation.range().start()),
                end: boundary_record_from_runtime(operation.range().end()),
            },
            expected_paragraphs: operation
                .expected_paragraphs()
                .iter()
                .map(fragment_record_from_runtime)
                .collect(),
            replacement_paragraphs: operation
                .replacement_paragraphs()
                .iter()
                .map(fragment_record_from_runtime)
                .collect(),
        },
    }
}

fn text_range_from_record(record: TextRangeRecordV1) -> Result<TextRange, OperationRecordError> {
    let path = path_from_record(record.container_path, OperationPathField::TextSpliceContainer)?;
    let start = offset_from_record(record.start, OperationOffsetField::TextSpliceStart)?;
    let end = offset_from_record(record.end, OperationOffsetField::TextSpliceEnd)?;
    TextRange::try_new(path, start, end).map_err(|error| {
        record_error(
            OperationRecordErrorCode::InvalidRange,
            OperationRecordLocation::Operation(OperationKind::TextSplice),
            &error,
        )
    })
}

fn root_text_range_from_record(
    record: RootTextRangeRecordV1,
) -> Result<RootTextRange, OperationRecordError> {
    let start = root_text_boundary_from_record(
        record.start,
        OperationPathField::RootTextReplaceStart,
        OperationOffsetField::RootTextReplaceStart,
    )?;
    let end = root_text_boundary_from_record(
        record.end,
        OperationPathField::RootTextReplaceEnd,
        OperationOffsetField::RootTextReplaceEnd,
    )?;
    RootTextRange::try_new(start, end).map_err(|error| {
        record_error(
            OperationRecordErrorCode::InvalidRange,
            OperationRecordLocation::Operation(OperationKind::RootTextReplace),
            &error,
        )
    })
}

fn root_text_boundary_from_record(
    record: RootTextBoundaryRecordV1,
    path_field: OperationPathField,
    offset_field: OperationOffsetField,
) -> Result<RootTextBoundary, OperationRecordError> {
    let path = path_from_record(record.paragraph_path, path_field)?;
    let offset = offset_from_record(record.offset, offset_field)?;
    RootTextBoundary::try_new(path, offset).map_err(|error| {
        record_error(
            OperationRecordErrorCode::InvalidPath,
            OperationRecordLocation::Path(path_field),
            &error,
        )
    })
}

fn path_from_record(
    indices: Vec<u32>,
    field: OperationPathField,
) -> Result<NodePath, OperationRecordError> {
    NodePath::try_from_indices(indices).map_err(|error| {
        record_error(
            OperationRecordErrorCode::InvalidPath,
            OperationRecordLocation::Path(field),
            &error,
        )
    })
}

fn offset_from_record(
    value: u64,
    field: OperationOffsetField,
) -> Result<TextOffset, OperationRecordError> {
    TextOffset::try_new(value).map_err(|error| {
        record_error(
            OperationRecordErrorCode::InvalidOffset,
            OperationRecordLocation::Offset(field),
            &error,
        )
    })
}

fn fragment_list_from_record(
    records: Vec<TextFragmentRecordV1>,
    field: OperationFragmentField,
) -> Result<Vec<TextFragment>, OperationRecordError> {
    records
        .into_iter()
        .enumerate()
        .map(|(paragraph_index, record)| {
            fragment_from_record(record, field, usize_to_u64(paragraph_index))
        })
        .collect()
}

fn fragment_from_record(
    record: TextFragmentRecordV1,
    field: OperationFragmentField,
    paragraph_index: u64,
) -> Result<TextFragment, OperationRecordError> {
    let mut runs = Vec::with_capacity(record.runs.len());
    for (run_index, record) in record.runs.into_iter().enumerate() {
        runs.push(run_from_record(record, field, paragraph_index, usize_to_u64(run_index))?);
    }
    TextFragment::try_from_runs(runs).map_err(|error| {
        record_error(
            OperationRecordErrorCode::NonCanonicalFragment,
            OperationRecordLocation::Fragment { field, paragraph_index },
            &error,
        )
    })
}

fn run_from_record(
    record: TextRunRecordV1,
    field: OperationFragmentField,
    paragraph_index: u64,
    run_index: u64,
) -> Result<TextRun, OperationRecordError> {
    let mut formats = Vec::with_capacity(record.formats.len());
    for (format_index, record) in record.formats.into_iter().enumerate() {
        formats.push(format_from_record(
            record,
            field,
            paragraph_index,
            run_index,
            usize_to_u64(format_index),
        )?);
    }
    let formats = FormatSet::try_from_formats(formats).map_err(|error| {
        record_error(
            OperationRecordErrorCode::NonCanonicalFormats,
            OperationRecordLocation::Run { field, paragraph_index, run_index },
            &error,
        )
    })?;
    TextRun::try_new(record.text, formats).map_err(|error| {
        record_error(
            OperationRecordErrorCode::InvalidTextRun,
            OperationRecordLocation::Run { field, paragraph_index, run_index },
            &error,
        )
    })
}

fn format_from_record(
    record: OperationFormatRecordV1,
    field: OperationFragmentField,
    paragraph_index: u64,
    run_index: u64,
    format_index: u64,
) -> Result<Format, OperationRecordError> {
    let location =
        OperationRecordLocation::Format { field, paragraph_index, run_index, format_index };
    let kind = QualifiedName::try_from(record.format_type).map_err(|error| {
        record_error(OperationRecordErrorCode::InvalidFormatName, location.clone(), &error)
    })?;
    debug_assert_eq!(record.properties, EmptyPropertyMapRecord);
    Ok(Format::new(kind, PropertyMap::default()))
}

fn operation_contract_error(kind: OperationKind, error: &impl ToString) -> OperationRecordError {
    record_error(
        OperationRecordErrorCode::ContractViolation,
        OperationRecordLocation::Operation(kind),
        error,
    )
}

fn paragraph_split_record_error(error: &ParagraphSplitError) -> OperationRecordError {
    let (code, location) = match error {
        ParagraphSplitError::TargetPathDepth { .. } => (
            OperationRecordErrorCode::InvalidPath,
            OperationRecordLocation::Path(OperationPathField::ParagraphSplitParagraph),
        ),
        ParagraphSplitError::FragmentSplit(_) => (
            OperationRecordErrorCode::ContractViolation,
            OperationRecordLocation::Operation(OperationKind::ParagraphSplit),
        ),
    };
    record_error(code, location, error)
}

fn paragraph_join_record_error(error: &ParagraphJoinError) -> OperationRecordError {
    let (code, location) = match error {
        ParagraphJoinError::TargetPathDepth { .. } | ParagraphJoinError::RightIndexOverflow => (
            OperationRecordErrorCode::InvalidPath,
            OperationRecordLocation::Path(OperationPathField::ParagraphJoinLeft),
        ),
        ParagraphJoinError::Fragment(_) => (
            OperationRecordErrorCode::ContractViolation,
            OperationRecordLocation::Operation(OperationKind::ParagraphJoin),
        ),
    };
    record_error(code, location, error)
}

fn record_error(
    code: OperationRecordErrorCode,
    location: OperationRecordLocation,
    diagnostic: &impl ToString,
) -> OperationRecordError {
    OperationRecordError::new(code, location, diagnostic.to_string())
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

fn boundary_record_from_runtime(boundary: &RootTextBoundary) -> RootTextBoundaryRecordV1 {
    RootTextBoundaryRecordV1 {
        paragraph_path: boundary.paragraph_path().to_vec(),
        offset: boundary.offset().get(),
    }
}

fn fragment_record_from_runtime(fragment: &TextFragment) -> TextFragmentRecordV1 {
    TextFragmentRecordV1 {
        runs: fragment
            .iter()
            .map(|run| TextRunRecordV1 {
                text: run.text().to_owned(),
                formats: run
                    .formats()
                    .iter()
                    .map(|format| OperationFormatRecordV1 {
                        format_type: format.kind().as_str().to_owned(),
                        properties: EmptyPropertyMapRecord,
                    })
                    .collect(),
            })
            .collect(),
    }
}
