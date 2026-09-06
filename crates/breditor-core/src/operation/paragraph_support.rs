use crate::{
    document::{
        Document, DocumentProofMismatch, ElementNode, LocalInvariantError, NodeLookupError,
        NodeRef, TextFragment, TextFragmentError, TextRun,
    },
    position::NodePath,
    schema::SchemaId,
    state::EditorContext,
};

/// Stable reason a structural paragraph target is outside the first base contract.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ParagraphTargetRule {
    /// Structural paragraph operations cannot target the document root itself.
    DocumentRoot,
    /// The first contract edits only paragraphs directly owned by the root.
    NotDirectRootChild,
    /// The path resolved to a text leaf instead of an element.
    ExpectedElement,
    /// The element is not the base schema's paragraph kind.
    NotBaseParagraph,
    /// A purported paragraph contains a non-text child.
    NonTextChild {
        /// Unexpected child index.
        child_index: usize,
    },
}

/// Stable internal structural failure category shared by paragraph operations.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ParagraphStructureInvariantRule {
    /// A validated document unexpectedly had a non-element root.
    ExpectedRootElement,
    /// Internal child-range construction reversed its boundaries.
    ReversedChildRange,
    /// Internal child-range construction exceeded the root child sequence.
    ChildRangeOutOfBounds,
    /// Rebuilding a paragraph from a canonical fragment failed.
    ParagraphRebuild,
    /// Rebuilding the document root failed.
    RootRebuild,
}

pub(super) fn resolve_base_paragraph<'a>(
    context: &EditorContext,
    document: &'a Document,
    path: &NodePath,
) -> Result<&'a ElementNode, ResolveParagraphError> {
    ensure_base_document(context, document)?;
    resolve_base_paragraph_path(context, document, path)
}

/// Proves the document/context pair before a structural operation performs any
/// caller-data validation or document read.
pub(super) fn ensure_base_document(
    context: &EditorContext,
    document: &Document,
) -> Result<(), ResolveParagraphError> {
    if let Some(mismatch) = document.proof_mismatch(context.schema(), context.limits()) {
        return Err(map_document_proof_mismatch(mismatch));
    }
    if !context.schema().is_exact_breditor_base() {
        return Err(ResolveParagraphError::UnsupportedSchema {
            schema: context.schema().id().clone(),
        });
    }
    Ok(())
}

fn resolve_base_paragraph_path<'a>(
    context: &EditorContext,
    document: &'a Document,
    path: &NodePath,
) -> Result<&'a ElementNode, ResolveParagraphError> {
    if path.is_root() {
        return Err(ResolveParagraphError::InvalidTarget {
            path: path.clone(),
            rule: ParagraphTargetRule::DocumentRoot,
        });
    }
    if path.len() != 1 {
        return Err(ResolveParagraphError::InvalidTarget {
            path: path.clone(),
            rule: ParagraphTargetRule::NotDirectRootChild,
        });
    }

    let node = document.node_at(path)?;
    let element = node.as_element().ok_or_else(|| ResolveParagraphError::InvalidTarget {
        path: path.clone(),
        rule: ParagraphTargetRule::ExpectedElement,
    })?;
    if element.kind() != context.schema().paragraph_kind() {
        return Err(ResolveParagraphError::InvalidTarget {
            path: path.clone(),
            rule: ParagraphTargetRule::NotBaseParagraph,
        });
    }
    if let Some((child_index, _)) =
        element.children().iter().enumerate().find(|(_, child)| child.as_text().is_none())
    {
        return Err(ResolveParagraphError::InvalidTarget {
            path: path.clone(),
            rule: ParagraphTargetRule::NonTextChild { child_index },
        });
    }
    Ok(element)
}

fn map_document_proof_mismatch(mismatch: DocumentProofMismatch) -> ResolveParagraphError {
    match mismatch {
        DocumentProofMismatch::SchemaId { document_schema, active_schema } => {
            ResolveParagraphError::SchemaMismatch { document_schema, context_schema: active_schema }
        }
        mismatch => ResolveParagraphError::DocumentProofMismatch(mismatch),
    }
}

pub(super) fn fragment_from_paragraph(
    paragraph: &ElementNode,
) -> Result<TextFragment, ParagraphContentError> {
    let mut runs = Vec::with_capacity(paragraph.children().len());
    for (child_index, child) in paragraph.children().iter().enumerate() {
        let text = child.as_text().ok_or(ParagraphContentError::NonTextChild { child_index })?;
        runs.push(TextRun::from_text_node(text));
    }
    TextFragment::try_from_runs(runs).map_err(Into::into)
}

pub(super) fn paragraph_from_fragment(
    source: &ElementNode,
    fragment: &TextFragment,
) -> Result<NodeRef, LocalInvariantError> {
    let children =
        fragment.iter().cloned().map(|run| NodeRef::text(run.into_text_node())).collect();
    source.try_with_children(children).map(NodeRef::element)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum ResolveParagraphError {
    SchemaMismatch { document_schema: SchemaId, context_schema: SchemaId },
    DocumentProofMismatch(DocumentProofMismatch),
    UnsupportedSchema { schema: SchemaId },
    NodeLookup(NodeLookupError),
    InvalidTarget { path: NodePath, rule: ParagraphTargetRule },
}

impl From<NodeLookupError> for ResolveParagraphError {
    fn from(value: NodeLookupError) -> Self {
        Self::NodeLookup(value)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum ParagraphContentError {
    NonTextChild { child_index: usize },
    Fragment(TextFragmentError),
}

impl From<TextFragmentError> for ParagraphContentError {
    fn from(value: TextFragmentError) -> Self {
        Self::Fragment(value)
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap},
        identity::QualifiedName,
        position::NodePath,
        schema::{CompiledSchema, DocumentLimits},
        state::EditorContext,
    };

    use super::{ResolveParagraphError, resolve_base_paragraph};

    fn empty_document(
        schema: &CompiledSchema,
        limits: &DocumentLimits,
    ) -> Result<Document, Box<dyn Error>> {
        let paragraph = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            Vec::new(),
        )?;
        let root = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/document"),
            None,
            PropertyMap::default(),
            vec![NodeRef::element(paragraph)],
        )?;
        Document::try_new(schema, NodeRef::element(root), limits).map_err(Into::into)
    }

    #[test]
    fn paragraph_resolution_requires_the_exact_compiled_proof_before_path_work()
    -> Result<(), Box<dyn Error>> {
        let source_schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let document = empty_document(&source_schema, &limits)?;
        let foreign_context = EditorContext::new(CompiledSchema::breditor_base(), limits.clone());

        assert!(matches!(
            resolve_base_paragraph(&foreign_context, &document, &NodePath::root()),
            Err(ResolveParagraphError::DocumentProofMismatch(DocumentProofMismatch::CompiledProof))
        ));

        let fingerprint_context =
            EditorContext::new(CompiledSchema::test_semantic_variant_same_id(), limits);
        assert!(matches!(
            resolve_base_paragraph(&fingerprint_context, &document, &NodePath::root()),
            Err(ResolveParagraphError::DocumentProofMismatch(
                DocumentProofMismatch::SchemaFingerprint { .. }
            ))
        ));
        Ok(())
    }

    #[test]
    fn paragraph_resolution_requires_the_exact_validation_policy_before_path_work()
    -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let source_limits = DocumentLimits::default();
        let document = empty_document(&schema, &source_limits)?;
        let context = EditorContext::new(schema, DocumentLimits::default().with_max_nodes(2));

        assert!(matches!(
            resolve_base_paragraph(&context, &document, &NodePath::root()),
            Err(ResolveParagraphError::DocumentProofMismatch(
                DocumentProofMismatch::ValidationPolicy
            ))
        ));
        Ok(())
    }
}
