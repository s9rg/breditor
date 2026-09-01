use thiserror::Error;

use crate::{
    document::{
        Document, LocalParagraphStructureError, NodeLookupError, TextFragment, TextFragmentError,
        TextFragmentSplitError,
    },
    operation::{
        AppliedChange, AppliedOperation, ChildRange, ChildrenChange, Operation, ParagraphJoin,
        ParagraphJoinError, ParagraphSplitMap, ParagraphTargetRule,
    },
    position::{NodePath, TextOffset},
    schema::{SchemaId, ValidationReport},
    state::EditorContext,
};

use super::paragraph_support::{
    ParagraphContentError, ParagraphStructureInvariantRule, ResolveParagraphError,
    fragment_from_paragraph, paragraph_from_fragment, resolve_base_paragraph,
};

/// Splits one direct-root base paragraph at a UTF-16 scalar boundary.
///
/// The complete expected paragraph is an optimistic source guard. Carrying the
/// guard makes replay deterministic and lets the inverse join be a closed
/// operation value rather than an implicit callback.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParagraphSplit {
    paragraph_path: NodePath,
    offset: TextOffset,
    expected: TextFragment,
}

impl ParagraphSplit {
    /// Creates a checked split operation from an exact expected paragraph.
    ///
    /// # Errors
    ///
    /// Returns [`ParagraphSplitError`] unless the path has direct-root-child
    /// shape and the offset is a scalar boundary in `expected`. Document target
    /// resolution occurs during capture or application.
    pub fn try_new(
        paragraph_path: NodePath,
        offset: TextOffset,
        expected: TextFragment,
    ) -> Result<Self, ParagraphSplitError> {
        if paragraph_path.len() != 1 {
            return Err(ParagraphSplitError::TargetPathDepth { actual: paragraph_path.len() });
        }
        expected.split_at(offset)?;
        Ok(Self { paragraph_path, offset, expected })
    }

    /// Captures the complete expected paragraph from a validated document.
    ///
    /// # Errors
    ///
    /// Returns [`ParagraphSplitApplyError`] when the target, offset, schema, or
    /// aggregate fragment violates the first structural contract.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        paragraph_path: NodePath,
        offset: TextOffset,
    ) -> Result<Self, ParagraphSplitApplyError> {
        let paragraph = resolve_base_paragraph(context, document, &paragraph_path)
            .map_err(map_resolve_error)?;
        let expected = fragment_from_paragraph(paragraph)
            .map_err(|error| map_content_error(error, &paragraph_path))?;
        Self::try_new(paragraph_path, offset, expected).map_err(Into::into)
    }

    /// Returns the direct-root paragraph path in source coordinates.
    #[must_use]
    pub const fn paragraph_path(&self) -> &NodePath {
        &self.paragraph_path
    }

    /// Returns the aggregate UTF-16 split boundary.
    #[must_use]
    pub const fn offset(&self) -> TextOffset {
        self.offset
    }

    /// Returns the exact complete source paragraph guard.
    #[must_use]
    pub const fn expected(&self) -> &TextFragment {
        &self.expected
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, ParagraphSplitApplyError> {
        let paragraph = resolve_base_paragraph(context, document, &self.paragraph_path)
            .map_err(map_resolve_error)?;
        let actual = fragment_from_paragraph(paragraph)
            .map_err(|error| map_content_error(error, &self.paragraph_path))?;
        if actual != self.expected {
            return Err(ParagraphSplitApplyError::ExpectedMismatch {
                expected: self.expected.clone(),
                actual,
            });
        }

        let (left, right) = self.expected.split_at(self.offset)?;
        let left_node = paragraph_from_fragment(paragraph, &left).map_err(|_| {
            ParagraphSplitApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ParagraphRebuild,
            }
        })?;
        let right_node = paragraph_from_fragment(paragraph, &right).map_err(|_| {
            ParagraphSplitApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ParagraphRebuild,
            }
        })?;
        let paragraph_index = usize::try_from(
            self.paragraph_path.last_index().ok_or(ParagraphSplitApplyError::CoordinateOverflow)?,
        )
        .map_err(|_| ParagraphSplitApplyError::CoordinateOverflow)?;
        let range_end =
            paragraph_index.checked_add(1).ok_or(ParagraphSplitApplyError::CoordinateOverflow)?;
        let result = document
            .try_replace_base_paragraph_range(
                context.schema(),
                context.limits(),
                paragraph_index..range_end,
                vec![left_node, right_node],
            )
            .map_err(map_publication_error)?;

        let inverse =
            ParagraphJoin::try_new(self.paragraph_path.clone(), left.clone(), right.clone())?;
        let old_start = u32::try_from(paragraph_index)
            .map_err(|_| ParagraphSplitApplyError::CoordinateOverflow)?;
        let old_end =
            old_start.checked_add(1).ok_or(ParagraphSplitApplyError::CoordinateOverflow)?;
        let new_end =
            old_start.checked_add(2).ok_or(ParagraphSplitApplyError::CoordinateOverflow)?;
        let change = ChildrenChange::new(
            NodePath::root(),
            ChildRange::new(old_start, old_end),
            ChildRange::new(old_start, new_end),
        );
        let relocation = ParagraphSplitMap::new(self.paragraph_path.clone(), self.offset);
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document: result,
            inverse: Operation::ParagraphJoin(inverse),
            relocation: relocation.into(),
            change: change.into(),
        })))
    }
}

fn map_resolve_error(error: ResolveParagraphError) -> ParagraphSplitApplyError {
    match error {
        ResolveParagraphError::SchemaMismatch { document_schema, context_schema } => {
            ParagraphSplitApplyError::SchemaMismatch { document_schema, context_schema }
        }
        ResolveParagraphError::UnsupportedSchema { schema } => {
            ParagraphSplitApplyError::UnsupportedSchema { schema }
        }
        ResolveParagraphError::NodeLookup(error) => ParagraphSplitApplyError::NodeLookup(error),
        ResolveParagraphError::InvalidTarget { path, rule } => {
            ParagraphSplitApplyError::InvalidTarget { path, rule }
        }
    }
}

fn map_content_error(error: ParagraphContentError, path: &NodePath) -> ParagraphSplitApplyError {
    match error {
        ParagraphContentError::NonTextChild { child_index } => {
            ParagraphSplitApplyError::InvalidTarget {
                path: path.clone(),
                rule: ParagraphTargetRule::NonTextChild { child_index },
            }
        }
        ParagraphContentError::Fragment(error) => ParagraphSplitApplyError::Fragment(error),
    }
}

fn map_publication_error(error: LocalParagraphStructureError) -> ParagraphSplitApplyError {
    match error {
        LocalParagraphStructureError::SchemaMismatch { document_schema, active_schema } => {
            ParagraphSplitApplyError::SchemaMismatch {
                document_schema,
                context_schema: active_schema,
            }
        }
        LocalParagraphStructureError::UnsupportedSchema { active_schema } => {
            ParagraphSplitApplyError::UnsupportedSchema { schema: active_schema }
        }
        LocalParagraphStructureError::ExpectedRootElement => {
            ParagraphSplitApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ExpectedRootElement,
            }
        }
        LocalParagraphStructureError::ReversedRange { .. } => {
            ParagraphSplitApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ReversedChildRange,
            }
        }
        LocalParagraphStructureError::RangeOutOfBounds { .. } => {
            ParagraphSplitApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ChildRangeOutOfBounds,
            }
        }
        LocalParagraphStructureError::LocalInvariant(_) => {
            ParagraphSplitApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::RootRebuild,
            }
        }
        LocalParagraphStructureError::InvalidResult(report) => {
            ParagraphSplitApplyError::InvalidResult(report)
        }
    }
}

/// Why a [`ParagraphSplit`] value is internally inconsistent.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ParagraphSplitError {
    /// A base paragraph operation must carry exactly one child index.
    #[error("paragraph-split target path has depth {actual}; expected depth 1")]
    TargetPathDepth {
        /// Actual path depth.
        actual: usize,
    },
    /// The expected fragment cannot be split at the requested offset.
    #[error(transparent)]
    FragmentSplit(#[from] TextFragmentSplitError),
}

/// Why a paragraph split could not produce one valid atomic result.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ParagraphSplitApplyError {
    /// The operation value violates its closed construction contract.
    #[error(transparent)]
    Contract(#[from] ParagraphSplitError),
    /// The document was proved by a different schema identity.
    #[error("document schema {document_schema} does not match context schema {context_schema}")]
    SchemaMismatch {
        /// Schema recorded on the document.
        document_schema: SchemaId,
        /// Schema owned by the context.
        context_schema: SchemaId,
    },
    /// Structural metadata semantics are not defined outside the exact base schema.
    #[error("paragraph split does not support schema {schema}")]
    UnsupportedSchema {
        /// Rejected active schema.
        schema: SchemaId,
    },
    /// The paragraph path did not resolve.
    #[error(transparent)]
    NodeLookup(#[from] NodeLookupError),
    /// The target is not a direct-root base paragraph.
    #[error("paragraph-split target {path:?} violates rule {rule:?}")]
    InvalidTarget {
        /// Rejected target path.
        path: NodePath,
        /// Stable rejection reason.
        rule: ParagraphTargetRule,
    },
    /// The complete paragraph no longer matches the optimistic guard.
    #[error("paragraph-split expected fragment does not match source content")]
    ExpectedMismatch {
        /// Operation-supplied source guard.
        expected: TextFragment,
        /// Actual source paragraph.
        actual: TextFragment,
    },
    /// Reading or rebuilding one canonical paragraph fragment failed.
    #[error(transparent)]
    Fragment(#[from] TextFragmentError),
    /// Splitting the guarded fragment failed.
    #[error(transparent)]
    FragmentSplit(#[from] TextFragmentSplitError),
    /// Constructing the exact inverse join failed.
    #[error(transparent)]
    Inverse(#[from] ParagraphJoinError),
    /// Checked host or protocol index arithmetic failed.
    #[error("paragraph-split coordinate arithmetic overflowed")]
    CoordinateOverflow,
    /// Persistent rebuilding encountered an impossible internal invariant.
    #[error("paragraph-split tree rebuilding violated invariant {rule:?}")]
    TreeInvariant {
        /// Stable invariant category.
        rule: ParagraphStructureInvariantRule,
    },
    /// The authoritative validator rejected the complete candidate.
    #[error(transparent)]
    InvalidResult(#[from] ValidationReport),
}
