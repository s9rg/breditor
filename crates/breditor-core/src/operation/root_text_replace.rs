use std::sync::Arc;

use thiserror::Error;

use crate::{
    document::{
        Document, DocumentProofMismatch, ElementNode, LocalParagraphStructureError,
        NodeLookupError, TextFragment, TextFragmentError, TextFragmentSplitError,
    },
    identity::QualifiedName,
    operation::{
        AppliedChange, AppliedOperation, ChildRange, ChildrenChange, Operation,
        ParagraphStructureInvariantRule, ParagraphTargetRule, RootTextBoundary,
        RootTextBoundaryError, RootTextRange, RootTextRangeError,
    },
    position::{NodePath, TextOffset, TextOffsetError},
    schema::{SchemaId, ValidationReport},
    state::EditorContext,
};

use super::{
    RootTextReplaceMap,
    paragraph_support::{
        ParagraphContentError, ResolveParagraphError, ensure_base_document,
        fragment_from_paragraph, paragraph_from_fragment, resolve_base_paragraph,
    },
};

/// Atomically replaces a guarded text range across direct-root paragraphs.
///
/// `expected_paragraphs` contains the complete source paragraphs intersected
/// by `range`, in source order. `replacement_paragraphs` is a non-empty list of
/// paragraph fragments: the source prefix is joined to its first fragment and
/// the source suffix to its last fragment. This makes paragraph breaks native
/// data rather than an expansion into split/join intermediates.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootTextReplace {
    range: RootTextRange,
    expected_paragraphs: Arc<[TextFragment]>,
    replacement_paragraphs: Arc<[TextFragment]>,
}

impl RootTextReplace {
    /// Creates a closed, snapshot-guarded root-text replacement.
    ///
    /// This constructor validates guard cardinality, both UTF-16 boundaries,
    /// every canonical seam in the derived result, and all child coordinates
    /// needed by application, relocation, and the same-type inverse.
    /// Schema-dependent resource validation occurs during capture/application.
    ///
    /// # Errors
    ///
    /// Returns [`RootTextReplaceError`] when the supplied fragments cannot
    /// represent the range, its result, or its inverse exactly.
    pub fn try_new(
        range: RootTextRange,
        expected_paragraphs: Vec<TextFragment>,
        replacement_paragraphs: Vec<TextFragment>,
    ) -> Result<Self, RootTextReplaceError> {
        validate_shape(&range, &expected_paragraphs, &replacement_paragraphs)?;
        let derived = derive_replacement(&range, &expected_paragraphs, &replacement_paragraphs)?;
        // Prove that the published result is itself a valid complete guard for
        // the exact same-type inverse, including every restored seam.
        derive_replacement(&derived.inverse_range, &derived.result, &derived.removed)?;
        Ok(Self {
            range,
            expected_paragraphs: Arc::from(expected_paragraphs),
            replacement_paragraphs: Arc::from(replacement_paragraphs),
        })
    }

    /// Captures every complete expected paragraph from one valid document.
    ///
    /// # Errors
    ///
    /// Returns [`RootTextReplaceApplyError`] when the replacement envelope,
    /// target range, schema, or closed-construction contract is invalid.
    /// Authoritative validation of the complete candidate document occurs
    /// during application.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        range: RootTextRange,
        replacement_paragraphs: Vec<TextFragment>,
    ) -> Result<Self, RootTextReplaceApplyError> {
        ensure_base_document(context, document).map_err(map_resolve_error)?;
        validate_replacement_shape(&range, &replacement_paragraphs)?;
        validate_fragments(context, RootTextFragmentRole::Replacement, &replacement_paragraphs)?;
        let expected_paragraphs = capture_expected(context, document, &range)?;
        Self::try_new(range, expected_paragraphs, replacement_paragraphs).map_err(Into::into)
    }

    /// Returns the source range.
    #[must_use]
    pub const fn range(&self) -> &RootTextRange {
        &self.range
    }

    /// Returns the complete source-paragraph guards in source order.
    #[must_use]
    pub fn expected_paragraphs(&self) -> &[TextFragment] {
        &self.expected_paragraphs
    }

    /// Returns the non-empty replacement paragraph fragments.
    #[must_use]
    pub fn replacement_paragraphs(&self) -> &[TextFragment] {
        &self.replacement_paragraphs
    }

    pub(crate) fn derived_result(&self) -> Result<Vec<TextFragment>, RootTextReplaceError> {
        derive_replacement(&self.range, &self.expected_paragraphs, &self.replacement_paragraphs)
            .map(|derived| derived.result)
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, RootTextReplaceApplyError> {
        ensure_base_document(context, document).map_err(map_resolve_error)?;
        validate_fragments(context, RootTextFragmentRole::Expected, &self.expected_paragraphs)?;
        validate_fragments(
            context,
            RootTextFragmentRole::Replacement,
            &self.replacement_paragraphs,
        )?;

        let source_template =
            guard_expected(context, document, &self.range, &self.expected_paragraphs)?;
        let derived = derive_replacement(
            &self.range,
            &self.expected_paragraphs,
            &self.replacement_paragraphs,
        )?;
        if derived.result.as_slice() == self.expected_paragraphs.as_ref() {
            return Ok(AppliedOperation::Unchanged);
        }

        let inverse = Self::try_new(derived.inverse_range, derived.result.clone(), derived.removed)
            .map_err(RootTextReplaceApplyError::Inverse)?;
        let mut result_nodes = Vec::with_capacity(derived.result.len());
        for fragment in &derived.result {
            result_nodes.push(paragraph_from_fragment(source_template, fragment).map_err(
                |_| RootTextReplaceApplyError::TreeInvariant {
                    rule: ParagraphStructureInvariantRule::ParagraphRebuild,
                },
            )?);
        }

        let old_start = self.range.start().paragraph_index();
        let old_end = self
            .range
            .end()
            .paragraph_index()
            .checked_add(1)
            .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?;
        let replacement_count = u32::try_from(self.replacement_paragraphs.len())
            .map_err(|_| RootTextReplaceApplyError::CoordinateOverflow)?;
        let new_end = old_start
            .checked_add(replacement_count)
            .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?;
        let old_range_start = usize::try_from(old_start)
            .map_err(|_| RootTextReplaceApplyError::CoordinateOverflow)?;
        let old_range_end =
            usize::try_from(old_end).map_err(|_| RootTextReplaceApplyError::CoordinateOverflow)?;
        let result = document
            .try_replace_base_paragraph_range(
                context.schema(),
                context.limits(),
                old_range_start..old_range_end,
                result_nodes,
            )
            .map_err(map_publication_error)?;

        let first_replacement_length = self
            .replacement_paragraphs
            .first()
            .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?
            .utf16_len();
        let last_replacement_length = self
            .replacement_paragraphs
            .last()
            .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?
            .utf16_len();
        let relocation = RootTextReplaceMap::new(
            self.range.clone(),
            replacement_count,
            first_replacement_length,
            last_replacement_length,
        );
        let change = ChildrenChange::new(
            NodePath::root(),
            ChildRange::new(old_start, old_end),
            ChildRange::new(old_start, new_end),
        );
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document: result,
            inverse: Operation::RootTextReplace(inverse),
            relocation: relocation.into(),
            change: change.into(),
        })))
    }
}

fn validate_shape(
    range: &RootTextRange,
    expected: &[TextFragment],
    replacement: &[TextFragment],
) -> Result<(), RootTextReplaceError> {
    let expected_count = usize::try_from(range.paragraph_count())
        .map_err(|_| RootTextReplaceError::CoordinateOverflow)?;
    if expected.len() != expected_count {
        return Err(RootTextReplaceError::ExpectedParagraphCount {
            range_count: range.paragraph_count(),
            actual: expected.len(),
        });
    }
    validate_replacement_shape(range, replacement)
}

fn validate_replacement_shape(
    range: &RootTextRange,
    replacement: &[TextFragment],
) -> Result<(), RootTextReplaceError> {
    if replacement.is_empty() {
        return Err(RootTextReplaceError::EmptyReplacement);
    }
    let replacement_count = u32::try_from(replacement.len()).map_err(|_| {
        RootTextReplaceError::ReplacementParagraphCountOverflow { actual: replacement.len() }
    })?;
    range.start().paragraph_index().checked_add(replacement_count).ok_or(
        RootTextReplaceError::ResultParagraphRangeOverflow {
            start: range.start().paragraph_index(),
            replacement_count,
        },
    )?;
    Ok(())
}

fn derive_replacement(
    range: &RootTextRange,
    expected: &[TextFragment],
    replacement: &[TextFragment],
) -> Result<DerivedReplacement, RootTextReplaceError> {
    validate_shape(range, expected, replacement)?;

    let (prefix, suffix, removed) = if expected.len() == 1 {
        let (prefix, tail) = expected[0].split_at(range.start().offset()).map_err(|source| {
            RootTextReplaceError::BoundarySplit { boundary: RootTextRangeBoundary::Start, source }
        })?;
        let selected_length = range
            .end()
            .offset()
            .get()
            .checked_sub(range.start().offset().get())
            .ok_or(RootTextReplaceError::CoordinateOverflow)?;
        let selected_length = TextOffset::try_new(selected_length)?;
        let (selected, suffix) = tail.split_at(selected_length).map_err(|source| {
            RootTextReplaceError::BoundarySplit { boundary: RootTextRangeBoundary::End, source }
        })?;
        (prefix, suffix, vec![selected])
    } else {
        let (prefix, first_removed) =
            expected[0].split_at(range.start().offset()).map_err(|source| {
                RootTextReplaceError::BoundarySplit {
                    boundary: RootTextRangeBoundary::Start,
                    source,
                }
            })?;
        let last_index =
            expected.len().checked_sub(1).ok_or(RootTextReplaceError::CoordinateOverflow)?;
        let (last_removed, suffix) =
            expected[last_index].split_at(range.end().offset()).map_err(|source| {
                RootTextReplaceError::BoundarySplit { boundary: RootTextRangeBoundary::End, source }
            })?;
        let mut removed = Vec::with_capacity(expected.len());
        removed.push(first_removed);
        removed.extend(expected[1..last_index].iter().cloned());
        removed.push(last_removed);
        (prefix, suffix, removed)
    };

    let mut result = Vec::with_capacity(replacement.len());
    if replacement.len() == 1 {
        let with_prefix = concat_result(&prefix, &replacement[0], 0)?;
        result.push(concat_result(&with_prefix, &suffix, 0)?);
    } else {
        let last_index =
            replacement.len().checked_sub(1).ok_or(RootTextReplaceError::CoordinateOverflow)?;
        result.push(concat_result(&prefix, &replacement[0], 0)?);
        result.extend(replacement[1..last_index].iter().cloned());
        result.push(concat_result(&replacement[last_index], &suffix, last_index)?);
    }

    let replacement_count = u32::try_from(replacement.len()).map_err(|_| {
        RootTextReplaceError::ReplacementParagraphCountOverflow { actual: replacement.len() }
    })?;
    let inverse_end_index = range
        .start()
        .paragraph_index()
        .checked_add(
            replacement_count.checked_sub(1).ok_or(RootTextReplaceError::EmptyReplacement)?,
        )
        .ok_or(RootTextReplaceError::ResultParagraphRangeOverflow {
            start: range.start().paragraph_index(),
            replacement_count,
        })?;
    let inverse_end_offset = if replacement.len() == 1 {
        range.start().offset().checked_add(replacement[0].utf16_len().get())?
    } else {
        replacement.last().ok_or(RootTextReplaceError::EmptyReplacement)?.utf16_len()
    };
    let inverse_end_path = NodePath::try_from_indices(vec![inverse_end_index])
        .map_err(|_| RootTextReplaceError::CoordinateOverflow)?;
    let inverse_end = RootTextBoundary::try_new(inverse_end_path, inverse_end_offset)?;
    let inverse_range = RootTextRange::try_new(range.start().clone(), inverse_end)?;

    Ok(DerivedReplacement { result, removed, inverse_range })
}

fn concat_result(
    left: &TextFragment,
    right: &TextFragment,
    paragraph_index: usize,
) -> Result<TextFragment, RootTextReplaceError> {
    left.try_concat(right)
        .map_err(|source| RootTextReplaceError::ResultFragment { paragraph_index, source })
}

fn capture_expected(
    context: &EditorContext,
    document: &Document,
    range: &RootTextRange,
) -> Result<Vec<TextFragment>, RootTextReplaceApplyError> {
    validate_capture_span(context, document, range)?;
    let count = usize::try_from(range.paragraph_count())
        .map_err(|_| RootTextReplaceApplyError::CoordinateOverflow)?;
    let mut expected = Vec::with_capacity(count);
    for paragraph_offset in 0..count {
        let path = paragraph_path_at(range, paragraph_offset)?;
        let paragraph =
            resolve_base_paragraph(context, document, &path).map_err(map_resolve_error)?;
        expected.push(
            fragment_from_paragraph(paragraph).map_err(|error| map_content_error(error, &path))?,
        );
    }
    Ok(expected)
}

fn validate_capture_span(
    context: &EditorContext,
    document: &Document,
    range: &RootTextRange,
) -> Result<(), RootTextReplaceApplyError> {
    resolve_base_paragraph(context, document, range.start().paragraph_path())
        .map_err(map_resolve_error)?;
    if range.start().paragraph_index() != range.end().paragraph_index() {
        resolve_base_paragraph(context, document, range.end().paragraph_path())
            .map_err(map_resolve_error)?;
    }
    Ok(())
}

fn guard_expected<'a>(
    context: &EditorContext,
    document: &'a Document,
    range: &RootTextRange,
    expected: &[TextFragment],
) -> Result<&'a ElementNode, RootTextReplaceApplyError> {
    let mut first = None;
    for (paragraph_offset, expected_fragment) in expected.iter().enumerate() {
        let path = paragraph_path_at(range, paragraph_offset)?;
        let paragraph =
            resolve_base_paragraph(context, document, &path).map_err(map_resolve_error)?;
        let actual =
            fragment_from_paragraph(paragraph).map_err(|error| map_content_error(error, &path))?;
        if actual != *expected_fragment {
            return Err(RootTextReplaceApplyError::ExpectedMismatch {
                paragraph_offset,
                path,
                expected: expected_fragment.clone(),
                actual,
            });
        }
        if first.is_none() {
            first = Some(paragraph);
        }
    }
    first.ok_or(RootTextReplaceApplyError::CoordinateOverflow)
}

fn paragraph_path_at(
    range: &RootTextRange,
    paragraph_offset: usize,
) -> Result<NodePath, RootTextReplaceApplyError> {
    let paragraph_offset = u32::try_from(paragraph_offset)
        .map_err(|_| RootTextReplaceApplyError::CoordinateOverflow)?;
    let index = range
        .start()
        .paragraph_index()
        .checked_add(paragraph_offset)
        .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?;
    NodePath::try_from_indices(vec![index])
        .map_err(|_| RootTextReplaceApplyError::CoordinateOverflow)
}

fn validate_fragments(
    context: &EditorContext,
    role: RootTextFragmentRole,
    fragments: &[TextFragment],
) -> Result<(), RootTextReplaceApplyError> {
    if fragments.len() > context.limits().max_children_per_element() {
        return Err(RootTextReplaceApplyError::ParagraphCountLimit {
            role,
            actual: fragments.len(),
            maximum: context.limits().max_children_per_element(),
        });
    }
    let mut total_text_bytes = 0_usize;
    for fragment in fragments {
        total_text_bytes = total_text_bytes
            .checked_add(fragment.text_bytes())
            .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?;
    }
    if total_text_bytes > context.limits().max_total_text_bytes() {
        return Err(RootTextReplaceApplyError::TotalTextBytesLimit {
            role,
            actual: total_text_bytes,
            maximum: context.limits().max_total_text_bytes(),
        });
    }

    let mut property_value_count = 0_u64;
    let mut property_string_bytes = 0_u64;
    for (paragraph_index, fragment) in fragments.iter().enumerate() {
        if fragment.len() > context.limits().max_children_per_element() {
            return Err(RootTextReplaceApplyError::FragmentRunCountLimit {
                role,
                paragraph_index,
                actual: fragment.len(),
                maximum: context.limits().max_children_per_element(),
            });
        }
        for (run_index, run) in fragment.iter().enumerate() {
            if run.text().len() > context.limits().max_text_bytes() {
                return Err(RootTextReplaceApplyError::FragmentTextBytesLimit {
                    role,
                    paragraph_index,
                    run_index,
                    actual: run.text().len(),
                    maximum: context.limits().max_text_bytes(),
                });
            }
            if run.formats().len() > context.limits().max_formats_per_text() {
                return Err(RootTextReplaceApplyError::FragmentFormatCountLimit {
                    role,
                    paragraph_index,
                    run_index,
                    actual: run.formats().len(),
                    maximum: context.limits().max_formats_per_text(),
                });
            }
            for (format_index, format) in run.formats().iter().enumerate() {
                if !context.schema().allows_text_format(format.kind()) {
                    return Err(RootTextReplaceApplyError::FragmentFormatNotAllowed {
                        role,
                        paragraph_index,
                        run_index,
                        format_index,
                        kind: format.kind().clone(),
                    });
                }
                let summary = context
                    .schema()
                    .validate_inline_format_instance(context.limits(), format)
                    .map_err(|source| RootTextReplaceApplyError::InvalidFormatInstance {
                        role,
                        paragraph_index,
                        run_index,
                        format_index,
                        kind: format.kind().clone(),
                        source,
                    })?;
                property_value_count = property_value_count
                    .checked_add(summary.property_value_count())
                    .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?;
                property_string_bytes = property_string_bytes
                    .checked_add(summary.property_string_bytes())
                    .ok_or(RootTextReplaceApplyError::CoordinateOverflow)?;
            }
        }
    }

    let maximum_property_values =
        u64::try_from(context.limits().max_property_values()).unwrap_or(u64::MAX);
    if property_value_count > maximum_property_values {
        return Err(RootTextReplaceApplyError::PropertyValueCountLimit {
            role,
            actual: property_value_count,
            maximum: maximum_property_values,
        });
    }
    let maximum_property_string_bytes =
        u64::try_from(context.limits().max_total_property_string_bytes()).unwrap_or(u64::MAX);
    if property_string_bytes > maximum_property_string_bytes {
        return Err(RootTextReplaceApplyError::PropertyStringBytesLimit {
            role,
            actual: property_string_bytes,
            maximum: maximum_property_string_bytes,
        });
    }
    Ok(())
}

fn map_resolve_error(error: ResolveParagraphError) -> RootTextReplaceApplyError {
    match error {
        ResolveParagraphError::SchemaMismatch { document_schema, context_schema } => {
            RootTextReplaceApplyError::SchemaMismatch { document_schema, context_schema }
        }
        ResolveParagraphError::DocumentProofMismatch(error) => {
            RootTextReplaceApplyError::DocumentProofMismatch(error)
        }
        ResolveParagraphError::UnsupportedSchema { schema } => {
            RootTextReplaceApplyError::UnsupportedSchema { schema }
        }
        ResolveParagraphError::NodeLookup(error) => RootTextReplaceApplyError::NodeLookup(error),
        ResolveParagraphError::InvalidTarget { path, rule } => {
            RootTextReplaceApplyError::InvalidTarget { path, rule }
        }
    }
}

fn map_content_error(error: ParagraphContentError, path: &NodePath) -> RootTextReplaceApplyError {
    match error {
        ParagraphContentError::NonTextChild { child_index } => {
            RootTextReplaceApplyError::InvalidTarget {
                path: path.clone(),
                rule: ParagraphTargetRule::NonTextChild { child_index },
            }
        }
        ParagraphContentError::Fragment(error) => RootTextReplaceApplyError::Fragment(error),
    }
}

fn map_publication_error(error: LocalParagraphStructureError) -> RootTextReplaceApplyError {
    match error {
        LocalParagraphStructureError::SchemaMismatch { document_schema, active_schema } => {
            RootTextReplaceApplyError::SchemaMismatch {
                document_schema,
                context_schema: active_schema,
            }
        }
        LocalParagraphStructureError::DocumentProofMismatch(error) => {
            RootTextReplaceApplyError::DocumentProofMismatch(error)
        }
        LocalParagraphStructureError::UnsupportedSchema { active_schema } => {
            RootTextReplaceApplyError::UnsupportedSchema { schema: active_schema }
        }
        LocalParagraphStructureError::ExpectedRootElement => {
            RootTextReplaceApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ExpectedRootElement,
            }
        }
        LocalParagraphStructureError::ReversedRange { .. } => {
            RootTextReplaceApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ReversedChildRange,
            }
        }
        LocalParagraphStructureError::RangeOutOfBounds { .. } => {
            RootTextReplaceApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ChildRangeOutOfBounds,
            }
        }
        LocalParagraphStructureError::LocalInvariant(_) => {
            RootTextReplaceApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::RootRebuild,
            }
        }
        LocalParagraphStructureError::InvalidResult(report) => {
            RootTextReplaceApplyError::InvalidResult(report)
        }
    }
}

struct DerivedReplacement {
    result: Vec<TextFragment>,
    removed: Vec<TextFragment>,
    inverse_range: RootTextRange,
}

/// Identifies which operation slice failed deterministic fragment validation.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RootTextFragmentRole {
    /// Complete optimistic source-paragraph guards.
    Expected,
    /// Paragraph fragments supplied for insertion.
    Replacement,
}

/// Identifies one spatial boundary in a cross-paragraph range.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RootTextRangeBoundary {
    /// Inclusive start boundary.
    Start,
    /// Exclusive end boundary.
    End,
}

/// Why a [`RootTextReplace`] value is internally inconsistent.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum RootTextReplaceError {
    /// The complete source guard count must equal the inclusive paragraph span.
    #[error(
        "root-text range requires {range_count} expected paragraphs; operation supplied {actual}"
    )]
    ExpectedParagraphCount {
        /// Required guard count.
        range_count: u32,
        /// Supplied guard count.
        actual: usize,
    },
    /// A structural text replacement must always leave at least one paragraph.
    #[error("root-text replacement paragraph list is empty")]
    EmptyReplacement,
    /// The replacement list cannot be addressed by the child-index protocol.
    #[error("root-text replacement has {actual} paragraphs; count does not fit u32")]
    ReplacementParagraphCountOverflow {
        /// Supplied replacement paragraph count.
        actual: usize,
    },
    /// The result's exclusive root-child boundary cannot be represented.
    #[error("root-text result starting at {start} with {replacement_count} paragraphs exceeds u32")]
    ResultParagraphRangeOverflow {
        /// First result paragraph index.
        start: u32,
        /// Number of result paragraphs.
        replacement_count: u32,
    },
    /// One range boundary cannot split its guarded paragraph at a scalar boundary.
    #[error("root-text {boundary:?} boundary is invalid")]
    BoundarySplit {
        /// Failing spatial boundary.
        boundary: RootTextRangeBoundary,
        /// Exact fragment split failure.
        #[source]
        source: TextFragmentSplitError,
    },
    /// A prefix/replacement/suffix seam cannot form a canonical result paragraph.
    #[error("root-text result paragraph {paragraph_index} is not representable")]
    ResultFragment {
        /// Result-relative paragraph index.
        paragraph_index: usize,
        /// Exact canonical-fragment failure.
        #[source]
        source: TextFragmentError,
    },
    /// Constructing a derived direct-root boundary unexpectedly failed.
    #[error(transparent)]
    Boundary(#[from] RootTextBoundaryError),
    /// Constructing the same-type inverse range failed.
    #[error(transparent)]
    Range(#[from] RootTextRangeError),
    /// Aggregate UTF-16 arithmetic exceeded the protocol boundary.
    #[error(transparent)]
    TextOffset(#[from] TextOffsetError),
    /// Checked native or protocol coordinate arithmetic failed.
    #[error("root-text replacement coordinate arithmetic overflowed")]
    CoordinateOverflow,
}

/// Why a [`RootTextReplace`] could not produce one valid atomic result.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum RootTextReplaceApplyError {
    /// The operation value violates its closed construction contract.
    #[error(transparent)]
    Contract(#[from] RootTextReplaceError),
    /// The document was proved by a different schema identity.
    #[error("document schema {document_schema} does not match context schema {context_schema}")]
    SchemaMismatch {
        /// Schema recorded on the document.
        document_schema: SchemaId,
        /// Schema owned by the context.
        context_schema: SchemaId,
    },
    /// The document lacks the exact compiled proof or validation policy owned
    /// by the active editor context.
    #[error(transparent)]
    DocumentProofMismatch(#[from] DocumentProofMismatch),
    /// Structural paragraph metadata is not defined outside sealed base-text profiles.
    #[error("root-text replacement does not support schema {schema}")]
    UnsupportedSchema {
        /// Rejected active schema.
        schema: SchemaId,
    },
    /// One guarded paragraph path did not resolve.
    #[error(transparent)]
    NodeLookup(#[from] NodeLookupError),
    /// One guarded target is not a direct-root base paragraph.
    #[error("root-text replacement target {path:?} violates rule {rule:?}")]
    InvalidTarget {
        /// Rejected paragraph path.
        path: NodePath,
        /// Stable rejection reason.
        rule: ParagraphTargetRule,
    },
    /// A complete paragraph no longer matches its optimistic guard.
    #[error(
        "root-text expected paragraph {paragraph_offset} at {path:?} does not match source content"
    )]
    ExpectedMismatch {
        /// Zero-based position within the guarded source slice.
        paragraph_offset: usize,
        /// Exact source paragraph path.
        path: NodePath,
        /// Operation-supplied complete paragraph.
        expected: TextFragment,
        /// Actual complete source paragraph.
        actual: TextFragment,
    },
    /// One fragment slice alone has more paragraphs than one element permits.
    #[error("{role:?} slice has {actual} paragraphs; the configured maximum is {maximum}")]
    ParagraphCountLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Actual paragraph count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One fragment slice alone exceeds the document-wide text budget.
    #[error("{role:?} slice has {actual} text bytes; the configured maximum is {maximum}")]
    TotalTextBytesLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Actual UTF-8 bytes.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One paragraph fragment contains too many canonical text runs.
    #[error(
        "{role:?} paragraph {paragraph_index} has {actual} runs; the configured maximum is {maximum}"
    )]
    FragmentRunCountLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Slice-relative paragraph index.
        paragraph_index: usize,
        /// Actual run count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One canonical run exceeds the configured per-leaf byte limit.
    #[error(
        "{role:?} paragraph {paragraph_index} run {run_index} has {actual} text bytes; the configured maximum is {maximum}"
    )]
    FragmentTextBytesLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Slice-relative paragraph index.
        paragraph_index: usize,
        /// Failing run index.
        run_index: usize,
        /// Actual UTF-8 bytes.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One canonical run carries too many formats.
    #[error(
        "{role:?} paragraph {paragraph_index} run {run_index} has {actual} formats; the configured maximum is {maximum}"
    )]
    FragmentFormatCountLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Slice-relative paragraph index.
        paragraph_index: usize,
        /// Failing run index.
        run_index: usize,
        /// Actual format count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// The active schema does not allow one supplied format kind.
    #[error(
        "{role:?} paragraph {paragraph_index} run {run_index} format {format_index} `{kind}` is not allowed"
    )]
    FragmentFormatNotAllowed {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Slice-relative paragraph index.
        paragraph_index: usize,
        /// Failing run index.
        run_index: usize,
        /// Failing format index.
        format_index: usize,
        /// Rejected format kind.
        kind: QualifiedName,
    },
    /// The base contract does not allow properties on one supplied format.
    #[error(
        "{role:?} paragraph {paragraph_index} run {run_index} format {format_index} `{kind}` does not allow properties"
    )]
    FragmentFormatPropertiesNotAllowed {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Slice-relative paragraph index.
        paragraph_index: usize,
        /// Failing run index.
        run_index: usize,
        /// Failing format index.
        format_index: usize,
        /// Rejected format kind.
        kind: QualifiedName,
    },
    /// One format instance violates its compiled typed-property contract.
    #[error(
        "{role:?} paragraph {paragraph_index} run {run_index} format {format_index} `{kind}` is invalid: {source}"
    )]
    InvalidFormatInstance {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Slice-relative paragraph index.
        paragraph_index: usize,
        /// Failing run index.
        run_index: usize,
        /// Failing format index.
        format_index: usize,
        /// Rejected format kind.
        kind: QualifiedName,
        /// Structured property-contract or resource failure.
        #[source]
        source: ValidationReport,
    },
    /// One fragment slice exceeds the document-wide property-value ceiling.
    #[error("{role:?} slice has {actual} property values; the configured maximum is {maximum}")]
    PropertyValueCountLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Exact aggregate property-value count.
        actual: u64,
        /// Configured document-wide maximum.
        maximum: u64,
    },
    /// One fragment slice exceeds the document-wide property-string byte ceiling.
    #[error(
        "{role:?} slice has {actual} property-string bytes; the configured maximum is {maximum}"
    )]
    PropertyStringBytesLimit {
        /// Failing operation slice.
        role: RootTextFragmentRole,
        /// Exact aggregate UTF-8 property-string bytes.
        actual: u64,
        /// Configured document-wide maximum.
        maximum: u64,
    },
    /// Reading one canonical guarded paragraph failed.
    #[error(transparent)]
    Fragment(#[from] TextFragmentError),
    /// Constructing the exact same-type inverse unexpectedly failed.
    #[error("root-text inverse construction failed: {0}")]
    Inverse(RootTextReplaceError),
    /// Checked host or protocol coordinate arithmetic failed.
    #[error("root-text replacement coordinate arithmetic overflowed")]
    CoordinateOverflow,
    /// Persistent rebuilding encountered an impossible internal invariant.
    #[error("root-text replacement tree rebuilding violated invariant {rule:?}")]
    TreeInvariant {
        /// Stable invariant category.
        rule: ParagraphStructureInvariantRule,
    },
    /// The authoritative validator rejected the complete candidate document.
    #[error(transparent)]
    InvalidResult(#[from] ValidationReport),
}
