use thiserror::Error;

use crate::{
    document::{
        Document, DocumentProofMismatch, DocumentSummary, ElementNode, LocalInvariantError, NodeRef,
    },
    position::{NodePath, TextOffset},
    schema::{
        CompiledSchema, CompiledSchemaProof, DocumentLimits, RuntimeValidationProfile,
        SchemaFingerprint, SchemaId, ValidationReport, child_count_fits_point_protocol,
    },
};

/// How one locally rebuilt text document was proved before publication.
#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LocalTextPublicationKind {
    /// Fixed-base invariants and aggregate deltas proved the edited spine.
    IncrementalProof,
    /// The authoritative full validator handled an unsupported or failing proof.
    CompleteValidation,
}

/// A document published by the local text replacement boundary.
pub(crate) struct LocalTextPublication {
    document: Document,
    #[cfg(test)]
    kind: LocalTextPublicationKind,
}

impl LocalTextPublication {
    fn from_incremental_proof(document: Document) -> Self {
        Self {
            document,
            #[cfg(test)]
            kind: LocalTextPublicationKind::IncrementalProof,
        }
    }

    fn from_complete_validation(document: Document) -> Self {
        Self {
            document,
            #[cfg(test)]
            kind: LocalTextPublicationKind::CompleteValidation,
        }
    }

    pub(crate) fn into_document(self) -> Document {
        self.document
    }

    #[cfg(test)]
    const fn kind(&self) -> LocalTextPublicationKind {
        self.kind
    }
}

/// Why path-copy construction or authoritative fallback validation failed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum LocalTextPublicationError {
    /// The source document was proved by a different schema identity.
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
    /// One path component expected an element.
    #[error("the locally replaced path traversed a non-element node")]
    ExpectedElementOnPath,
    /// One previously resolved path child was absent during path copying.
    #[error("the locally replaced path child was absent during path copying")]
    MissingPathChild,
    /// Rebuilding an element violated a record-independent local invariant.
    #[error(transparent)]
    LocalInvariant(#[from] LocalInvariantError),
    /// The authoritative fallback validator rejected the candidate root.
    #[error(transparent)]
    InvalidResult(#[from] ValidationReport),
}

impl Document {
    /// Replaces one fixed-base paragraph's children and publishes only after a
    /// local proof or an authoritative full-validation fallback succeeds.
    pub(crate) fn try_replace_base_paragraph_children(
        &self,
        schema: &CompiledSchema,
        limits: &DocumentLimits,
        path: &NodePath,
        children: Vec<NodeRef>,
    ) -> Result<LocalTextPublication, LocalTextPublicationError> {
        if let Some(mismatch) = self.proof_mismatch(schema, limits) {
            return Err(local_proof_mismatch(mismatch));
        }
        let candidate_root = replace_element_children(self.root(), path.as_slice(), 0, children)?;
        match LocalTextSpliceProof::try_new(self, schema, limits, path, candidate_root) {
            Ok(proof) => Ok(LocalTextPublication::from_incremental_proof(
                Self::from_local_text_splice_proof(proof),
            )),
            Err(candidate_root) => Ok(LocalTextPublication::from_complete_validation(
                Self::try_new(schema, candidate_root, limits)?,
            )),
        }
    }
}

/// Opaque evidence binding one exact rebuilt root to its derived measurements.
pub(super) struct LocalTextSpliceProof {
    schema: crate::schema::SchemaId,
    schema_fingerprint: SchemaFingerprint,
    compiled_proof: CompiledSchemaProof,
    root: NodeRef,
    summary: DocumentSummary,
    validation_profile: RuntimeValidationProfile,
}

impl LocalTextSpliceProof {
    fn try_new(
        source: &Document,
        schema: &CompiledSchema,
        limits: &DocumentLimits,
        path: &NodePath,
        candidate_root: NodeRef,
    ) -> Result<Self, NodeRef> {
        let Some(summary) = prove_summary(source, schema, limits, path, &candidate_root) else {
            return Err(candidate_root);
        };
        Ok(Self {
            schema: schema.id().clone(),
            schema_fingerprint: schema.fingerprint(),
            compiled_proof: schema.proof().clone(),
            root: candidate_root,
            summary,
            validation_profile: limits.runtime_validation_profile(),
        })
    }

    pub(super) fn into_parts(
        self,
    ) -> (
        crate::schema::SchemaId,
        SchemaFingerprint,
        CompiledSchemaProof,
        NodeRef,
        DocumentSummary,
        RuntimeValidationProfile,
    ) {
        (
            self.schema,
            self.schema_fingerprint,
            self.compiled_proof,
            self.root,
            self.summary,
            self.validation_profile,
        )
    }
}

fn local_proof_mismatch(mismatch: DocumentProofMismatch) -> LocalTextPublicationError {
    match mismatch {
        DocumentProofMismatch::SchemaId { document_schema, active_schema } => {
            LocalTextPublicationError::SchemaMismatch { document_schema, active_schema }
        }
        mismatch => LocalTextPublicationError::DocumentProofMismatch(mismatch),
    }
}

fn prove_summary(
    source: &Document,
    schema: &CompiledSchema,
    limits: &DocumentLimits,
    path: &NodePath,
    candidate_root: &NodeRef,
) -> Option<DocumentSummary> {
    if !source.is_proven_for(schema, limits)
        || !schema.supports_base_text_operations()
        || path.len() != 1
    {
        return None;
    }

    let source_root = source.root().as_element()?;
    let result_root = candidate_root.as_element()?;
    if source_root.kind() != schema.root_kind()
        || result_root.kind() != source_root.kind()
        || source_root.entity_id().is_some()
        || result_root.entity_id() != source_root.entity_id()
        || !source_root.properties().is_empty()
        || result_root.properties() != source_root.properties()
        || source_root.children().is_empty()
        || result_root.children().len() != source_root.children().len()
    {
        return None;
    }

    let paragraph_index = usize::try_from(path.last_index()?).ok()?;
    let source_paragraph = source_root.children().get(paragraph_index)?.as_element()?;
    let result_paragraph = result_root.children().get(paragraph_index)?.as_element()?;
    if !schema.is_text_container(source_paragraph.kind())
        || result_paragraph.kind() != source_paragraph.kind()
        || source_paragraph.entity_id().is_some()
        || result_paragraph.entity_id() != source_paragraph.entity_id()
        || !source_paragraph.properties().is_empty()
        || result_paragraph.properties() != source_paragraph.properties()
    {
        return None;
    }

    let source_measurement = measure_source_paragraph(source_paragraph)?;
    let result_measurement = measure_result_paragraph(schema, limits, result_paragraph)?;
    calculate_summary(
        source,
        limits,
        source_root.children().len(),
        source_measurement,
        result_measurement,
    )
}

#[derive(Clone, Copy)]
struct ParagraphMeasurement {
    run_count: u64,
    text_bytes: u64,
}

fn measure_source_paragraph(paragraph: &ElementNode) -> Option<ParagraphMeasurement> {
    let mut text_bytes = 0_u64;
    for child in paragraph.children() {
        let text = child.as_text()?;
        text_bytes = text_bytes.checked_add(u64::try_from(text.text().len()).ok()?)?;
    }
    Some(ParagraphMeasurement {
        run_count: u64::try_from(paragraph.children().len()).ok()?,
        text_bytes,
    })
}

fn measure_result_paragraph(
    schema: &CompiledSchema,
    limits: &DocumentLimits,
    paragraph: &ElementNode,
) -> Option<ParagraphMeasurement> {
    if paragraph.children().len() > limits.max_children_per_element()
        || !child_count_fits_point_protocol(paragraph.children().len())
    {
        return None;
    }

    let mut text_bytes = 0_u64;
    let mut utf16_length = TextOffset::ZERO;
    let mut previous_formats = None;
    for child in paragraph.children() {
        let text = child.as_text()?;
        if text.text().is_empty()
            || text.text().len() > limits.max_text_bytes()
            || text.formats().len() > limits.max_formats_per_text()
            || previous_formats.is_some_and(|previous| previous == text.formats())
        {
            return None;
        }
        for format in text.formats() {
            if !schema.allows_text_format(format.kind()) || !format.properties().is_empty() {
                return None;
            }
        }
        previous_formats = Some(text.formats());
        text_bytes = text_bytes.checked_add(u64::try_from(text.text().len()).ok()?)?;
        utf16_length = utf16_length.checked_add(u64::from(text.utf16_len())).ok()?;
    }
    Some(ParagraphMeasurement {
        run_count: u64::try_from(paragraph.children().len()).ok()?,
        text_bytes,
    })
}

fn calculate_summary(
    source: &Document,
    limits: &DocumentLimits,
    paragraph_count: usize,
    source_paragraph: ParagraphMeasurement,
    result_paragraph: ParagraphMeasurement,
) -> Option<DocumentSummary> {
    let base = source.summary();
    if base.property_value_count() != 0 {
        return None;
    }

    let paragraph_count = u64::try_from(paragraph_count).ok()?;
    let element_count = paragraph_count.checked_add(1)?;
    let source_text_nodes = base.node_count().checked_sub(element_count)?;
    let expected_source_depth = if source_text_nodes == 0 { 1 } else { 2 };
    if base.max_node_depth() != expected_source_depth {
        return None;
    }

    let result_text_nodes = source_text_nodes
        .checked_sub(source_paragraph.run_count)?
        .checked_add(result_paragraph.run_count)?;
    let node_count = element_count.checked_add(result_text_nodes)?;
    let delta_node_count = base
        .node_count()
        .checked_sub(source_paragraph.run_count)?
        .checked_add(result_paragraph.run_count)?;
    if node_count != delta_node_count || !fits_limit(node_count, limits.max_nodes()) {
        return None;
    }

    let total_text_bytes = base
        .total_text_bytes()
        .checked_sub(source_paragraph.text_bytes)?
        .checked_add(result_paragraph.text_bytes)?;
    if !fits_limit(total_text_bytes, limits.max_total_text_bytes()) {
        return None;
    }

    let max_node_depth = if result_text_nodes == 0 { 1 } else { 2 };
    if usize::try_from(max_node_depth).ok()? > limits.max_node_depth() {
        return None;
    }
    Some(DocumentSummary::from_validation(node_count, max_node_depth, total_text_bytes, 0))
}

fn fits_limit(actual: u64, maximum: usize) -> bool {
    u64::try_from(maximum).map_or(true, |maximum| actual <= maximum)
}

fn replace_element_children(
    node: &NodeRef,
    path: &[u32],
    depth: usize,
    replacement: Vec<NodeRef>,
) -> Result<NodeRef, LocalTextPublicationError> {
    let element = node.as_element().ok_or(LocalTextPublicationError::ExpectedElementOnPath)?;
    if depth == path.len() {
        return element.try_with_children(replacement).map(NodeRef::element).map_err(Into::into);
    }

    let index =
        usize::try_from(path[depth]).map_err(|_| LocalTextPublicationError::MissingPathChild)?;
    let child = element.children().get(index).ok_or(LocalTextPublicationError::MissingPathChild)?;
    let replaced = replace_element_children(child, path, depth + 1, replacement)?;
    let mut children = element.children().to_vec();
    let slot = children.get_mut(index).ok_or(LocalTextPublicationError::MissingPathChild)?;
    *slot = replaced;
    element.try_with_children(children).map(NodeRef::element).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use crate::{
        document::{
            Document, ElementNode, Format, FormatSet, NodeRef, PropertyMap, TextNode,
            local_text_splice::{LocalTextPublicationError, LocalTextPublicationKind},
        },
        extension::{
            ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
            InlineFormatSpecV1,
        },
        identity::QualifiedName,
        position::NodePath,
        schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    };

    fn source_document(
        schema: &CompiledSchema,
        limits: &DocumentLimits,
    ) -> Result<Document, Box<dyn Error>> {
        let text = NodeRef::text(TextNode::try_new("a".to_owned(), FormatSet::default())?);
        let paragraph = NodeRef::element(ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            vec![text],
        )?);
        let root = NodeRef::element(ElementNode::try_new(
            QualifiedName::from_known_static("breditor/document"),
            None,
            PropertyMap::default(),
            vec![paragraph],
        )?);
        Document::try_new(schema, root, limits).map_err(Into::into)
    }

    fn replacement() -> Result<Vec<NodeRef>, Box<dyn Error>> {
        Ok(vec![NodeRef::text(TextNode::try_new("bb".to_owned(), FormatSet::default())?)])
    }

    fn extension_schema() -> Result<CompiledSchema, Box<dyn Error>> {
        let manifest = ExtensionManifest::try_new_with_inline_formats(
            ExtensionId::new(
                QualifiedName::try_new("example/local-proof-extension")?,
                ExtensionVersion::try_new(1)?,
            ),
            Vec::new(),
            Vec::new(),
            vec![InlineFormatSpecV1::new(
                QualifiedName::try_new("example/emphasis")?,
                PersistedTypeRevision::one(),
            )],
        )?;
        let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
        CompiledSchema::try_compile_base_text_profile(
            SchemaId::new(
                QualifiedName::try_new("example/local-proof-profile")?,
                SchemaVersion::try_new(1)?,
            ),
            &extensions,
        )
        .map_err(Into::into)
    }

    fn extension_replacement() -> Result<Vec<NodeRef>, Box<dyn Error>> {
        let formats = FormatSet::try_from_formats(vec![Format::new(
            QualifiedName::try_new("example/emphasis")?,
            PropertyMap::default(),
        )])?;
        Ok(vec![NodeRef::text(TextNode::try_new("bb".to_owned(), formats)?)])
    }

    #[test]
    fn matching_profile_uses_incremental_proof() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let source = source_document(&schema, &limits)?;
        let path = NodePath::try_from_indices(vec![0])?;
        let publication =
            source.try_replace_base_paragraph_children(&schema, &limits, &path, replacement()?)?;
        assert_eq!(publication.kind(), LocalTextPublicationKind::IncrementalProof);
        let document = publication.into_document();
        assert_eq!(document.summary().total_text_bytes(), 2);
        assert!(document.is_proven_for(&schema, &limits));
        Ok(())
    }

    #[test]
    fn sealed_extension_profile_uses_incremental_proof_for_registered_formats()
    -> Result<(), Box<dyn Error>> {
        let schema = extension_schema()?;
        let limits = DocumentLimits::default();
        let source = source_document(&schema, &limits)?;
        let path = NodePath::try_from_indices(vec![0])?;
        let publication = source.try_replace_base_paragraph_children(
            &schema,
            &limits,
            &path,
            extension_replacement()?,
        )?;
        assert_eq!(publication.kind(), LocalTextPublicationKind::IncrementalProof);
        let document = publication.into_document();
        assert_eq!(document.summary().total_text_bytes(), 2);
        assert!(document.is_proven_for(&schema, &limits));
        Ok(())
    }

    #[test]
    fn mismatched_profile_is_rejected_before_local_publication() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let source_limits = DocumentLimits::default();
        let active_limits = source_limits.clone().with_max_text_bytes(10);
        let source = source_document(&schema, &source_limits)?;
        let path = NodePath::try_from_indices(vec![0])?;
        let Err(error) = source.try_replace_base_paragraph_children(
            &schema,
            &active_limits,
            &path,
            replacement()?,
        ) else {
            return Err(io::Error::other(
                "different validation policy unexpectedly reached local publication",
            )
            .into());
        };
        assert_eq!(
            error,
            LocalTextPublicationError::DocumentProofMismatch(
                crate::document::DocumentProofMismatch::ValidationPolicy,
            )
        );
        Ok(())
    }

    #[test]
    fn independently_compiled_schema_is_rejected_before_local_publication()
    -> Result<(), Box<dyn Error>> {
        let source_schema = CompiledSchema::breditor_base();
        let active_schema = CompiledSchema::breditor_base();
        let limits = DocumentLimits::default();
        let source = source_document(&source_schema, &limits)?;
        let path = NodePath::try_from_indices(vec![0])?;

        let Err(error) = source.try_replace_base_paragraph_children(
            &active_schema,
            &limits,
            &path,
            replacement()?,
        ) else {
            return Err(io::Error::other(
                "independent compiled proof unexpectedly reached local publication",
            )
            .into());
        };
        assert_eq!(
            error,
            LocalTextPublicationError::DocumentProofMismatch(
                crate::document::DocumentProofMismatch::CompiledProof,
            )
        );
        Ok(())
    }

    #[test]
    fn json_input_budget_does_not_change_the_runtime_profile() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let source_limits = DocumentLimits::default().with_max_json_bytes(1_000);
        let active_limits = source_limits.clone().with_max_json_bytes(2_000);
        let source = source_document(&schema, &source_limits)?;
        let path = NodePath::try_from_indices(vec![0])?;
        let publication = source.try_replace_base_paragraph_children(
            &schema,
            &active_limits,
            &path,
            replacement()?,
        )?;
        assert_eq!(publication.kind(), LocalTextPublicationKind::IncrementalProof);
        Ok(())
    }
}
