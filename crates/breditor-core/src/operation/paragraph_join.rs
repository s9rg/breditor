use thiserror::Error;

use crate::{
    document::{
        Document, LocalParagraphStructureError, NodeLookupError, TextFragment, TextFragmentError,
    },
    operation::{
        AppliedChange, AppliedOperation, ChildRange, ChildrenChange, Operation, ParagraphJoinMap,
        ParagraphSplit, ParagraphSplitError, ParagraphStructureInvariantRule, ParagraphTargetRule,
    },
    position::NodePath,
    schema::{SchemaId, ValidationReport},
    state::EditorContext,
};

use super::paragraph_support::{
    ParagraphContentError, ResolveParagraphError, fragment_from_paragraph, paragraph_from_fragment,
    resolve_base_paragraph,
};

/// Joins two adjacent direct-root base paragraphs.
///
/// The right paragraph is the immediate sibling after `left_path`. Complete
/// left/right fragments guard the source and make a split at the original left
/// length an exact inverse, including when an equal-format seam is merged.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParagraphJoin {
    left_path: NodePath,
    expected_left: TextFragment,
    expected_right: TextFragment,
}

impl ParagraphJoin {
    /// Creates a checked join operation from exact adjacent-paragraph guards.
    ///
    /// # Errors
    ///
    /// Returns [`ParagraphJoinError`] when the left path lacks direct-root-child
    /// shape, its right sibling index overflows, or the fragments cannot form a
    /// representable canonical joined fragment. Document target resolution
    /// occurs during capture or application.
    pub fn try_new(
        left_path: NodePath,
        expected_left: TextFragment,
        expected_right: TextFragment,
    ) -> Result<Self, ParagraphJoinError> {
        if left_path.len() != 1 {
            return Err(ParagraphJoinError::TargetPathDepth { actual: left_path.len() });
        }
        right_sibling_path(&left_path)?;
        expected_left.try_concat(&expected_right)?;
        Ok(Self { left_path, expected_left, expected_right })
    }

    /// Captures both exact adjacent paragraph guards from a validated document.
    ///
    /// # Errors
    ///
    /// Returns [`ParagraphJoinApplyError`] when either target, the schema, or
    /// the canonical joined fragment violates the structural contract.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        left_path: NodePath,
    ) -> Result<Self, ParagraphJoinApplyError> {
        let left =
            resolve_base_paragraph(context, document, &left_path).map_err(map_resolve_error)?;
        let right_path = right_sibling_path(&left_path)?;
        ensure_right_sibling(document, &left_path, &right_path)?;
        let right =
            resolve_base_paragraph(context, document, &right_path).map_err(map_resolve_error)?;
        let expected_left =
            fragment_from_paragraph(left).map_err(|error| map_content_error(error, &left_path))?;
        let expected_right = fragment_from_paragraph(right)
            .map_err(|error| map_content_error(error, &right_path))?;
        Self::try_new(left_path, expected_left, expected_right).map_err(Into::into)
    }

    /// Returns the left paragraph path in source coordinates.
    #[must_use]
    pub const fn left_path(&self) -> &NodePath {
        &self.left_path
    }

    /// Returns the exact complete left-paragraph guard.
    #[must_use]
    pub const fn expected_left(&self) -> &TextFragment {
        &self.expected_left
    }

    /// Returns the exact complete right-paragraph guard.
    #[must_use]
    pub const fn expected_right(&self) -> &TextFragment {
        &self.expected_right
    }

    pub(crate) fn derived_result(&self) -> Result<TextFragment, ParagraphJoinError> {
        self.expected_left.try_concat(&self.expected_right).map_err(Into::into)
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, ParagraphJoinApplyError> {
        let left = resolve_base_paragraph(context, document, &self.left_path)
            .map_err(map_resolve_error)?;
        let right_path = right_sibling_path(&self.left_path)?;
        ensure_right_sibling(document, &self.left_path, &right_path)?;
        let right =
            resolve_base_paragraph(context, document, &right_path).map_err(map_resolve_error)?;
        let actual_left = fragment_from_paragraph(left)
            .map_err(|error| map_content_error(error, &self.left_path))?;
        if actual_left != self.expected_left {
            return Err(ParagraphJoinApplyError::ExpectedMismatch {
                side: ParagraphJoinSide::Left,
                expected: self.expected_left.clone(),
                actual: actual_left,
            });
        }
        let actual_right = fragment_from_paragraph(right)
            .map_err(|error| map_content_error(error, &right_path))?;
        if actual_right != self.expected_right {
            return Err(ParagraphJoinApplyError::ExpectedMismatch {
                side: ParagraphJoinSide::Right,
                expected: self.expected_right.clone(),
                actual: actual_right,
            });
        }

        let joined = self.derived_result()?;
        let joined_node = paragraph_from_fragment(left, &joined).map_err(|_| {
            ParagraphJoinApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ParagraphRebuild,
            }
        })?;
        let paragraph_index = usize::try_from(
            self.left_path.last_index().ok_or(ParagraphJoinApplyError::CoordinateOverflow)?,
        )
        .map_err(|_| ParagraphJoinApplyError::CoordinateOverflow)?;
        let range_end =
            paragraph_index.checked_add(2).ok_or(ParagraphJoinApplyError::CoordinateOverflow)?;
        let result = document
            .try_replace_base_paragraph_range(
                context.schema(),
                context.limits(),
                paragraph_index..range_end,
                vec![joined_node],
            )
            .map_err(map_publication_error)?;

        let inverse = ParagraphSplit::try_new(
            self.left_path.clone(),
            self.expected_left.utf16_len(),
            joined,
        )?;
        let old_start = u32::try_from(paragraph_index)
            .map_err(|_| ParagraphJoinApplyError::CoordinateOverflow)?;
        let old_end =
            old_start.checked_add(2).ok_or(ParagraphJoinApplyError::CoordinateOverflow)?;
        let new_end =
            old_start.checked_add(1).ok_or(ParagraphJoinApplyError::CoordinateOverflow)?;
        let change = ChildrenChange::new(
            NodePath::root(),
            ChildRange::new(old_start, old_end),
            ChildRange::new(old_start, new_end),
        );
        let relocation =
            ParagraphJoinMap::new(self.left_path.clone(), self.expected_left.utf16_len());
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document: result,
            inverse: Operation::ParagraphSplit(inverse),
            relocation: relocation.into(),
            change: change.into(),
        })))
    }
}

fn right_sibling_path(left_path: &NodePath) -> Result<NodePath, ParagraphJoinError> {
    let left_index = left_path
        .last_index()
        .ok_or(ParagraphJoinError::TargetPathDepth { actual: left_path.len() })?;
    let right_index = left_index.checked_add(1).ok_or(ParagraphJoinError::RightIndexOverflow)?;
    NodePath::try_from_indices(vec![right_index])
        .map_err(|_| ParagraphJoinError::RightIndexOverflow)
}

fn ensure_right_sibling(
    document: &Document,
    left_path: &NodePath,
    right_path: &NodePath,
) -> Result<(), ParagraphJoinApplyError> {
    let right_index = usize::try_from(
        right_path.last_index().ok_or(ParagraphJoinApplyError::CoordinateOverflow)?,
    )
    .map_err(|_| ParagraphJoinApplyError::CoordinateOverflow)?;
    let root = document.root().as_element().ok_or(ParagraphJoinApplyError::TreeInvariant {
        rule: ParagraphStructureInvariantRule::ExpectedRootElement,
    })?;
    if right_index >= root.children().len() {
        return Err(ParagraphJoinApplyError::MissingRightSibling { left_path: left_path.clone() });
    }
    Ok(())
}

fn map_resolve_error(error: ResolveParagraphError) -> ParagraphJoinApplyError {
    match error {
        ResolveParagraphError::SchemaMismatch { document_schema, context_schema } => {
            ParagraphJoinApplyError::SchemaMismatch { document_schema, context_schema }
        }
        ResolveParagraphError::UnsupportedSchema { schema } => {
            ParagraphJoinApplyError::UnsupportedSchema { schema }
        }
        ResolveParagraphError::NodeLookup(error) => ParagraphJoinApplyError::NodeLookup(error),
        ResolveParagraphError::InvalidTarget { path, rule } => {
            ParagraphJoinApplyError::InvalidTarget { path, rule }
        }
    }
}

fn map_content_error(error: ParagraphContentError, path: &NodePath) -> ParagraphJoinApplyError {
    match error {
        ParagraphContentError::NonTextChild { child_index } => {
            ParagraphJoinApplyError::InvalidTarget {
                path: path.clone(),
                rule: ParagraphTargetRule::NonTextChild { child_index },
            }
        }
        ParagraphContentError::Fragment(error) => ParagraphJoinApplyError::Fragment(error),
    }
}

fn map_publication_error(error: LocalParagraphStructureError) -> ParagraphJoinApplyError {
    match error {
        LocalParagraphStructureError::SchemaMismatch { document_schema, active_schema } => {
            ParagraphJoinApplyError::SchemaMismatch {
                document_schema,
                context_schema: active_schema,
            }
        }
        LocalParagraphStructureError::UnsupportedSchema { active_schema } => {
            ParagraphJoinApplyError::UnsupportedSchema { schema: active_schema }
        }
        LocalParagraphStructureError::ExpectedRootElement => {
            ParagraphJoinApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ExpectedRootElement,
            }
        }
        LocalParagraphStructureError::ReversedRange { .. } => {
            ParagraphJoinApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ReversedChildRange,
            }
        }
        LocalParagraphStructureError::RangeOutOfBounds { .. } => {
            ParagraphJoinApplyError::TreeInvariant {
                rule: ParagraphStructureInvariantRule::ChildRangeOutOfBounds,
            }
        }
        LocalParagraphStructureError::LocalInvariant(_) => ParagraphJoinApplyError::TreeInvariant {
            rule: ParagraphStructureInvariantRule::RootRebuild,
        },
        LocalParagraphStructureError::InvalidResult(report) => {
            ParagraphJoinApplyError::InvalidResult(report)
        }
    }
}

/// Identifies which guarded paragraph failed during a join.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ParagraphJoinSide {
    /// The paragraph at [`ParagraphJoin::left_path`].
    Left,
    /// Its immediate right sibling.
    Right,
}

/// Why a [`ParagraphJoin`] value is internally inconsistent.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ParagraphJoinError {
    /// A base paragraph operation must carry exactly one child index.
    #[error("paragraph-join left path has depth {actual}; expected depth 1")]
    TargetPathDepth {
        /// Actual path depth.
        actual: usize,
    },
    /// The immediate right-sibling index cannot be represented.
    #[error("paragraph-join right sibling index overflowed")]
    RightIndexOverflow,
    /// The guarded paragraphs cannot form one canonical fragment.
    #[error(transparent)]
    Fragment(#[from] TextFragmentError),
}

/// Why a paragraph join could not produce one valid atomic result.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ParagraphJoinApplyError {
    /// The operation value violates its closed construction contract.
    #[error(transparent)]
    Contract(#[from] ParagraphJoinError),
    /// The document was proved by a different schema identity.
    #[error("document schema {document_schema} does not match context schema {context_schema}")]
    SchemaMismatch {
        /// Schema recorded on the document.
        document_schema: SchemaId,
        /// Schema owned by the context.
        context_schema: SchemaId,
    },
    /// Structural metadata semantics are not defined outside the exact base schema.
    #[error("paragraph join does not support schema {schema}")]
    UnsupportedSchema {
        /// Rejected active schema.
        schema: SchemaId,
    },
    /// A paragraph path did not resolve.
    #[error(transparent)]
    NodeLookup(#[from] NodeLookupError),
    /// Either target is not a direct-root base paragraph.
    #[error("paragraph-join target {path:?} violates rule {rule:?}")]
    InvalidTarget {
        /// Rejected target path.
        path: NodePath,
        /// Stable rejection reason.
        rule: ParagraphTargetRule,
    },
    /// The left paragraph has no immediate right sibling.
    #[error("paragraph at {left_path:?} has no right sibling to join")]
    MissingRightSibling {
        /// Left paragraph source path.
        left_path: NodePath,
    },
    /// One complete paragraph no longer matches its optimistic guard.
    #[error("paragraph-join {side:?} expected fragment does not match source content")]
    ExpectedMismatch {
        /// Guarded side.
        side: ParagraphJoinSide,
        /// Operation-supplied source guard.
        expected: TextFragment,
        /// Actual source paragraph.
        actual: TextFragment,
    },
    /// Reading or joining canonical paragraph fragments failed.
    #[error(transparent)]
    Fragment(#[from] TextFragmentError),
    /// Constructing the exact inverse split failed.
    #[error(transparent)]
    Inverse(#[from] ParagraphSplitError),
    /// Checked host or protocol index arithmetic failed.
    #[error("paragraph-join coordinate arithmetic overflowed")]
    CoordinateOverflow,
    /// Persistent rebuilding encountered an impossible internal invariant.
    #[error("paragraph-join tree rebuilding violated invariant {rule:?}")]
    TreeInvariant {
        /// Stable invariant category.
        rule: ParagraphStructureInvariantRule,
    },
    /// The authoritative validator rejected the complete candidate.
    #[error(transparent)]
    InvalidResult(#[from] ValidationReport),
}
