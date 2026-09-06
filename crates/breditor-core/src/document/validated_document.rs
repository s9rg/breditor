use thiserror::Error;

use crate::{
    document::{DocumentSummary, NodeRef},
    position::NodePath,
    schema::{
        CompiledSchema, CompiledSchemaProof, DocumentLimits, RuntimeValidationProfile,
        SchemaFingerprint, SchemaId, ValidationReport,
    },
};

use super::local_text_splice::LocalTextSpliceProof;

/// A complete, immutable, schema-valid editor document.
#[derive(Clone, Debug)]
pub struct Document {
    schema: SchemaId,
    schema_fingerprint: SchemaFingerprint,
    compiled_proof: CompiledSchemaProof,
    root: NodeRef,
    summary: DocumentSummary,
    validation_profile: RuntimeValidationProfile,
}

impl Document {
    /// Returns the schema identity against which this document was validated.
    #[must_use]
    pub fn schema(&self) -> &SchemaId {
        &self.schema
    }

    /// Returns the durable identity of the complete schema definition that
    /// admitted this document.
    #[must_use]
    pub const fn schema_fingerprint(&self) -> SchemaFingerprint {
        self.schema_fingerprint
    }

    /// Returns the document root, which is guaranteed to be an element.
    #[must_use]
    pub fn root(&self) -> &NodeRef {
        &self.root
    }

    /// Returns exact measurements cached by the successful schema validation.
    #[must_use]
    pub const fn summary(&self) -> &DocumentSummary {
        &self.summary
    }

    /// Resolves a snapshot-local structural path.
    ///
    /// # Errors
    ///
    /// Returns [`NodeLookupError`] when an index is out of bounds or the path
    /// tries to descend through text.
    pub fn node_at(&self, path: &NodePath) -> Result<&NodeRef, NodeLookupError> {
        let mut current = &self.root;
        for (depth, child_index) in path.iter().enumerate() {
            let Some(element) = current.as_element() else {
                return Err(NodeLookupError::TraversesText { path: path.clone(), depth });
            };
            let index = usize::try_from(child_index).map_err(|_| {
                NodeLookupError::ChildIndexOutOfBounds {
                    path: path.clone(),
                    depth,
                    child_index,
                    child_count: element.children().len(),
                }
            })?;
            let Some(child) = element.children().get(index) else {
                return Err(NodeLookupError::ChildIndexOutOfBounds {
                    path: path.clone(),
                    depth,
                    child_index,
                    child_count: element.children().len(),
                });
            };
            current = child;
        }
        Ok(current)
    }

    pub(crate) fn try_new(
        schema: &CompiledSchema,
        root: NodeRef,
        limits: &DocumentLimits,
    ) -> Result<Self, ValidationReport> {
        let summary = schema.validate_root(&root, limits)?;
        Ok(Self {
            schema: schema.id().clone(),
            schema_fingerprint: schema.fingerprint(),
            compiled_proof: schema.proof().clone(),
            root,
            summary,
            validation_profile: limits.runtime_validation_profile(),
        })
    }

    pub(crate) fn try_revalidate(
        self,
        schema: &CompiledSchema,
        limits: &DocumentLimits,
    ) -> Result<Self, ValidationReport> {
        Self::try_new(schema, self.root, limits)
    }

    pub(crate) fn is_proven_for(&self, schema: &CompiledSchema, limits: &DocumentLimits) -> bool {
        self.proof_mismatch(schema, limits).is_none()
    }

    /// Classifies why this document cannot use an exact schema-and-policy proof
    /// fast path.
    pub(crate) fn proof_mismatch(
        &self,
        schema: &CompiledSchema,
        limits: &DocumentLimits,
    ) -> Option<DocumentProofMismatch> {
        self.schema_proof_mismatch(schema).or_else(|| {
            (self.validation_profile != limits.runtime_validation_profile())
                .then_some(DocumentProofMismatch::ValidationPolicy)
        })
    }

    /// Classifies why schema-guided reads cannot trust this document's proof.
    /// Runtime validation policy is deliberately irrelevant to read-only
    /// selection resolution.
    pub(crate) fn schema_proof_mismatch(
        &self,
        schema: &CompiledSchema,
    ) -> Option<DocumentProofMismatch> {
        if &self.schema != schema.id() {
            return Some(DocumentProofMismatch::SchemaId {
                document_schema: self.schema.clone(),
                active_schema: schema.id().clone(),
            });
        }
        if self.schema_fingerprint != schema.fingerprint() {
            return Some(DocumentProofMismatch::SchemaFingerprint {
                document_fingerprint: self.schema_fingerprint,
                active_fingerprint: schema.fingerprint(),
            });
        }
        if !schema.shares_proof(&self.compiled_proof) {
            return Some(DocumentProofMismatch::CompiledProof);
        }
        None
    }

    pub(super) fn from_local_text_splice_proof(proof: LocalTextSpliceProof) -> Self {
        let (schema, schema_fingerprint, compiled_proof, root, summary, validation_profile) =
            proof.into_parts();
        Self { schema, schema_fingerprint, compiled_proof, root, summary, validation_profile }
    }
}

impl PartialEq for Document {
    fn eq(&self, other: &Self) -> bool {
        self.schema == other.schema
            && self.schema_fingerprint == other.schema_fingerprint
            && self.root == other.root
    }
}

impl Eq for Document {}

/// Why a validated document does not carry the exact proof required by an
/// active schema or runtime validation policy.
///
/// The process-local proof itself is intentionally never exposed as data or as
/// an allocation address. `CompiledProof` only reports that the opaque proof
/// allocations differ.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum DocumentProofMismatch {
    /// The human-readable schema selectors differ.
    #[error("document schema {document_schema} does not match active schema {active_schema}")]
    SchemaId {
        /// Schema selector recorded on the document.
        document_schema: SchemaId,
        /// Schema selector owned by the active compiled schema.
        active_schema: SchemaId,
    },
    /// The durable complete-definition fingerprints differ.
    #[error(
        "document schema fingerprint {document_fingerprint} does not match active fingerprint {active_fingerprint}"
    )]
    SchemaFingerprint {
        /// Complete-definition fingerprint recorded on the document.
        document_fingerprint: SchemaFingerprint,
        /// Complete-definition fingerprint of the active compiled schema.
        active_fingerprint: SchemaFingerprint,
    },
    /// The schema definitions have the same durable identity but were proved
    /// by different compiled-schema instances in this process.
    #[error("document and active schema carry different process-local compiled proofs")]
    CompiledProof,
    /// The document was proved under different runtime resource limits.
    #[error("document and active context use different runtime validation policies")]
    ValidationPolicy,
}

/// Why a [`NodePath`] could not resolve within a [`Document`].
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum NodeLookupError {
    /// An intermediate path component targeted a text leaf.
    #[error("path {path:?} descends through text at depth {depth}")]
    TraversesText {
        /// Complete requested path.
        path: NodePath,
        /// Zero-based component at which traversal failed.
        depth: usize,
    },
    /// A child index does not exist.
    #[error(
        "path {path:?} uses child {child_index} at depth {depth}, but the element has {child_count} children"
    )]
    ChildIndexOutOfBounds {
        /// Complete requested path.
        path: NodePath,
        /// Zero-based component at which traversal failed.
        depth: usize,
        /// Requested child index.
        child_index: u32,
        /// Number of children in the targeted element.
        child_count: usize,
    },
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap},
        identity::QualifiedName,
        schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    };

    fn empty_document_root() -> Result<NodeRef, Box<dyn Error>> {
        let paragraph = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            Vec::new(),
        )
        .map(NodeRef::element)?;
        ElementNode::try_new(
            QualifiedName::from_known_static("breditor/document"),
            None,
            PropertyMap::default(),
            vec![paragraph],
        )
        .map(NodeRef::element)
        .map_err(Into::into)
    }

    #[test]
    fn proof_mismatch_classifies_every_identity_layer_in_order() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let document = Document::try_new(&schema, empty_document_root()?, &limits)?;
        assert_eq!(document.schema_fingerprint(), schema.fingerprint());
        assert_eq!(document.proof_mismatch(&schema, &limits), None);

        let mut foreign_id = document.clone();
        foreign_id.schema =
            SchemaId::new(QualifiedName::try_new("example/schema")?, SchemaVersion::try_new(1)?);
        assert!(matches!(
            foreign_id.proof_mismatch(&schema, &limits),
            Some(DocumentProofMismatch::SchemaId { .. })
        ));

        let semantic_variant = CompiledSchema::test_semantic_variant_same_id();
        assert_ne!(schema.fingerprint(), semantic_variant.fingerprint());
        assert!(matches!(
            document.proof_mismatch(&semantic_variant, &limits),
            Some(DocumentProofMismatch::SchemaFingerprint { .. })
        ));

        let independent_schema = CompiledSchema::breditor_base();
        assert_eq!(schema.fingerprint(), independent_schema.fingerprint());
        assert_eq!(
            document.proof_mismatch(&independent_schema, &limits),
            Some(DocumentProofMismatch::CompiledProof)
        );

        let different_policy = limits.clone().with_max_nodes(10);
        assert_eq!(
            document.proof_mismatch(&schema, &different_policy),
            Some(DocumentProofMismatch::ValidationPolicy)
        );
        Ok(())
    }

    #[test]
    fn semantic_equality_excludes_compiled_proof_and_validation_policy()
    -> Result<(), Box<dyn Error>> {
        let first_schema = CompiledSchema::breditor_base();
        let second_schema = CompiledSchema::breditor_base();
        let root = empty_document_root()?;
        let first = Document::try_new(&first_schema, root.clone(), &DocumentLimits::default())?;
        let second =
            Document::try_new(&second_schema, root, &DocumentLimits::default().with_max_nodes(10))?;

        assert_eq!(first, second);
        assert_eq!(
            first.schema_proof_mismatch(&second_schema),
            Some(DocumentProofMismatch::CompiledProof)
        );
        Ok(())
    }

    #[test]
    fn semantic_equality_includes_schema_fingerprint() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let mut document =
            Document::try_new(&schema, empty_document_root()?, &DocumentLimits::default())?;
        let original = document.clone();
        document.schema_fingerprint = CompiledSchema::test_semantic_variant_same_id().fingerprint();

        assert_ne!(document, original);
        Ok(())
    }
}
