use thiserror::Error;

use crate::{
    document::{
        Document, ElementNode, LocalInvariantError, NodeLookupError, NodeRef, TextFragment,
        TextFragmentError, TextRun, Utf16BoundaryError,
    },
    identity::QualifiedName,
    operation::{
        AppliedChange, AppliedOperation, ChildRange, Operation, TextChange, TextRange,
        TextRangeError,
    },
    position::{NodePath, TextOffset, TextOffsetError},
    schema::{SchemaId, ValidationReport},
    state::EditorContext,
};

use super::TextSpliceMap;

/// Replaces one half-open paragraph-local UTF-16 range with formatted text.
///
/// `expected_removed` is a deterministic context guard and also makes the exact
/// inverse closed over the same operation kind.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextSplice {
    range: TextRange,
    expected_removed: TextFragment,
    replacement: TextFragment,
}

impl TextSplice {
    /// Creates a splice from canonical fragments and a checked range.
    ///
    /// # Errors
    ///
    /// Returns [`TextSpliceError`] when the expected source fragment cannot
    /// exactly occupy the replaced range.
    pub fn try_new(
        range: TextRange,
        expected_removed: TextFragment,
        replacement: TextFragment,
    ) -> Result<Self, TextSpliceError> {
        if range.len() != expected_removed.utf16_len().get() {
            return Err(TextSpliceError::ExpectedRemovedLength {
                range_length: range.len(),
                fragment_length: expected_removed.utf16_len(),
            });
        }
        Ok(Self { range, expected_removed, replacement })
    }

    /// Captures the exact expected source fragment from a valid document range.
    ///
    /// This is the action/plugin authoring path: callers do not reimplement
    /// canonical formatted-run extraction or UTF-16 slicing.
    ///
    /// # Errors
    ///
    /// Returns [`TextSpliceApplyError`] when the replacement, target, or range
    /// violates the active editor context.
    pub fn capture(
        context: &EditorContext,
        document: &Document,
        range: TextRange,
        replacement: TextFragment,
    ) -> Result<Self, TextSpliceApplyError> {
        validate_fragment(context, FragmentRole::Replacement, &replacement)?;
        let element = resolve_text_container(context, document, range.container_path())?;
        let length = container_length(element, range.container_path())?;
        validate_range_boundary(element, range.start(), length)?;
        validate_range_boundary(element, range.end(), length)?;
        let expected_removed = extract_fragment(element, range.start(), range.end())?;
        Ok(Self::try_new(range, expected_removed, replacement)?)
    }

    /// Returns the source range.
    #[must_use]
    pub const fn range(&self) -> &TextRange {
        &self.range
    }

    /// Returns the exact source fragment expected at the range.
    #[must_use]
    pub const fn expected_removed(&self) -> &TextFragment {
        &self.expected_removed
    }

    /// Returns the inserted fragment.
    #[must_use]
    pub const fn replacement(&self) -> &TextFragment {
        &self.replacement
    }

    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, TextSpliceApplyError> {
        validate_fragment(context, FragmentRole::ExpectedRemoved, &self.expected_removed)?;
        validate_fragment(context, FragmentRole::Replacement, &self.replacement)?;

        let element = resolve_text_container(context, document, self.range.container_path())?;

        let length = container_length(element, self.range.container_path())?;
        validate_range_boundary(element, self.range.start(), length)?;
        validate_range_boundary(element, self.range.end(), length)?;
        let actual_removed = extract_fragment(element, self.range.start(), self.range.end())?;
        if actual_removed != self.expected_removed {
            return Err(TextSpliceApplyError::ExpectedRemovedMismatch {
                expected: self.expected_removed.clone(),
                actual: actual_removed,
            });
        }
        if self.expected_removed == self.replacement {
            return Ok(AppliedOperation::Unchanged);
        }

        let result_children = build_result_children(
            element,
            self.range.start(),
            self.range.end(),
            length,
            &self.replacement,
        )?;
        let old_child_count = u32::try_from(element.children().len())
            .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
        let new_child_count = u32::try_from(result_children.len())
            .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;

        let root = replace_element_children(
            document.root(),
            self.range.container_path().as_slice(),
            0,
            result_children,
        )?;
        let result = Document::try_new(context.schema(), root, context.limits())?;

        let inverse_end = self.range.start().checked_add(self.replacement.utf16_len().get())?;
        let inverse_range = TextRange::try_new(
            self.range.container_path().clone(),
            self.range.start(),
            inverse_end,
        )?;
        let inverse = Self::try_new(
            inverse_range.clone(),
            self.replacement.clone(),
            self.expected_removed.clone(),
        )?;
        let change = TextChange::new(
            self.range.container_path().clone(),
            self.range.clone(),
            inverse_range,
            ChildRange::new(0, old_child_count),
            ChildRange::new(0, new_child_count),
        );
        let relocation = TextSpliceMap::new(self.range.clone(), self.replacement.utf16_len());
        Ok(AppliedOperation::Changed(Box::new(AppliedChange {
            document: result,
            inverse: Operation::TextSplice(inverse),
            relocation,
            change,
        })))
    }
}

fn resolve_text_container<'a>(
    context: &EditorContext,
    document: &'a Document,
    path: &NodePath,
) -> Result<&'a ElementNode, TextSpliceApplyError> {
    if document.schema() != context.schema().id() {
        return Err(TextSpliceApplyError::SchemaMismatch {
            document_schema: document.schema().clone(),
            context_schema: context.schema().id().clone(),
        });
    }
    let target = document.node_at(path)?;
    let element = target.as_element().ok_or_else(|| TextSpliceApplyError::InvalidTarget {
        path: path.clone(),
        rule: TextSpliceTargetRule::ExpectedElement,
    })?;
    if path.is_root() {
        return Err(TextSpliceApplyError::InvalidTarget {
            path: path.clone(),
            rule: TextSpliceTargetRule::DocumentRoot,
        });
    }
    if !context.schema().is_text_container(element.kind()) {
        return Err(TextSpliceApplyError::InvalidTarget {
            path: path.clone(),
            rule: TextSpliceTargetRule::NotTextContainer,
        });
    }
    ensure_text_children(element, path)?;
    Ok(element)
}

fn validate_fragment(
    context: &EditorContext,
    role: FragmentRole,
    fragment: &TextFragment,
) -> Result<(), TextSpliceApplyError> {
    if fragment.len() > context.limits().max_children_per_element() {
        return Err(TextSpliceApplyError::FragmentRunCountLimit {
            role,
            actual: fragment.len(),
            maximum: context.limits().max_children_per_element(),
        });
    }
    if fragment.text_bytes() > context.limits().max_total_text_bytes() {
        return Err(TextSpliceApplyError::FragmentTotalTextBytesLimit {
            role,
            actual: fragment.text_bytes(),
            maximum: context.limits().max_total_text_bytes(),
        });
    }
    for (run_index, run) in fragment.iter().enumerate() {
        if run.text().len() > context.limits().max_text_bytes() {
            return Err(TextSpliceApplyError::FragmentTextBytesLimit {
                role,
                run_index,
                actual: run.text().len(),
                maximum: context.limits().max_text_bytes(),
            });
        }
        if run.formats().len() > context.limits().max_formats_per_text() {
            return Err(TextSpliceApplyError::FragmentFormatCountLimit {
                role,
                run_index,
                actual: run.formats().len(),
                maximum: context.limits().max_formats_per_text(),
            });
        }
        for (format_index, format) in run.formats().iter().enumerate() {
            if !context.schema().allows_text_format(format.kind()) {
                return Err(TextSpliceApplyError::FragmentFormatNotAllowed {
                    role,
                    run_index,
                    format_index,
                    kind: format.kind().clone(),
                });
            }
            if !format.properties().is_empty() {
                return Err(TextSpliceApplyError::FragmentFormatPropertiesNotAllowed {
                    role,
                    run_index,
                    format_index,
                    kind: format.kind().clone(),
                });
            }
        }
    }
    Ok(())
}

fn ensure_text_children(
    element: &ElementNode,
    path: &NodePath,
) -> Result<(), TextSpliceApplyError> {
    if let Some((child_index, _)) =
        element.children().iter().enumerate().find(|(_, child)| child.as_text().is_none())
    {
        return Err(TextSpliceApplyError::InvalidTarget {
            path: path.clone(),
            rule: TextSpliceTargetRule::NonTextChild { child_index },
        });
    }
    Ok(())
}

fn container_length(
    element: &ElementNode,
    path: &NodePath,
) -> Result<TextOffset, TextSpliceApplyError> {
    let mut length = TextOffset::ZERO;
    for (child_index, child) in element.children().iter().enumerate() {
        let Some(text) = child.as_text() else {
            return Err(TextSpliceApplyError::InvalidTarget {
                path: path.clone(),
                rule: TextSpliceTargetRule::NonTextChild { child_index },
            });
        };
        length = length.checked_add(u64::from(text.utf16_len()))?;
    }
    Ok(length)
}

fn validate_range_boundary(
    element: &ElementNode,
    requested: TextOffset,
    length: TextOffset,
) -> Result<(), TextSpliceApplyError> {
    if requested > length {
        return Err(TextSpliceApplyError::RangeOutOfBounds { requested, length });
    }
    let mut cursor = TextOffset::ZERO;
    for child in element.children() {
        let Some(text) = child.as_text() else {
            return Err(TextSpliceApplyError::CoordinateOverflow);
        };
        let end = cursor.checked_add(u64::from(text.utf16_len()))?;
        if requested > cursor && requested < end {
            let local = u32::try_from(requested.get() - cursor.get())
                .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
            match text.byte_offset_at_utf16(local) {
                Ok(_) => return Ok(()),
                Err(Utf16BoundaryError::SplitsScalar { .. }) => {
                    return Err(TextSpliceApplyError::RangeSplitsScalar { requested });
                }
                Err(Utf16BoundaryError::OutOfBounds { .. }) => {
                    return Err(TextSpliceApplyError::RangeOutOfBounds { requested, length });
                }
            }
        }
        if requested == cursor || requested == end {
            return Ok(());
        }
        cursor = end;
    }
    Ok(())
}

fn extract_fragment(
    element: &ElementNode,
    start: TextOffset,
    end: TextOffset,
) -> Result<TextFragment, TextSpliceApplyError> {
    let mut runs = Vec::new();
    let mut cursor = 0_u64;
    for child in element.children() {
        let text = child.as_text().ok_or(TextSpliceApplyError::CoordinateOverflow)?;
        let child_end = cursor
            .checked_add(u64::from(text.utf16_len()))
            .ok_or(TextSpliceApplyError::CoordinateOverflow)?;
        let overlap_start = start.get().max(cursor);
        let overlap_end = end.get().min(child_end);
        if overlap_start < overlap_end {
            let local_start = u32::try_from(overlap_start - cursor)
                .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
            let local_end = u32::try_from(overlap_end - cursor)
                .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
            let slice = TextRun::from_text_node(text).slice_utf16(local_start, local_end).map_err(
                |_| TextSpliceApplyError::TreeInvariant {
                    rule: TreeInvariantRule::InvalidUtf16Boundary,
                },
            )?;
            if let Some(run) = slice {
                runs.push(run);
            }
        }
        cursor = child_end;
    }
    Ok(TextFragment::try_from_runs(runs)?)
}

fn build_result_children(
    element: &ElementNode,
    start: TextOffset,
    end: TextOffset,
    length: TextOffset,
    replacement: &TextFragment,
) -> Result<Vec<NodeRef>, TextSpliceApplyError> {
    let mut pieces = extract_pieces(element, TextOffset::ZERO, start)?;
    for run in replacement {
        push_piece(&mut pieces, TextPiece { run: run.clone(), original: None })?;
    }
    for piece in extract_pieces(element, end, length)? {
        push_piece(&mut pieces, piece)?;
    }
    Ok(pieces
        .into_iter()
        .map(|piece| piece.original.unwrap_or_else(|| NodeRef::text(piece.run.into_text_node())))
        .collect())
}

fn extract_pieces(
    element: &ElementNode,
    start: TextOffset,
    end: TextOffset,
) -> Result<Vec<TextPiece>, TextSpliceApplyError> {
    let mut pieces = Vec::new();
    let mut cursor = 0_u64;
    for child in element.children() {
        let text = child.as_text().ok_or(TextSpliceApplyError::CoordinateOverflow)?;
        let child_end = cursor
            .checked_add(u64::from(text.utf16_len()))
            .ok_or(TextSpliceApplyError::CoordinateOverflow)?;
        let overlap_start = start.get().max(cursor);
        let overlap_end = end.get().min(child_end);
        if overlap_start < overlap_end {
            let local_start = u32::try_from(overlap_start - cursor)
                .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
            let local_end = u32::try_from(overlap_end - cursor)
                .map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
            let slice = TextRun::from_text_node(text).slice_utf16(local_start, local_end).map_err(
                |_| TextSpliceApplyError::TreeInvariant {
                    rule: TreeInvariantRule::InvalidUtf16Boundary,
                },
            )?;
            if let Some(run) = slice {
                let original =
                    (local_start == 0 && local_end == text.utf16_len()).then(|| child.clone());
                push_piece(&mut pieces, TextPiece { run, original })?;
            }
        }
        cursor = child_end;
    }
    Ok(pieces)
}

fn push_piece(pieces: &mut Vec<TextPiece>, piece: TextPiece) -> Result<(), TextSpliceApplyError> {
    if pieces.last().is_some_and(|previous| previous.run.formats() == piece.run.formats()) {
        let Some(previous) = pieces.pop() else {
            return Err(TextSpliceApplyError::CoordinateOverflow);
        };
        pieces.push(TextPiece {
            run: previous.run.merge(&piece.run).map_err(TextFragmentError::from)?,
            original: None,
        });
    } else {
        pieces.push(piece);
    }
    Ok(())
}

struct TextPiece {
    run: TextRun,
    original: Option<NodeRef>,
}

fn replace_element_children(
    node: &NodeRef,
    path: &[u32],
    depth: usize,
    replacement: Vec<NodeRef>,
) -> Result<NodeRef, TextSpliceApplyError> {
    let element = node.as_element().ok_or(TextSpliceApplyError::TreeInvariant {
        rule: TreeInvariantRule::ExpectedElementOnPath,
    })?;
    if depth == path.len() {
        return element
            .try_with_children(replacement)
            .map(NodeRef::element)
            .map_err(|error| map_local_invariant(&error));
    }

    let index =
        usize::try_from(path[depth]).map_err(|_| TextSpliceApplyError::CoordinateOverflow)?;
    let child = element
        .children()
        .get(index)
        .ok_or(TextSpliceApplyError::TreeInvariant { rule: TreeInvariantRule::MissingPathChild })?;
    let replaced = replace_element_children(child, path, depth + 1, replacement)?;
    let mut children = element.children().to_vec();
    let Some(slot) = children.get_mut(index) else {
        return Err(TextSpliceApplyError::TreeInvariant {
            rule: TreeInvariantRule::MissingPathChild,
        });
    };
    *slot = replaced;
    element
        .try_with_children(children)
        .map(NodeRef::element)
        .map_err(|error| map_local_invariant(&error))
}

fn map_local_invariant(error: &LocalInvariantError) -> TextSpliceApplyError {
    let rule = match error {
        LocalInvariantError::EmptyText => TreeInvariantRule::EmptyText,
        LocalInvariantError::TextTooLong => TreeInvariantRule::TextTooLong,
        LocalInvariantError::DuplicateFormat { .. } => TreeInvariantRule::DuplicateFormat,
        LocalInvariantError::NonCanonicalFormatOrder { .. } => {
            TreeInvariantRule::NonCanonicalFormatOrder
        }
        LocalInvariantError::AdjacentEqualText { .. } => TreeInvariantRule::AdjacentEqualText,
        LocalInvariantError::InvalidPropertyObjectKey { .. } => {
            TreeInvariantRule::InvalidPropertyObjectKey
        }
    };
    TextSpliceApplyError::TreeInvariant { rule }
}

/// Identifies an operation fragment in a typed error.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum FragmentRole {
    /// The optimistic source-content guard.
    ExpectedRemoved,
    /// The content to insert.
    Replacement,
}

/// Stable reason a splice target is not editable text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TextSpliceTargetRule {
    /// The document root is structural, not a text container.
    DocumentRoot,
    /// The target path resolved to a text leaf.
    ExpectedElement,
    /// The element kind is not registered as a text container.
    NotTextContainer,
    /// A purported text container contains a non-text child.
    NonTextChild {
        /// Unexpected child index.
        child_index: usize,
    },
}

/// Stable local invariant that unexpectedly failed during path-copy rebuilding.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TreeInvariantRule {
    /// A path component expected an element.
    ExpectedElementOnPath,
    /// A previously resolved path child was absent during rebuilding.
    MissingPathChild,
    /// A generated text leaf was empty.
    EmptyText,
    /// A generated leaf exceeded the UTF-16 point protocol.
    TextTooLong,
    /// A generated format kind was duplicated.
    DuplicateFormat,
    /// Generated formats were not canonical.
    NonCanonicalFormatOrder,
    /// Generated neighboring text had equal formats.
    AdjacentEqualText,
    /// An existing nested property key violated its local grammar.
    InvalidPropertyObjectKey,
    /// A previously validated scalar boundary could not be sliced.
    InvalidUtf16Boundary,
}

/// Why canonical splice values are mutually inconsistent.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum TextSpliceError {
    /// The optimistic source fragment must span the complete replaced range.
    #[error(
        "expected-removed fragment length {fragment_length:?} does not equal range length {range_length}"
    )]
    ExpectedRemovedLength {
        /// Logical range length.
        range_length: u64,
        /// Expected fragment length.
        fragment_length: TextOffset,
    },
}

/// Why a [`TextSplice`] could not produce a new valid document.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TextSpliceApplyError {
    /// The splice's range and expected source fragment are inconsistent.
    #[error(transparent)]
    Contract(#[from] TextSpliceError),
    /// The document was proven by a different compiled schema identity.
    #[error("document schema {document_schema} does not match context schema {context_schema}")]
    SchemaMismatch {
        /// Schema recorded on the document.
        document_schema: SchemaId,
        /// Schema owned by the execution context.
        context_schema: SchemaId,
    },
    /// The target path did not resolve in the source snapshot.
    #[error(transparent)]
    NodeLookup(#[from] NodeLookupError),
    /// The target is not an editable text container.
    #[error("text-splice target {path:?} violates rule {rule:?}")]
    InvalidTarget {
        /// Rejected target path.
        path: NodePath,
        /// Stable rejection reason.
        rule: TextSpliceTargetRule,
    },
    /// A range boundary exceeds the logical container.
    #[error("text-splice offset {requested:?} exceeds container length {length:?}")]
    RangeOutOfBounds {
        /// Rejected boundary.
        requested: TextOffset,
        /// Logical container length.
        length: TextOffset,
    },
    /// A range boundary lands within a UTF-16 surrogate pair.
    #[error("text-splice offset {requested:?} splits a Unicode scalar")]
    RangeSplitsScalar {
        /// Rejected boundary.
        requested: TextOffset,
    },
    /// The source content does not match the operation's optimistic guard.
    #[error("text-splice expected-removed fragment does not match source content")]
    ExpectedRemovedMismatch {
        /// Operation-supplied expected source.
        expected: TextFragment,
        /// Actual source fragment.
        actual: TextFragment,
    },
    /// A fragment contains more runs than one element permits.
    #[error("{role:?} fragment has {actual} runs; the configured maximum is {maximum}")]
    FragmentRunCountLimit {
        /// Failing fragment.
        role: FragmentRole,
        /// Actual run count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// A fragment alone exceeds the document-wide text budget.
    #[error("{role:?} fragment has {actual} text bytes; the configured maximum is {maximum}")]
    FragmentTotalTextBytesLimit {
        /// Failing fragment.
        role: FragmentRole,
        /// Actual UTF-8 bytes.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One run exceeds the per-leaf byte limit.
    #[error(
        "{role:?} fragment run {run_index} has {actual} text bytes; the configured maximum is {maximum}"
    )]
    FragmentTextBytesLimit {
        /// Failing fragment.
        role: FragmentRole,
        /// Failing run.
        run_index: usize,
        /// Actual UTF-8 bytes.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One run exceeds the per-leaf format limit.
    #[error(
        "{role:?} fragment run {run_index} has {actual} formats; the configured maximum is {maximum}"
    )]
    FragmentFormatCountLimit {
        /// Failing fragment.
        role: FragmentRole,
        /// Failing run.
        run_index: usize,
        /// Actual format count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// The schema does not allow one format kind.
    #[error("{role:?} fragment run {run_index} format {format_index} `{kind}` is not allowed")]
    FragmentFormatNotAllowed {
        /// Failing fragment.
        role: FragmentRole,
        /// Failing run.
        run_index: usize,
        /// Failing format.
        format_index: usize,
        /// Rejected kind.
        kind: QualifiedName,
    },
    /// The schema does not allow properties on one format.
    #[error(
        "{role:?} fragment run {run_index} format {format_index} `{kind}` does not allow properties"
    )]
    FragmentFormatPropertiesNotAllowed {
        /// Failing fragment.
        role: FragmentRole,
        /// Failing run.
        run_index: usize,
        /// Failing format.
        format_index: usize,
        /// Rejected kind.
        kind: QualifiedName,
    },
    /// Canonical fragment construction or seam merging failed.
    #[error(transparent)]
    Fragment(#[from] TextFragmentError),
    /// Inverse range construction failed.
    #[error(transparent)]
    TextRange(#[from] TextRangeError),
    /// Aggregate UTF-16 arithmetic failed.
    #[error(transparent)]
    TextOffset(#[from] TextOffsetError),
    /// Checked native or child-index arithmetic failed.
    #[error("text-splice coordinate arithmetic overflowed")]
    CoordinateOverflow,
    /// Persistent path rebuilding encountered an impossible local invariant.
    #[error("text-splice tree rebuilding violated invariant {rule:?}")]
    TreeInvariant {
        /// Stable invariant category.
        rule: TreeInvariantRule,
    },
    /// The complete result failed schema or resource validation.
    #[error(transparent)]
    InvalidResult(#[from] ValidationReport),
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use crate::{
        document::{
            ElementNode, Format, FormatSet, NodeRef, PropertyMap, TextFragment, TextNode, TextRun,
        },
        identity::QualifiedName,
        position::TextOffset,
    };

    use super::build_result_children;

    #[test]
    fn splice_reuses_whole_untouched_text_nodes_inside_the_container() -> Result<(), Box<dyn Error>>
    {
        let plain = FormatSet::default();
        let strong = FormatSet::try_from_sorted(vec![Format::new(
            QualifiedName::from_known_static("breditor/strong"),
            PropertyMap::default(),
        )])?;
        let left = NodeRef::text(TextNode::try_new("left".to_owned(), plain.clone())?);
        let middle = NodeRef::text(TextNode::try_new("middle".to_owned(), strong.clone())?);
        let right = NodeRef::text(TextNode::try_new("right".to_owned(), plain)?);
        let paragraph = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            vec![left.clone(), middle.clone(), right.clone()],
        )?;
        let replacement = TextFragment::from(TextRun::try_new("X", strong)?);
        let result = build_result_children(
            &paragraph,
            TextOffset::try_new(12)?,
            TextOffset::try_new(12)?,
            TextOffset::try_new(15)?,
            &replacement,
        )?;
        let result_left =
            result.first().ok_or_else(|| io::Error::other("splice result omitted the left run"))?;
        let result_middle = result
            .get(1)
            .ok_or_else(|| io::Error::other("splice result omitted the middle run"))?;
        assert!(result_left.shares_allocation_with(&left));
        assert!(result_middle.shares_allocation_with(&middle));
        assert!(result.iter().all(|node| !node.shares_allocation_with(&right)));
        Ok(())
    }
}
