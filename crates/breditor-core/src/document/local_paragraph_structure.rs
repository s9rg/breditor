use std::ops::Range;

use thiserror::Error;

use crate::{
    document::{Document, DocumentProofMismatch, LocalInvariantError, NodeRef},
    schema::{CompiledSchema, DocumentLimits, SchemaId, ValidationReport},
};

/// Why authoritative base-paragraph structural publication failed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum LocalParagraphStructureError {
    /// The source document and active compiled schema have different identities.
    #[error("document schema {document_schema} does not match active schema {active_schema}")]
    SchemaMismatch {
        /// Schema recorded on the source document.
        document_schema: SchemaId,
        /// Schema requested by the caller.
        active_schema: SchemaId,
    },
    /// The source document lacks the exact active schema or validation-policy
    /// proof required by this local publication boundary.
    #[error(transparent)]
    DocumentProofMismatch(#[from] DocumentProofMismatch),
    /// This deliberately narrow boundary only supports compiler-proved
    /// base-text profiles.
    #[error("paragraph structure publication does not support schema {active_schema}")]
    UnsupportedSchema {
        /// Unsupported active schema.
        active_schema: SchemaId,
    },
    /// The validated source document unexpectedly had a non-element root.
    #[error("the validated document root was not an element")]
    ExpectedRootElement,
    /// A half-open root-child range ran backward.
    #[error("paragraph range start {start} follows end {end}")]
    ReversedRange {
        /// Inclusive range start.
        start: usize,
        /// Exclusive range end.
        end: usize,
    },
    /// A half-open root-child range exceeded the source paragraph count.
    #[error(
        "paragraph range {start}..{end} exceeds the document's {paragraph_count} root children"
    )]
    RangeOutOfBounds {
        /// Inclusive range start.
        start: usize,
        /// Exclusive range end.
        end: usize,
        /// Number of source root children.
        paragraph_count: usize,
    },
    /// Rebuilding the root violated a record-independent local invariant.
    #[error(transparent)]
    LocalInvariant(#[from] LocalInvariantError),
    /// The authoritative complete validator rejected the candidate document.
    #[error(transparent)]
    InvalidResult(#[from] ValidationReport),
}

impl Document {
    /// Replaces a half-open range of base-document paragraphs.
    ///
    /// This is the authoritative structural publication boundary for the
    /// sealed base-text structure. It preserves untouched root-child
    /// allocations, rebuilds the root, and always subjects the complete tree to
    /// [`Document::try_new`] before publishing it.
    pub(crate) fn try_replace_base_paragraph_range(
        &self,
        schema: &CompiledSchema,
        limits: &DocumentLimits,
        old_range: Range<usize>,
        replacements: Vec<NodeRef>,
    ) -> Result<Self, LocalParagraphStructureError> {
        ensure_supported_schema(self, schema, limits)?;

        let root =
            self.root().as_element().ok_or(LocalParagraphStructureError::ExpectedRootElement)?;
        let Range { start, end } = old_range;
        if start > end {
            return Err(LocalParagraphStructureError::ReversedRange { start, end });
        }
        let paragraph_count = root.children().len();
        if end > paragraph_count {
            return Err(LocalParagraphStructureError::RangeOutOfBounds {
                start,
                end,
                paragraph_count,
            });
        }

        let mut children = root.children().to_vec();
        drop(children.splice(start..end, replacements));
        let candidate_root = root.try_with_children(children).map(NodeRef::element)?;
        Self::try_new(schema, candidate_root, limits).map_err(Into::into)
    }
}

fn ensure_supported_schema(
    document: &Document,
    active_schema: &CompiledSchema,
    limits: &DocumentLimits,
) -> Result<(), LocalParagraphStructureError> {
    if let Some(mismatch) = document.proof_mismatch(active_schema, limits) {
        return Err(local_proof_mismatch(mismatch));
    }
    if !active_schema.supports_base_text_operations() {
        return Err(LocalParagraphStructureError::UnsupportedSchema {
            active_schema: active_schema.id().clone(),
        });
    }
    Ok(())
}

fn local_proof_mismatch(mismatch: DocumentProofMismatch) -> LocalParagraphStructureError {
    match mismatch {
        DocumentProofMismatch::SchemaId { document_schema, active_schema } => {
            LocalParagraphStructureError::SchemaMismatch { document_schema, active_schema }
        }
        mismatch => LocalParagraphStructureError::DocumentProofMismatch(mismatch),
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use crate::{
        document::{
            Document, ElementNode, FormatSet, NodeRef, PropertyMap, TextNode,
            local_paragraph_structure::{LocalParagraphStructureError, ensure_supported_schema},
        },
        identity::QualifiedName,
        schema::{CompiledSchema, DocumentLimits, ValidationCode},
    };

    fn paragraph(text: &str) -> Result<NodeRef, Box<dyn Error>> {
        let children = if text.is_empty() {
            Vec::new()
        } else {
            vec![NodeRef::text(TextNode::try_new(text.to_owned(), FormatSet::default())?)]
        };
        ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            children,
        )
        .map(NodeRef::element)
        .map_err(Into::into)
    }

    fn source_document(
        schema: &CompiledSchema,
        limits: &DocumentLimits,
        paragraphs: Vec<NodeRef>,
    ) -> Result<Document, Box<dyn Error>> {
        let root = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/document"),
            None,
            PropertyMap::default(),
            paragraphs,
        )
        .map(NodeRef::element)?;
        Document::try_new(schema, root, limits).map_err(Into::into)
    }

    #[test]
    fn replacement_preserves_untouched_sibling_allocations() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let left = paragraph("left")?;
        let middle = paragraph("middle")?;
        let right = paragraph("right")?;
        let replacement = paragraph("new")?;
        let source = source_document(&schema, &limits, vec![left.clone(), middle, right.clone()])?;

        let result = source.try_replace_base_paragraph_range(
            &schema,
            &limits,
            1..2,
            vec![replacement.clone()],
        )?;
        let result_root = result.root().as_element().ok_or_else(|| {
            io::Error::other("published structural result did not have an element root")
        })?;
        let result_left = result_root
            .children()
            .get(0)
            .ok_or_else(|| io::Error::other("published result omitted the left paragraph"))?;
        let result_replacement = result_root
            .children()
            .get(1)
            .ok_or_else(|| io::Error::other("published result omitted the replacement"))?;
        let result_right = result_root
            .children()
            .get(2)
            .ok_or_else(|| io::Error::other("published result omitted the right paragraph"))?;
        assert!(result_left.shares_allocation_with(&left));
        assert!(result_replacement.shares_allocation_with(&replacement));
        assert!(result_right.shares_allocation_with(&right));
        assert_eq!(result.summary().node_count(), source.summary().node_count());
        assert!(result.is_proven_for(&schema, &limits));
        Ok(())
    }

    #[test]
    fn malformed_ranges_are_rejected_before_splicing() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let source = source_document(&schema, &limits, vec![paragraph("a")?, paragraph("b")?])?;

        let reversed_start = 2;
        let reversed_end = 1;
        assert_eq!(
            source.try_replace_base_paragraph_range(
                &schema,
                &limits,
                reversed_start..reversed_end,
                Vec::new(),
            ),
            Err(LocalParagraphStructureError::ReversedRange { start: 2, end: 1 })
        );
        assert_eq!(
            source.try_replace_base_paragraph_range(&schema, &limits, 1..3, Vec::new()),
            Err(LocalParagraphStructureError::RangeOutOfBounds {
                start: 1,
                end: 3,
                paragraph_count: 2,
            })
        );
        Ok(())
    }

    #[test]
    fn compiled_proof_guard_rejects_independent_compilation() -> Result<(), Box<dyn Error>> {
        let source_schema = CompiledSchema::breditor_base();
        let active_schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let source = source_document(&source_schema, &limits, vec![paragraph("a")?])?;
        assert_eq!(
            ensure_supported_schema(&source, &active_schema, &limits),
            Err(LocalParagraphStructureError::DocumentProofMismatch(
                crate::document::DocumentProofMismatch::CompiledProof,
            ))
        );
        Ok(())
    }

    #[test]
    fn validation_policy_guard_rejects_different_runtime_limits() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let source_limits = DocumentLimits::default();
        let active_limits = source_limits.clone().with_max_nodes(10);
        let source = source_document(&schema, &source_limits, vec![paragraph("a")?])?;
        assert_eq!(
            ensure_supported_schema(&source, &schema, &active_limits),
            Err(LocalParagraphStructureError::DocumentProofMismatch(
                crate::document::DocumentProofMismatch::ValidationPolicy,
            ))
        );
        Ok(())
    }

    #[test]
    fn authoritative_validation_report_is_passed_through_unchanged() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let original_paragraph = paragraph("valid")?;
        let source = source_document(&schema, &limits, vec![original_paragraph.clone()])?;
        let invalid_root_child =
            NodeRef::text(TextNode::try_new("not-a-paragraph".to_owned(), FormatSet::default())?);

        let source_root = source
            .root()
            .as_element()
            .ok_or_else(|| io::Error::other("source did not have an element root"))?;
        let candidate_root = source_root
            .try_with_children(vec![invalid_root_child.clone()])
            .map(NodeRef::element)?;
        let expected = Document::try_new(&schema, candidate_root, &limits)
            .err()
            .ok_or_else(|| io::Error::other("independent full validation accepted invalid root"))?;
        assert!(expected.contains(ValidationCode::InvalidChild));

        assert_eq!(
            source.try_replace_base_paragraph_range(
                &schema,
                &limits,
                0..1,
                vec![invalid_root_child],
            ),
            Err(LocalParagraphStructureError::InvalidResult(expected))
        );
        assert!(source.root().as_element().is_some_and(|root| {
            root.children()
                .get(0)
                .is_some_and(|child| child.shares_allocation_with(&original_paragraph))
        }));
        Ok(())
    }
}
