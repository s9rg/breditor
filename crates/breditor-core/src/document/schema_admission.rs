use crate::{
    document::{Document, DocumentSchemaAdmissionError},
    schema::{CompiledSchema, DocumentLimits, DurableSchemaBinding, require_schema_binding},
};

impl Document {
    /// Structurally admits this document from one exact schema into another.
    ///
    /// The operation borrows and never consumes the source. It first checks the
    /// source's complete durable binding, then fully validates its tree under
    /// the claimed source schema and source policy, and finally validates that
    /// same immutable tree under the target schema and target policy. It does
    /// not transform, normalize, or migrate content.
    ///
    /// On success, the returned document shares the unchanged root allocation
    /// while carrying the target schema's durable identity and process-local
    /// proof. On failure, no target document is published.
    ///
    /// # Errors
    ///
    /// Returns [`DocumentSchemaAdmissionError::SourceBinding`] when the source
    /// claim is not exact, [`DocumentSchemaAdmissionError::SourceValidation`]
    /// when the source tree fails complete source validation, or
    /// [`DocumentSchemaAdmissionError::TargetValidation`] when the unchanged
    /// tree is outside the target content language or policy.
    pub fn try_admit_to_schema(
        &self,
        source_schema: &CompiledSchema,
        source_limits: &DocumentLimits,
        target_schema: &CompiledSchema,
        target_limits: &DocumentLimits,
    ) -> Result<Self, DocumentSchemaAdmissionError> {
        let source_binding =
            DurableSchemaBinding::new(self.schema().clone(), self.schema_fingerprint());
        require_schema_binding(source_schema, &source_binding)
            .map_err(DocumentSchemaAdmissionError::SourceBinding)?;

        let source = Self::try_new(source_schema, self.root().clone(), source_limits)
            .map_err(DocumentSchemaAdmissionError::SourceValidation)?;
        Self::try_new(target_schema, source.root().clone(), target_limits)
            .map_err(DocumentSchemaAdmissionError::TargetValidation)
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        codec::DocumentJsonCodec,
        document::{DocumentSchemaAdmissionError, NodeRef},
        schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    };

    const ONE_PARAGRAPH_V1: &str = concat!(
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
        r#"]}}"#,
    );
    const TWO_PARAGRAPHS_V1: &str = concat!(
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]},"#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
        r#"]}}"#,
    );

    fn shares_root(left: &NodeRef, right: &NodeRef) -> bool {
        left.shares_allocation_with(right)
    }

    #[test]
    fn admission_revalidates_source_then_shares_unchanged_tree_with_target()
    -> Result<(), Box<dyn Error>> {
        let decoder = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let source = decoder.decode(TWO_PARAGRAPHS_V1)?;
        let independent_source_schema = CompiledSchema::breditor_base();
        let target_schema = CompiledSchema::test_semantic_variant_same_id();

        let admitted = source.try_admit_to_schema(
            &independent_source_schema,
            &DocumentLimits::default(),
            &target_schema,
            &DocumentLimits::default(),
        )?;

        assert_eq!(admitted.schema(), target_schema.id());
        assert_eq!(admitted.schema_fingerprint(), target_schema.fingerprint());
        assert!(shares_root(source.root(), admitted.root()));
        assert_ne!(source.schema_fingerprint(), admitted.schema_fingerprint());
        Ok(())
    }

    #[test]
    fn target_failure_leaves_the_borrowed_source_unchanged() -> Result<(), Box<dyn Error>> {
        let decoder = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let source = decoder.decode(ONE_PARAGRAPH_V1)?;
        let before = source.clone();

        assert!(matches!(
            source.try_admit_to_schema(
                decoder.schema(),
                decoder.limits(),
                &CompiledSchema::test_semantic_variant_same_id(),
                &DocumentLimits::default(),
            ),
            Err(DocumentSchemaAdmissionError::TargetValidation(_))
        ));
        assert_eq!(source, before);
        assert!(shares_root(source.root(), before.root()));
        Ok(())
    }

    #[test]
    fn source_binding_failure_is_non_destructive() -> Result<(), Box<dyn Error>> {
        let decoder = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let source = decoder.decode(ONE_PARAGRAPH_V1)?;
        let before = source.clone();

        assert!(matches!(
            source.try_admit_to_schema(
                &CompiledSchema::test_semantic_variant_same_id(),
                &DocumentLimits::default(),
                &CompiledSchema::breditor_base(),
                &DocumentLimits::default(),
            ),
            Err(DocumentSchemaAdmissionError::SourceBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        assert_eq!(source, before);
        assert!(shares_root(source.root(), before.root()));
        Ok(())
    }

    #[test]
    fn source_policy_is_always_revalidated() -> Result<(), Box<dyn Error>> {
        let decoder = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let source = decoder.decode(ONE_PARAGRAPH_V1)?;

        assert!(matches!(
            source.try_admit_to_schema(
                decoder.schema(),
                &DocumentLimits::default().with_max_nodes(1),
                &CompiledSchema::breditor_base(),
                &DocumentLimits::default(),
            ),
            Err(DocumentSchemaAdmissionError::SourceValidation(_))
        ));
        Ok(())
    }
}
