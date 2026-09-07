use thiserror::Error;

use crate::{
    document::{TextFragment, TextFragmentSplitError},
    identity::QualifiedName,
    operation::{Operation, OperationKind, ParagraphJoinError, RootTextReplaceError},
    position::{NodePath, TextOffset},
    schema::{SchemaId, point_protocol_child_count_maximum},
    state::EditorContext,
};

/// The semantic purpose of a path carried by an operation.
///
/// Together with [`OperationKind`], this identifies a coordinate without
/// exposing record-field names as error-control-flow strings.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum OperationPathRole {
    /// The editable element targeted by a text splice.
    TextContainer,
    /// The paragraph targeted by a split.
    Paragraph,
    /// The left paragraph targeted by a join.
    LeftParagraph,
    /// The paragraph containing a root-text range's start.
    StartParagraph,
    /// The paragraph containing a root-text range's end.
    EndParagraph,
}

/// The semantic purpose of a UTF-16 offset carried by an operation.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum OperationOffsetRole {
    /// The inclusive boundary of a paragraph-local splice.
    TextRangeStart,
    /// The exclusive boundary of a paragraph-local splice.
    TextRangeEnd,
    /// The boundary at which one paragraph is split.
    ParagraphSplit,
    /// The inclusive start boundary of a root-text range.
    RootTextStart,
    /// The exclusive end boundary of a root-text range.
    RootTextEnd,
}

/// The semantic purpose of one canonical text fragment.
///
/// An optional paragraph index on an [`OperationValidationError`] locates a
/// fragment within a multi-paragraph slice. The operation kind disambiguates
/// roles shared by more than one operation contract.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum OperationFragmentRole {
    /// Exact content removed by a paragraph-local splice.
    ExpectedRemoved,
    /// Content supplied for insertion.
    Replacement,
    /// A complete optimistic source guard.
    Expected,
    /// The complete left source guard of a paragraph join.
    ExpectedLeft,
    /// The complete right source guard of a paragraph join.
    ExpectedRight,
    /// A fragment deterministically derived for the operation result.
    Result,
}

/// The semantic purpose of a fragment slice's aggregate resource budget.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum OperationFragmentSliceRole {
    /// Exact content removed by a paragraph-local splice.
    ExpectedRemoved,
    /// Content supplied for insertion.
    Replacement,
    /// Complete optimistic source guards.
    Expected,
    /// The combined source paragraphs of a structural operation.
    Source,
    /// Paragraph fragments deterministically derived for the result.
    Result,
}

/// The semantic purpose of one direct-root child span.
///
/// A span starts at an encoded paragraph index and uses a checked exclusive
/// endpoint. It proves that the operation's locally known root coordinates can
/// exist under the active child-count budget.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum OperationRootChildSpanRole {
    /// The two result paragraphs produced by a paragraph split.
    ParagraphSplitResult,
    /// The two adjacent source paragraphs consumed by a paragraph join.
    ParagraphJoinSource,
    /// The result paragraphs produced by a root-text replacement.
    RootTextReplaceResult,
}

/// Why operation data is not valid under an active editor context.
///
/// These failures are independent of a document snapshot and are therefore
/// suitable for strict record decoding. A successful validation does not prove
/// that a target path exists or that an optimistic guard matches current text.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum OperationValidationError {
    /// A structural operation has no semantics under this compiled schema.
    #[error("{kind:?} does not support schema {schema}")]
    UnsupportedSchema {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Rejected active schema identity.
        schema: SchemaId,
    },
    /// A path exceeds the active document-depth budget.
    #[error("{kind:?} {role:?} path has depth {actual}; the configured maximum is {maximum}")]
    PathDepthLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected path.
        role: OperationPathRole,
        /// Actual path depth.
        actual: u64,
        /// Configured inclusive maximum depth.
        maximum: u64,
    },
    /// One path component cannot name a child under the active child budget.
    #[error(
        "{kind:?} {role:?} path component {component_index} is {actual}; it must be smaller than {maximum}"
    )]
    PathIndexLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected path.
        role: OperationPathRole,
        /// Zero-based component within the path.
        component_index: u64,
        /// Rejected child index.
        actual: u32,
        /// Active exclusive child-index bound after the protocol clamp.
        maximum: u32,
    },
    /// A UTF-16 offset exceeds any valid document's aggregate text budget.
    #[error("{kind:?} {role:?} offset {actual:?} exceeds the configured text budget {maximum}")]
    OffsetLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected offset.
        role: OperationOffsetRole,
        /// Rejected UTF-16 offset.
        actual: TextOffset,
        /// Configured document-wide UTF-8 byte budget used as a safe bound.
        maximum: u64,
    },
    /// A source, replacement, or result slice contains too many paragraphs.
    #[error("{kind:?} {role:?} slice has {actual} paragraphs; the configured maximum is {maximum}")]
    ParagraphCountLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected slice.
        role: OperationFragmentSliceRole,
        /// Actual paragraph count.
        actual: u64,
        /// Configured maximum root child count.
        maximum: u32,
    },
    /// A locally known direct-root child span exceeds the active child budget.
    #[error(
        "{kind:?} {role:?} root-child span [{start}, {exclusive_end}) exceeds the configured maximum {maximum}"
    )]
    RootChildSpanLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected root-child span.
        role: OperationRootChildSpanRole,
        /// Inclusive root-child index encoded by the operation.
        start: u32,
        /// Number of consecutive source or result paragraphs.
        count: u64,
        /// Checked exclusive endpoint in the fixed-width child protocol.
        exclusive_end: u32,
        /// Configured maximum root child count.
        maximum: u32,
    },
    /// A checked structural operation unexpectedly lacks its direct-root index.
    #[error("{kind:?} {role:?} root-child span has no encoded start index")]
    RootChildSpanStartMissing {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the root-child span.
        role: OperationRootChildSpanRole,
    },
    /// A locally known direct-root child endpoint overflowed the fixed-width protocol.
    #[error("{kind:?} {role:?} root-child span starting at {start} with count {count} overflowed")]
    RootChildSpanOverflow {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the root-child span.
        role: OperationRootChildSpanRole,
        /// Inclusive root-child index encoded by the operation.
        start: u32,
        /// Number of consecutive source or result paragraphs.
        count: u64,
    },
    /// A slice's conservative known node minimum exceeds the active node budget.
    #[error(
        "{kind:?} {role:?} slice requires at least {actual} nodes; the configured maximum is {maximum}"
    )]
    MinimumNodeCountLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the source, replacement, or result slice.
        role: OperationFragmentSliceRole,
        /// Root, known container elements, and canonical text runs.
        actual: u64,
        /// Configured document-wide node maximum.
        maximum: u64,
    },
    /// Computing a slice's conservative known node minimum overflowed.
    #[error("{kind:?} {role:?} slice minimum-node arithmetic overflowed")]
    MinimumNodeCountOverflow {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the slice being measured.
        role: OperationFragmentSliceRole,
    },
    /// A nonempty fragment requires a text leaf deeper than the active tree budget.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?} requires leaf depth {required_depth}; the configured maximum is {maximum}"
    )]
    FragmentLeafDepthLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the nonempty fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Depth of the paragraph or text-container element.
        container_depth: u64,
        /// Required depth of its text leaf.
        required_depth: u64,
        /// Configured inclusive maximum node depth.
        maximum: u64,
    },
    /// Computing a nonempty fragment's required text-leaf depth overflowed.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?} leaf-depth arithmetic overflowed"
    )]
    FragmentLeafDepthOverflow {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the nonempty fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Depth of the paragraph or text-container element.
        container_depth: u64,
    },
    /// One paragraph fragment contains too many canonical runs.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?} has {actual} runs; the configured maximum is {maximum}"
    )]
    FragmentRunCountLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Actual canonical run count.
        actual: u64,
        /// Configured maximum element child count.
        maximum: u32,
    },
    /// One independent fragment slice exceeds the document-wide text budget.
    #[error("{kind:?} {role:?} slice has {actual} text bytes; the configured maximum is {maximum}")]
    TotalTextBytesLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected slice.
        role: OperationFragmentSliceRole,
        /// Actual aggregate UTF-8 byte count.
        actual: u64,
        /// Configured document-wide maximum.
        maximum: u64,
    },
    /// A statically required source or result prefix exceeds the text budget.
    #[error(
        "{kind:?} {role:?} slice requires at least {actual} text bytes; the configured maximum is {maximum}"
    )]
    MinimumTextBytesLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the source or result slice.
        role: OperationFragmentSliceRole,
        /// Conservative minimum UTF-8 byte count.
        actual: u64,
        /// Configured document-wide maximum.
        maximum: u64,
    },
    /// Computing a source or result minimum text size overflowed.
    #[error("{kind:?} {role:?} slice minimum-text arithmetic overflowed")]
    MinimumTextBytesOverflow {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the source or result slice.
        role: OperationFragmentSliceRole,
    },
    /// Summing fragment byte lengths exceeded the fixed-width diagnostic space.
    #[error("{kind:?} {role:?} slice text-byte arithmetic overflowed")]
    TextByteLengthOverflow {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the slice being measured.
        role: OperationFragmentSliceRole,
    },
    /// One canonical run exceeds the configured text-leaf byte budget.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?}, run {run_index} has {actual} text bytes; the configured maximum is {maximum}"
    )]
    FragmentTextBytesLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Zero-based run index.
        run_index: u64,
        /// Actual UTF-8 byte length.
        actual: u64,
        /// Configured per-leaf maximum.
        maximum: u64,
    },
    /// One canonical run carries too many semantic formats.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?}, run {run_index} has {actual} formats; the configured maximum is {maximum}"
    )]
    FragmentFormatCountLimit {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Zero-based run index.
        run_index: u64,
        /// Actual format count.
        actual: u64,
        /// Configured maximum formats per text leaf.
        maximum: u64,
    },
    /// The active schema does not allow one supplied semantic format.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?}, run {run_index}, format {format_index} `{format_kind}` is not allowed"
    )]
    FragmentFormatNotAllowed {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Zero-based run index.
        run_index: u64,
        /// Zero-based format index.
        format_index: u64,
        /// Rejected format kind.
        format_kind: QualifiedName,
    },
    /// Operation fragments do not support properties on semantic formats.
    #[error(
        "{kind:?} {role:?} fragment at paragraph {paragraph_index:?}, run {run_index}, format {format_index} `{format_kind}` does not allow properties"
    )]
    FragmentFormatPropertiesNotAllowed {
        /// Rejected operation kind.
        kind: OperationKind,
        /// Purpose of the rejected fragment.
        role: OperationFragmentRole,
        /// Slice-relative paragraph, or `None` for a single fragment field.
        paragraph_index: Option<u64>,
        /// Zero-based run index.
        run_index: u64,
        /// Zero-based format index.
        format_index: u64,
        /// Rejected format kind.
        format_kind: QualifiedName,
    },
    /// Re-deriving a split result violated its already-checked constructor law.
    #[error("paragraph-split result derivation failed: {source}")]
    DerivedParagraphSplit {
        /// Exact fragment split failure.
        #[source]
        source: TextFragmentSplitError,
    },
    /// Re-deriving a join result violated its already-checked constructor law.
    #[error("paragraph-join result derivation failed: {source}")]
    DerivedParagraphJoin {
        /// Exact join-construction failure.
        #[source]
        source: ParagraphJoinError,
    },
    /// Re-deriving a root-text result violated its checked constructor law.
    #[error("root-text replacement result derivation failed: {source}")]
    DerivedRootTextReplace {
        /// Exact replacement-construction failure.
        #[source]
        source: RootTextReplaceError,
    },
}

pub(crate) fn validate_operation(
    operation: &Operation,
    context: &EditorContext,
) -> Result<(), OperationValidationError> {
    match operation {
        Operation::TextSplice(operation) => validate_text_splice(operation, context),
        Operation::ParagraphSplit(operation) => validate_paragraph_split(operation, context),
        Operation::ParagraphJoin(operation) => validate_paragraph_join(operation, context),
        Operation::RootTextReplace(operation) => validate_root_text_replace(operation, context),
    }
}

fn validate_text_splice(
    operation: &crate::operation::TextSplice,
    context: &EditorContext,
) -> Result<(), OperationValidationError> {
    let kind = OperationKind::TextSplice;
    validate_path(
        context,
        kind,
        OperationPathRole::TextContainer,
        operation.range().container_path(),
    )?;
    validate_offset(context, kind, OperationOffsetRole::TextRangeStart, operation.range().start())?;
    validate_offset(context, kind, OperationOffsetRole::TextRangeEnd, operation.range().end())?;

    validate_fragment(
        context,
        kind,
        OperationFragmentRole::ExpectedRemoved,
        None,
        usize_to_u64(operation.range().container_path().len()),
        operation.expected_removed(),
    )?;
    if operation.expected_removed().is_empty() && operation.range().end() > TextOffset::ZERO {
        validate_fragment_leaf_depth(
            context,
            kind,
            OperationFragmentRole::ExpectedRemoved,
            None,
            usize_to_u64(operation.range().container_path().len()),
        )?;
    }
    validate_total_text_bytes(
        context,
        kind,
        OperationFragmentSliceRole::ExpectedRemoved,
        [operation.expected_removed()],
    )?;
    validate_minimum_text_bytes(
        context,
        kind,
        OperationFragmentSliceRole::ExpectedRemoved,
        operation.range().start(),
        operation.expected_removed(),
    )?;
    validate_minimum_node_count_with_run_floor(
        context,
        kind,
        OperationFragmentSliceRole::ExpectedRemoved,
        minimum_nodes_through_path(
            kind,
            OperationFragmentSliceRole::ExpectedRemoved,
            operation.range().container_path(),
        )?,
        u64::from(operation.range().end() > TextOffset::ZERO),
        [operation.expected_removed()],
    )?;
    validate_fragment(
        context,
        kind,
        OperationFragmentRole::Replacement,
        None,
        usize_to_u64(operation.range().container_path().len()),
        operation.replacement(),
    )?;
    if operation.replacement().is_empty() && operation.range().start() > TextOffset::ZERO {
        validate_fragment_leaf_depth(
            context,
            kind,
            OperationFragmentRole::Replacement,
            None,
            usize_to_u64(operation.range().container_path().len()),
        )?;
    }
    validate_total_text_bytes(
        context,
        kind,
        OperationFragmentSliceRole::Replacement,
        [operation.replacement()],
    )?;
    validate_minimum_text_bytes(
        context,
        kind,
        OperationFragmentSliceRole::Replacement,
        operation.range().start(),
        operation.replacement(),
    )?;
    validate_minimum_node_count_with_run_floor(
        context,
        kind,
        OperationFragmentSliceRole::Replacement,
        minimum_nodes_through_path(
            kind,
            OperationFragmentSliceRole::Replacement,
            operation.range().container_path(),
        )?,
        u64::from(operation.range().start() > TextOffset::ZERO),
        [operation.replacement()],
    )
}

fn validate_paragraph_split(
    operation: &crate::operation::ParagraphSplit,
    context: &EditorContext,
) -> Result<(), OperationValidationError> {
    let kind = OperationKind::ParagraphSplit;
    validate_structural_schema(context, kind)?;
    validate_path(context, kind, OperationPathRole::Paragraph, operation.paragraph_path())?;
    validate_offset(context, kind, OperationOffsetRole::ParagraphSplit, operation.offset())?;
    let target_index = operation.paragraph_path().last_index().ok_or(
        OperationValidationError::RootChildSpanStartMissing {
            kind,
            role: OperationRootChildSpanRole::ParagraphSplitResult,
        },
    )?;
    let result_end = validate_root_child_span(
        context,
        kind,
        OperationRootChildSpanRole::ParagraphSplitResult,
        target_index,
        2,
    )?;
    let source_end =
        target_index.checked_add(1).ok_or(OperationValidationError::MinimumNodeCountOverflow {
            kind,
            role: OperationFragmentSliceRole::Expected,
        })?;
    validate_paragraph_count(context, kind, OperationFragmentSliceRole::Expected, 1)?;
    validate_fragment(
        context,
        kind,
        OperationFragmentRole::Expected,
        None,
        1,
        operation.expected(),
    )?;
    validate_total_text_bytes(
        context,
        kind,
        OperationFragmentSliceRole::Expected,
        [operation.expected()],
    )?;
    validate_minimum_node_count(
        context,
        kind,
        OperationFragmentSliceRole::Expected,
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Expected, source_end)?,
        [operation.expected()],
    )?;

    validate_paragraph_count(context, kind, OperationFragmentSliceRole::Result, 2)?;
    let (left, right) = operation
        .expected()
        .split_at(operation.offset())
        .map_err(|source| OperationValidationError::DerivedParagraphSplit { source })?;
    validate_fragment(context, kind, OperationFragmentRole::Result, Some(0), 1, &left)?;
    validate_fragment(context, kind, OperationFragmentRole::Result, Some(1), 1, &right)?;
    validate_total_text_bytes(context, kind, OperationFragmentSliceRole::Result, [&left, &right])?;
    validate_minimum_node_count(
        context,
        kind,
        OperationFragmentSliceRole::Result,
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Result, result_end)?,
        [&left, &right],
    )
}

fn validate_paragraph_join(
    operation: &crate::operation::ParagraphJoin,
    context: &EditorContext,
) -> Result<(), OperationValidationError> {
    let kind = OperationKind::ParagraphJoin;
    validate_structural_schema(context, kind)?;
    validate_path(context, kind, OperationPathRole::LeftParagraph, operation.left_path())?;
    let left_index = operation.left_path().last_index().ok_or(
        OperationValidationError::RootChildSpanStartMissing {
            kind,
            role: OperationRootChildSpanRole::ParagraphJoinSource,
        },
    )?;
    let source_end = validate_root_child_span(
        context,
        kind,
        OperationRootChildSpanRole::ParagraphJoinSource,
        left_index,
        2,
    )?;
    let result_end =
        left_index.checked_add(1).ok_or(OperationValidationError::MinimumNodeCountOverflow {
            kind,
            role: OperationFragmentSliceRole::Result,
        })?;
    validate_paragraph_count(context, kind, OperationFragmentSliceRole::Source, 2)?;
    validate_fragment(
        context,
        kind,
        OperationFragmentRole::ExpectedLeft,
        None,
        1,
        operation.expected_left(),
    )?;
    validate_fragment(
        context,
        kind,
        OperationFragmentRole::ExpectedRight,
        None,
        1,
        operation.expected_right(),
    )?;
    validate_total_text_bytes(
        context,
        kind,
        OperationFragmentSliceRole::Source,
        [operation.expected_left(), operation.expected_right()],
    )?;
    validate_minimum_node_count(
        context,
        kind,
        OperationFragmentSliceRole::Source,
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Source, source_end)?,
        [operation.expected_left(), operation.expected_right()],
    )?;

    let result = operation
        .derived_result()
        .map_err(|source| OperationValidationError::DerivedParagraphJoin { source })?;
    validate_paragraph_count(context, kind, OperationFragmentSliceRole::Result, 1)?;
    validate_fragment(context, kind, OperationFragmentRole::Result, Some(0), 1, &result)?;
    validate_total_text_bytes(context, kind, OperationFragmentSliceRole::Result, [&result])?;
    validate_minimum_node_count(
        context,
        kind,
        OperationFragmentSliceRole::Result,
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Result, result_end)?,
        [&result],
    )
}

fn validate_root_text_replace(
    operation: &crate::operation::RootTextReplace,
    context: &EditorContext,
) -> Result<(), OperationValidationError> {
    let kind = OperationKind::RootTextReplace;
    validate_structural_schema(context, kind)?;
    validate_path(
        context,
        kind,
        OperationPathRole::StartParagraph,
        operation.range().start().paragraph_path(),
    )?;
    validate_path(
        context,
        kind,
        OperationPathRole::EndParagraph,
        operation.range().end().paragraph_path(),
    )?;
    validate_offset(
        context,
        kind,
        OperationOffsetRole::RootTextStart,
        operation.range().start().offset(),
    )?;
    validate_offset(
        context,
        kind,
        OperationOffsetRole::RootTextEnd,
        operation.range().end().offset(),
    )?;
    let result_end = validate_root_child_span(
        context,
        kind,
        OperationRootChildSpanRole::RootTextReplaceResult,
        operation.range().start().paragraph_index(),
        usize_to_u64(operation.replacement_paragraphs().len()),
    )?;
    let expected_end = operation.range().end().paragraph_index().checked_add(1).ok_or(
        OperationValidationError::MinimumNodeCountOverflow {
            kind,
            role: OperationFragmentSliceRole::Expected,
        },
    )?;

    validate_fragment_slice(
        context,
        kind,
        OperationFragmentSliceRole::Expected,
        OperationFragmentRole::Expected,
        operation.expected_paragraphs(),
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Expected, expected_end)?,
    )?;
    validate_fragment_slice(
        context,
        kind,
        OperationFragmentSliceRole::Replacement,
        OperationFragmentRole::Replacement,
        operation.replacement_paragraphs(),
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Replacement, result_end)?,
    )?;

    let result = operation
        .derived_result()
        .map_err(|source| OperationValidationError::DerivedRootTextReplace { source })?;
    validate_fragment_slice(
        context,
        kind,
        OperationFragmentSliceRole::Result,
        OperationFragmentRole::Result,
        &result,
        minimum_root_prefix_node_count(kind, OperationFragmentSliceRole::Result, result_end)?,
    )
}

fn validate_structural_schema(
    context: &EditorContext,
    kind: OperationKind,
) -> Result<(), OperationValidationError> {
    if !context.schema().supports_base_text_operations() {
        return Err(OperationValidationError::UnsupportedSchema {
            kind,
            schema: context.schema().id().clone(),
        });
    }
    Ok(())
}

fn validate_path(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationPathRole,
    path: &NodePath,
) -> Result<(), OperationValidationError> {
    let actual_depth = usize_to_u64(path.len());
    let maximum_depth = usize_to_u64(context.limits().max_node_depth());
    if actual_depth > maximum_depth {
        return Err(OperationValidationError::PathDepthLimit {
            kind,
            role,
            actual: actual_depth,
            maximum: maximum_depth,
        });
    }
    let maximum_index = effective_child_count_limit(context);
    for (component_index, actual) in path.iter().enumerate() {
        if actual >= maximum_index {
            return Err(OperationValidationError::PathIndexLimit {
                kind,
                role,
                component_index: usize_to_u64(component_index),
                actual,
                maximum: maximum_index,
            });
        }
    }
    Ok(())
}

fn effective_child_count_limit(context: &EditorContext) -> u32 {
    let configured = usize_to_u64(context.limits().max_children_per_element());
    let protocol = usize_to_u64(point_protocol_child_count_maximum());
    u32::try_from(configured.min(protocol)).unwrap_or(u32::MAX)
}

fn validate_offset(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationOffsetRole,
    actual: TextOffset,
) -> Result<(), OperationValidationError> {
    let maximum = usize_to_u64(context.limits().max_total_text_bytes());
    if actual.get() > maximum {
        return Err(OperationValidationError::OffsetLimit { kind, role, actual, maximum });
    }
    Ok(())
}

fn validate_fragment_slice(
    context: &EditorContext,
    kind: OperationKind,
    slice_role: OperationFragmentSliceRole,
    fragment_role: OperationFragmentRole,
    fragments: &[TextFragment],
    minimum_non_text_nodes: u64,
) -> Result<(), OperationValidationError> {
    validate_paragraph_count(context, kind, slice_role, usize_to_u64(fragments.len()))?;
    for (paragraph_index, fragment) in fragments.iter().enumerate() {
        validate_fragment(
            context,
            kind,
            fragment_role,
            Some(usize_to_u64(paragraph_index)),
            1,
            fragment,
        )?;
    }
    validate_total_text_bytes(context, kind, slice_role, fragments.iter())?;
    validate_minimum_node_count(context, kind, slice_role, minimum_non_text_nodes, fragments.iter())
}

fn validate_root_child_span(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationRootChildSpanRole,
    start: u32,
    count: u64,
) -> Result<u32, OperationValidationError> {
    let protocol_count = u32::try_from(count).map_err(|_| {
        OperationValidationError::RootChildSpanOverflow { kind, role, start, count }
    })?;
    let exclusive_end = start
        .checked_add(protocol_count)
        .ok_or(OperationValidationError::RootChildSpanOverflow { kind, role, start, count })?;
    let maximum = effective_child_count_limit(context);
    if exclusive_end > maximum {
        return Err(OperationValidationError::RootChildSpanLimit {
            kind,
            role,
            start,
            count,
            exclusive_end,
            maximum,
        });
    }
    Ok(exclusive_end)
}

fn validate_paragraph_count(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    actual: u64,
) -> Result<(), OperationValidationError> {
    let maximum = effective_child_count_limit(context);
    if actual > u64::from(maximum) {
        return Err(OperationValidationError::ParagraphCountLimit { kind, role, actual, maximum });
    }
    Ok(())
}

fn validate_total_text_bytes<'a>(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    fragments: impl IntoIterator<Item = &'a TextFragment>,
) -> Result<(), OperationValidationError> {
    let mut actual = 0_u64;
    for fragment in fragments {
        actual = actual
            .checked_add(usize_to_u64(fragment.text_bytes()))
            .ok_or(OperationValidationError::TextByteLengthOverflow { kind, role })?;
    }
    let maximum = usize_to_u64(context.limits().max_total_text_bytes());
    if actual > maximum {
        return Err(OperationValidationError::TotalTextBytesLimit { kind, role, actual, maximum });
    }
    Ok(())
}

fn validate_minimum_text_bytes(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    prefix_utf16: TextOffset,
    fragment: &TextFragment,
) -> Result<(), OperationValidationError> {
    let actual = prefix_utf16
        .get()
        .checked_add(usize_to_u64(fragment.text_bytes()))
        .ok_or(OperationValidationError::MinimumTextBytesOverflow { kind, role })?;
    let maximum = usize_to_u64(context.limits().max_total_text_bytes());
    if actual > maximum {
        return Err(OperationValidationError::MinimumTextBytesLimit {
            kind,
            role,
            actual,
            maximum,
        });
    }
    Ok(())
}

fn validate_minimum_node_count<'a>(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    minimum_non_text_nodes: u64,
    fragments: impl IntoIterator<Item = &'a TextFragment>,
) -> Result<(), OperationValidationError> {
    validate_minimum_node_count_with_run_floor(
        context,
        kind,
        role,
        minimum_non_text_nodes,
        0,
        fragments,
    )
}

fn validate_minimum_node_count_with_run_floor<'a>(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    minimum_non_text_nodes: u64,
    minimum_text_runs: u64,
    fragments: impl IntoIterator<Item = &'a TextFragment>,
) -> Result<(), OperationValidationError> {
    let mut fragment_runs = 0_u64;
    for fragment in fragments {
        fragment_runs = fragment_runs
            .checked_add(usize_to_u64(fragment.len()))
            .ok_or(OperationValidationError::MinimumNodeCountOverflow { kind, role })?;
    }
    let actual = minimum_non_text_nodes
        .checked_add(fragment_runs.max(minimum_text_runs))
        .ok_or(OperationValidationError::MinimumNodeCountOverflow { kind, role })?;
    let maximum = usize_to_u64(context.limits().max_nodes());
    if actual > maximum {
        return Err(OperationValidationError::MinimumNodeCountLimit {
            kind,
            role,
            actual,
            maximum,
        });
    }
    Ok(())
}

fn minimum_nodes_through_path(
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    path: &NodePath,
) -> Result<u64, OperationValidationError> {
    let mut actual = 1_u64;
    for index in path.iter() {
        let implied_children = u64::from(index)
            .checked_add(1)
            .ok_or(OperationValidationError::MinimumNodeCountOverflow { kind, role })?;
        actual = actual
            .checked_add(implied_children)
            .ok_or(OperationValidationError::MinimumNodeCountOverflow { kind, role })?;
    }
    Ok(actual)
}

fn minimum_root_prefix_node_count(
    kind: OperationKind,
    role: OperationFragmentSliceRole,
    exclusive_end: u32,
) -> Result<u64, OperationValidationError> {
    u64::from(exclusive_end)
        .checked_add(1)
        .ok_or(OperationValidationError::MinimumNodeCountOverflow { kind, role })
}

fn validate_fragment(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentRole,
    paragraph_index: Option<u64>,
    container_depth: u64,
    fragment: &TextFragment,
) -> Result<(), OperationValidationError> {
    if !fragment.is_empty() {
        validate_fragment_leaf_depth(context, kind, role, paragraph_index, container_depth)?;
    }
    let maximum_runs = effective_child_count_limit(context);
    let actual_runs = usize_to_u64(fragment.len());
    if actual_runs > u64::from(maximum_runs) {
        return Err(OperationValidationError::FragmentRunCountLimit {
            kind,
            role,
            paragraph_index,
            actual: actual_runs,
            maximum: maximum_runs,
        });
    }

    for (run_index, run) in fragment.iter().enumerate() {
        let run_index = usize_to_u64(run_index);
        let actual_text_bytes = usize_to_u64(run.text().len());
        let maximum_text_bytes = usize_to_u64(context.limits().max_text_bytes());
        if actual_text_bytes > maximum_text_bytes {
            return Err(OperationValidationError::FragmentTextBytesLimit {
                kind,
                role,
                paragraph_index,
                run_index,
                actual: actual_text_bytes,
                maximum: maximum_text_bytes,
            });
        }
        let actual_formats = usize_to_u64(run.formats().len());
        let maximum_formats = usize_to_u64(context.limits().max_formats_per_text());
        if actual_formats > maximum_formats {
            return Err(OperationValidationError::FragmentFormatCountLimit {
                kind,
                role,
                paragraph_index,
                run_index,
                actual: actual_formats,
                maximum: maximum_formats,
            });
        }
        for (format_index, format) in run.formats().iter().enumerate() {
            let format_index = usize_to_u64(format_index);
            if !context.schema().allows_text_format(format.kind()) {
                return Err(OperationValidationError::FragmentFormatNotAllowed {
                    kind,
                    role,
                    paragraph_index,
                    run_index,
                    format_index,
                    format_kind: format.kind().clone(),
                });
            }
            if !format.properties().is_empty() {
                return Err(OperationValidationError::FragmentFormatPropertiesNotAllowed {
                    kind,
                    role,
                    paragraph_index,
                    run_index,
                    format_index,
                    format_kind: format.kind().clone(),
                });
            }
        }
    }
    Ok(())
}

fn validate_fragment_leaf_depth(
    context: &EditorContext,
    kind: OperationKind,
    role: OperationFragmentRole,
    paragraph_index: Option<u64>,
    container_depth: u64,
) -> Result<(), OperationValidationError> {
    let required_depth = container_depth.checked_add(1).ok_or(
        OperationValidationError::FragmentLeafDepthOverflow {
            kind,
            role,
            paragraph_index,
            container_depth,
        },
    )?;
    let maximum = usize_to_u64(context.limits().max_node_depth());
    if required_depth > maximum {
        return Err(OperationValidationError::FragmentLeafDepthLimit {
            kind,
            role,
            paragraph_index,
            container_depth,
            required_depth,
            maximum,
        });
    }
    Ok(())
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, error::Error};

    use crate::{
        document::{Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
        identity::QualifiedName,
        operation::{
            Operation, OperationFragmentRole, OperationFragmentSliceRole, OperationKind,
            OperationOffsetRole, OperationPathRole, OperationRootChildSpanRole,
            OperationValidationError, ParagraphJoin, ParagraphSplit, RootTextBoundary,
            RootTextRange, RootTextReplace, TextRange, TextSplice,
        },
        position::{NodePath, TextOffset},
        schema::{CompiledSchema, DocumentLimits},
        state::EditorContext,
    };

    fn path(index: u32) -> Result<NodePath, Box<dyn Error>> {
        NodePath::try_from_indices(vec![index]).map_err(Into::into)
    }

    fn offset(value: u64) -> Result<TextOffset, Box<dyn Error>> {
        TextOffset::try_new(value).map_err(Into::into)
    }

    fn plain(text: &str) -> Result<TextFragment, Box<dyn Error>> {
        TextRun::try_new(text, FormatSet::default()).map(TextFragment::from).map_err(Into::into)
    }

    fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn Error>> {
        let mut result = Vec::with_capacity(runs.len());
        for (text, strong) in runs {
            let formats = if *strong {
                FormatSet::try_from_formats(vec![Format::new(
                    QualifiedName::try_new("breditor/strong")?,
                    PropertyMap::default(),
                )])?
            } else {
                FormatSet::default()
            };
            result.push(TextRun::try_new(*text, formats)?);
        }
        TextFragment::try_from_runs(result).map_err(Into::into)
    }

    #[test]
    fn operation_kinds_have_stable_record_names() -> Result<(), Box<dyn Error>> {
        let operation = TextSplice::try_new(
            TextRange::try_new(path(0)?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        assert_eq!(operation.kind(), OperationKind::TextSplice);
        assert_eq!(operation.kind().as_str(), "textSplice");
        assert_eq!(OperationKind::ParagraphSplit.as_str(), "paragraphSplit");
        assert_eq!(OperationKind::ParagraphJoin.as_str(), "paragraphJoin");
        assert_eq!(OperationKind::RootTextReplace.as_str(), "rootTextReplace");
        Ok(())
    }

    #[test]
    fn path_components_and_offsets_obey_active_document_limits() -> Result<(), Box<dyn Error>> {
        let path_limited = TextSplice::try_new(
            TextRange::try_new(path(1)?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let path_context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_children_per_element(1),
        );
        assert_eq!(
            path_limited.validate(&path_context),
            Err(OperationValidationError::PathIndexLimit {
                kind: OperationKind::TextSplice,
                role: OperationPathRole::TextContainer,
                component_index: 0,
                actual: 1,
                maximum: 1,
            })
        );

        let offset_limited = TextSplice::try_new(
            TextRange::try_new(path(0)?, offset(5)?, offset(5)?)?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let offset_context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_total_text_bytes(4),
        );
        assert_eq!(
            offset_limited.validate(&offset_context),
            Err(OperationValidationError::OffsetLimit {
                kind: OperationKind::TextSplice,
                role: OperationOffsetRole::TextRangeStart,
                actual: offset(5)?,
                maximum: 4,
            })
        );
        Ok(())
    }

    #[test]
    fn text_leaf_depth_includes_nonempty_and_implicit_prefix_runs() -> Result<(), Box<dyn Error>> {
        let nested = TextSplice::try_new(
            TextRange::try_new(
                NodePath::try_from_indices(vec![0, 0])?,
                TextOffset::ZERO,
                offset(1)?,
            )?,
            plain("a")?,
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let shallow = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_node_depth(2),
        );
        assert_eq!(
            nested.validate(&shallow),
            Err(OperationValidationError::FragmentLeafDepthLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentRole::ExpectedRemoved,
                paragraph_index: None,
                container_depth: 2,
                required_depth: 3,
                maximum: 2,
            })
        );

        let collapsed = TextSplice::try_new(
            TextRange::try_new(path(0)?, offset(1)?, offset(1)?)?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let paragraph_only = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_node_depth(1),
        );
        assert_eq!(
            collapsed.validate(&paragraph_only),
            Err(OperationValidationError::FragmentLeafDepthLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentRole::ExpectedRemoved,
                paragraph_index: None,
                container_depth: 1,
                required_depth: 2,
                maximum: 1,
            })
        );

        let insertion = TextSplice::try_new(
            TextRange::try_new(path(0)?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            plain("x")?,
        )
        .map(Operation::from)?;
        assert_eq!(
            insertion.validate(&paragraph_only),
            Err(OperationValidationError::FragmentLeafDepthLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentRole::Replacement,
                paragraph_index: None,
                container_depth: 1,
                required_depth: 2,
                maximum: 1,
            })
        );
        Ok(())
    }

    #[test]
    fn text_splice_minimum_text_bytes_include_the_retained_prefix() -> Result<(), Box<dyn Error>> {
        let guarded = TextSplice::try_new(
            TextRange::try_new(path(0)?, offset(1)?, offset(3)?)?,
            plain("😀")?,
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let exact_guard = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_total_text_bytes(5),
        );
        assert_eq!(guarded.validate(&exact_guard), Ok(()));
        let short_guard = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_total_text_bytes(4),
        );
        assert_eq!(
            guarded.validate(&short_guard),
            Err(OperationValidationError::MinimumTextBytesLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentSliceRole::ExpectedRemoved,
                actual: 5,
                maximum: 4,
            })
        );

        let insertion = TextSplice::try_new(
            TextRange::try_new(path(0)?, offset(4)?, offset(4)?)?,
            TextFragment::empty(),
            plain("x")?,
        )
        .map(Operation::from)?;
        assert_eq!(insertion.validate(&exact_guard), Ok(()));
        assert_eq!(
            insertion.validate(&short_guard),
            Err(OperationValidationError::MinimumTextBytesLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentSliceRole::Replacement,
                actual: 5,
                maximum: 4,
            })
        );
        Ok(())
    }

    #[test]
    fn collapsed_nonzero_text_splice_requires_one_implicit_run() -> Result<(), Box<dyn Error>> {
        let operation = TextSplice::try_new(
            TextRange::try_new(path(0)?, offset(1)?, offset(1)?)?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let exact = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(3),
        );
        assert_eq!(operation.validate(&exact), Ok(()));
        let short = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(2),
        );
        assert_eq!(
            operation.validate(&short),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentSliceRole::ExpectedRemoved,
                actual: 3,
                maximum: 2,
            })
        );
        Ok(())
    }

    #[test]
    fn nonzero_coordinates_contribute_implied_nodes() -> Result<(), Box<dyn Error>> {
        let nested = TextSplice::try_new(
            TextRange::try_new(
                NodePath::try_from_indices(vec![2, 3])?,
                TextOffset::ZERO,
                offset(1)?,
            )?,
            plain("a")?,
            plain("b")?,
        )
        .map(Operation::from)?;
        let exact_nested = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(9),
        );
        assert_eq!(nested.validate(&exact_nested), Ok(()));
        let short_nested = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(8),
        );
        assert_eq!(
            nested.validate(&short_nested),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentSliceRole::ExpectedRemoved,
                actual: 9,
                maximum: 8,
            })
        );

        let split =
            ParagraphSplit::try_new(path(2)?, offset(1)?, plain("ab")?).map(Operation::from)?;
        let exact_split = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(7),
        );
        assert_eq!(split.validate(&exact_split), Ok(()));
        let short_split = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(6),
        );
        assert_eq!(
            split.validate(&short_split),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::ParagraphSplit,
                role: OperationFragmentSliceRole::Result,
                actual: 7,
                maximum: 6,
            })
        );
        Ok(())
    }

    #[test]
    fn nonzero_structural_source_spans_contribute_prefix_paragraphs() -> Result<(), Box<dyn Error>>
    {
        let join = ParagraphJoin::try_new(path(2)?, plain("a")?, fragment(&[("b", true)])?)
            .map(Operation::from)?;
        let exact_join = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(7),
        );
        assert_eq!(join.validate(&exact_join), Ok(()));
        let short_join = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(6),
        );
        assert_eq!(
            join.validate(&short_join),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::ParagraphJoin,
                role: OperationFragmentSliceRole::Source,
                actual: 7,
                maximum: 6,
            })
        );

        let start = RootTextBoundary::try_new(path(2)?, TextOffset::ZERO)?;
        let end = RootTextBoundary::try_new(path(3)?, offset(1)?)?;
        let root = RootTextReplace::try_new(
            RootTextRange::try_new(start, end)?,
            vec![plain("a")?, plain("b")?],
            vec![TextFragment::empty()],
        )
        .map(Operation::from)?;
        let exact_root = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(7),
        );
        assert_eq!(root.validate(&exact_root), Ok(()));
        let short_root = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(6),
        );
        assert_eq!(
            root.validate(&short_root),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::RootTextReplace,
                role: OperationFragmentSliceRole::Expected,
                actual: 7,
                maximum: 6,
            })
        );
        Ok(())
    }

    #[test]
    fn format_properties_are_rejected_as_typed_static_data() -> Result<(), Box<dyn Error>> {
        let mut properties = BTreeMap::new();
        properties.insert(QualifiedName::try_new("breditor/value")?, PropertyValue::boolean(true));
        let format_kind = QualifiedName::try_new("breditor/strong")?;
        let formats = FormatSet::try_from_formats(vec![Format::new(
            format_kind.clone(),
            PropertyMap::from_map(properties),
        )])?;
        let replacement = TextRun::try_new("x", formats).map(TextFragment::from)?;
        let operation = TextSplice::try_new(
            TextRange::try_new(path(0)?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            replacement,
        )
        .map(Operation::from)?;

        assert_eq!(
            operation.validate(&EditorContext::default()),
            Err(OperationValidationError::FragmentFormatPropertiesNotAllowed {
                kind: OperationKind::TextSplice,
                role: OperationFragmentRole::Replacement,
                paragraph_index: None,
                run_index: 0,
                format_index: 0,
                format_kind,
            })
        );
        Ok(())
    }

    #[test]
    fn structural_root_child_spans_fit_the_active_budget() -> Result<(), Box<dyn Error>> {
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_children_per_element(2),
        );
        let split =
            ParagraphSplit::try_new(path(1)?, offset(1)?, plain("ab")?).map(Operation::from)?;
        assert_eq!(
            split.validate(&context),
            Err(OperationValidationError::RootChildSpanLimit {
                kind: OperationKind::ParagraphSplit,
                role: OperationRootChildSpanRole::ParagraphSplitResult,
                start: 1,
                count: 2,
                exclusive_end: 3,
                maximum: 2,
            })
        );

        let join =
            ParagraphJoin::try_new(path(1)?, plain("a")?, plain("b")?).map(Operation::from)?;
        assert_eq!(
            join.validate(&context),
            Err(OperationValidationError::RootChildSpanLimit {
                kind: OperationKind::ParagraphJoin,
                role: OperationRootChildSpanRole::ParagraphJoinSource,
                start: 1,
                count: 2,
                exclusive_end: 3,
                maximum: 2,
            })
        );

        let boundary = RootTextBoundary::try_new(path(1)?, TextOffset::ZERO)?;
        let root = RootTextReplace::try_new(
            RootTextRange::try_new(boundary.clone(), boundary)?,
            vec![TextFragment::empty()],
            vec![TextFragment::empty(), TextFragment::empty()],
        )
        .map(Operation::from)?;
        assert_eq!(
            root.validate(&context),
            Err(OperationValidationError::RootChildSpanLimit {
                kind: OperationKind::RootTextReplace,
                role: OperationRootChildSpanRole::RootTextReplaceResult,
                start: 1,
                count: 2,
                exclusive_end: 3,
                maximum: 2,
            })
        );
        Ok(())
    }

    #[test]
    fn structural_root_child_spans_reject_protocol_overflow() -> Result<(), Box<dyn Error>> {
        let maximum = usize::try_from(u32::MAX)?;
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_children_per_element(maximum),
        );
        let clamped_path = TextSplice::try_new(
            TextRange::try_new(path(u32::MAX)?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        assert_eq!(
            clamped_path.validate(&context),
            Err(OperationValidationError::PathIndexLimit {
                kind: OperationKind::TextSplice,
                role: OperationPathRole::TextContainer,
                component_index: 0,
                actual: u32::MAX,
                maximum: u32::MAX,
            })
        );

        let operation =
            ParagraphSplit::try_new(path(u32::MAX - 1)?, TextOffset::ZERO, TextFragment::empty())
                .map(Operation::from)?;
        assert_eq!(
            operation.validate(&context),
            Err(OperationValidationError::RootChildSpanOverflow {
                kind: OperationKind::ParagraphSplit,
                role: OperationRootChildSpanRole::ParagraphSplitResult,
                start: u32::MAX - 1,
                count: 2,
            })
        );
        Ok(())
    }

    #[test]
    fn path_implied_node_minimum_uses_fixed_width_arithmetic() -> Result<(), Box<dyn Error>> {
        let protocol_maximum = usize::try_from(u32::MAX)?;
        let operation = TextSplice::try_new(
            TextRange::try_new(
                NodePath::try_from_indices(vec![u32::MAX - 1, u32::MAX - 1])?,
                TextOffset::ZERO,
                TextOffset::ZERO,
            )?,
            TextFragment::empty(),
            TextFragment::empty(),
        )
        .map(Operation::from)?;
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default()
                .with_max_nodes(protocol_maximum)
                .with_max_children_per_element(protocol_maximum),
        );

        assert_eq!(
            operation.validate(&context),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentSliceRole::ExpectedRemoved,
                actual: 8_589_934_591,
                maximum: u64::from(u32::MAX),
            })
        );
        Ok(())
    }

    #[test]
    fn known_minimum_node_counts_accept_exact_boundaries() -> Result<(), Box<dyn Error>> {
        let splice = TextSplice::try_new(
            TextRange::try_new(path(0)?, TextOffset::ZERO, offset(1)?)?,
            plain("a")?,
            plain("b")?,
        )
        .map(Operation::from)?;
        let exact_splice = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(3),
        );
        assert_eq!(splice.validate(&exact_splice), Ok(()));
        let short_splice = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(2),
        );
        assert_eq!(
            splice.validate(&short_splice),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::TextSplice,
                role: OperationFragmentSliceRole::ExpectedRemoved,
                actual: 3,
                maximum: 2,
            })
        );

        let split =
            ParagraphSplit::try_new(path(0)?, offset(1)?, plain("ab")?).map(Operation::from)?;
        let exact_split = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(5),
        );
        assert_eq!(split.validate(&exact_split), Ok(()));
        let short_split = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(4),
        );
        assert_eq!(
            split.validate(&short_split),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::ParagraphSplit,
                role: OperationFragmentSliceRole::Result,
                actual: 5,
                maximum: 4,
            })
        );

        let join = ParagraphJoin::try_new(path(0)?, plain("a")?, fragment(&[("b", true)])?)
            .map(Operation::from)?;
        let exact_join = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(5),
        );
        assert_eq!(join.validate(&exact_join), Ok(()));
        let short_join = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(4),
        );
        assert_eq!(
            join.validate(&short_join),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::ParagraphJoin,
                role: OperationFragmentSliceRole::Source,
                actual: 5,
                maximum: 4,
            })
        );

        let boundary = RootTextBoundary::try_new(path(0)?, offset(1)?)?;
        let root = RootTextReplace::try_new(
            RootTextRange::try_new(boundary.clone(), boundary)?,
            vec![fragment(&[("a", false), ("b", true)])?],
            vec![fragment(&[("x", true), ("y", false)])?],
        )
        .map(Operation::from)?;
        let exact_root = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(6),
        );
        assert_eq!(root.validate(&exact_root), Ok(()));
        let short_root = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_nodes(5),
        );
        assert_eq!(
            root.validate(&short_root),
            Err(OperationValidationError::MinimumNodeCountLimit {
                kind: OperationKind::RootTextReplace,
                role: OperationFragmentSliceRole::Result,
                actual: 6,
                maximum: 5,
            })
        );
        Ok(())
    }

    #[test]
    fn join_validation_measures_the_seam_merged_result_run() -> Result<(), Box<dyn Error>> {
        let operation =
            ParagraphJoin::try_new(path(0)?, plain("ab")?, plain("cd")?).map(Operation::from)?;
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_text_bytes(3),
        );

        assert_eq!(
            operation.validate(&context),
            Err(OperationValidationError::FragmentTextBytesLimit {
                kind: OperationKind::ParagraphJoin,
                role: OperationFragmentRole::Result,
                paragraph_index: Some(0),
                run_index: 0,
                actual: 4,
                maximum: 3,
            })
        );
        Ok(())
    }

    #[test]
    fn root_replacement_validation_measures_derived_result_seams() -> Result<(), Box<dyn Error>> {
        let boundary = RootTextBoundary::try_new(path(0)?, offset(2)?)?;
        let range = RootTextRange::try_new(boundary.clone(), boundary)?;
        let operation = RootTextReplace::try_new(range, vec![plain("ab")?], vec![plain("cd")?])
            .map(Operation::from)?;
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_text_bytes(3),
        );

        assert_eq!(
            operation.validate(&context),
            Err(OperationValidationError::FragmentTextBytesLimit {
                kind: OperationKind::RootTextReplace,
                role: OperationFragmentRole::Result,
                paragraph_index: Some(0),
                run_index: 0,
                actual: 4,
                maximum: 3,
            })
        );
        Ok(())
    }
}
