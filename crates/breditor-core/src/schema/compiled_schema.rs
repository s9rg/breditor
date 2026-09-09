use std::{fmt, sync::Arc};

use crate::{
    extension::ExtensionSet,
    identity::QualifiedName,
    schema::{DurableSchemaBinding, SchemaCompilationError, SchemaFingerprint, SchemaId},
};

use super::compiler::{
    ChildConstraint, CompiledSchemaDefinition, GlobalConstraints, compile_base_text_profile,
    compile_breditor_base, is_exact_breditor_base, supports_base_text_operations,
};

/// The immutable schema used to validate a document.
///
/// Semantic equality compares the complete compiled definition and deliberately
/// excludes the process-local proof allocation. Two independently created
/// compiled-schema instances may therefore be semantically equal while
/// remaining unable to exchange proof identity.
#[derive(Clone)]
pub struct CompiledSchema {
    definition: Arc<CompiledSchemaDefinition>,
    fingerprint: SchemaFingerprint,
    proof: CompiledSchemaProof,
    supports_base_text_operations: bool,
}

/// Cloneable crate-private handle to one process-local schema-proof allocation.
///
/// Equality is deliberately unavailable: proof comparisons must go through
/// [`CompiledSchema::shares_proof`] so an allocation address never becomes
/// data, diagnostics, or a durable identifier.
#[derive(Clone)]
pub(crate) struct CompiledSchemaProof(Arc<CompiledSchemaProofAllocation>);

struct CompiledSchemaProofAllocation;

impl CompiledSchemaProof {
    fn fresh() -> Self {
        Self(Arc::new(CompiledSchemaProofAllocation))
    }
}

impl fmt::Debug for CompiledSchemaProof {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("CompiledSchemaProof").field(&"<process-local>").finish()
    }
}

impl CompiledSchema {
    /// Returns the minimal Breditor proof schema.
    ///
    /// The trusted built-in declaration is passed through the same private,
    /// declarative compiler used by schema-compiler parity tests. It accepts one
    /// document root, one or more paragraphs, non-empty text leaves, and the
    /// `breditor/strong` format.
    #[must_use]
    pub fn breditor_base() -> Self {
        compile_breditor_base()
    }

    /// Compiles a sealed base-text schema from one resolved extension set.
    ///
    /// The root, paragraph, text, built-in strong-format, element-property,
    /// entity, and canonicality laws remain fixed by Breditor. Each manifest may
    /// add [`crate::extension::InlineFormatSpecV1`] declarations and optional
    /// closed typed property contracts for those formats.
    /// `schema_id` must use a non-`breditor/*` name: `breditor/base@1` continues
    /// to mean exactly the original strong-only schema. The complete operation
    /// is deterministic and publishes no partial schema on failure.
    ///
    /// # Errors
    ///
    /// Returns [`SchemaCompilationError`] for a reserved schema or extension
    /// identity, an aggregate format-limit violation, duplicate ownership, or
    /// an attempted core-format impersonation.
    pub fn try_compile_base_text_profile(
        schema_id: SchemaId,
        extensions: &ExtensionSet,
    ) -> Result<Self, SchemaCompilationError> {
        compile_base_text_profile(schema_id, extensions)
    }

    /// Returns a test-only schema with the base selector and different content meaning.
    ///
    /// This narrow factory exists only so crate tests can prove that a matching
    /// [`SchemaId`] cannot substitute for a fingerprint or process-local proof.
    #[cfg(test)]
    pub(crate) fn test_semantic_variant_same_id() -> Self {
        super::compiler::compile_test_semantic_variant_same_id()
    }

    pub(super) fn from_compilation(
        definition: Arc<CompiledSchemaDefinition>,
        fingerprint: SchemaFingerprint,
    ) -> Self {
        let supports_base_text_operations = supports_base_text_operations(&definition);
        Self {
            definition,
            fingerprint,
            proof: CompiledSchemaProof::fresh(),
            supports_base_text_operations,
        }
    }

    pub(super) const fn definition(&self) -> &Arc<CompiledSchemaDefinition> {
        &self.definition
    }

    /// Returns the persisted schema selector.
    ///
    /// This human-readable identity is not sufficient to prove content meaning;
    /// use [`Self::fingerprint`] for durable admission and the core's private
    /// proof identity for process-local validated values.
    #[must_use]
    pub fn id(&self) -> &SchemaId {
        self.definition.id()
    }

    /// Returns the collision-resistant identity of this compiled definition.
    #[must_use]
    pub const fn fingerprint(&self) -> SchemaFingerprint {
        self.fingerprint
    }

    /// Returns the owned durable selector-and-fingerprint binding.
    ///
    /// This value deliberately excludes the process-local compiled proof.
    #[must_use]
    pub fn durable_binding(&self) -> DurableSchemaBinding {
        DurableSchemaBinding::from_compiled(self)
    }

    /// Returns the required root element kind.
    #[must_use]
    pub fn root_kind(&self) -> &QualifiedName {
        self.definition.root_kind()
    }

    /// Returns whether a format is registered and permits no properties.
    ///
    /// This read-only query does not authorize an action or establish
    /// ownership. It reports only the compiled document-language rule.
    #[must_use]
    pub fn is_property_free_inline_format(&self, kind: &QualifiedName) -> bool {
        self.definition
            .inline_format(kind)
            .is_some_and(|format| format.property_contract().is_none())
    }

    /// Returns the typed property contract for one admitted inline format.
    ///
    /// `None` means either the format is unknown or it is property-free; use
    /// [`Self::is_property_free_inline_format`] to distinguish those cases.
    #[must_use]
    pub fn inline_format_property_contract(
        &self,
        kind: &QualifiedName,
    ) -> Option<&crate::extension::InlineFormatPropertyContractV1> {
        self.definition.inline_format(kind)?.property_contract()
    }

    /// Iterates every admitted inline-format identity in canonical lexical order.
    pub(crate) fn inline_formats(
        &self,
    ) -> impl ExactSizeIterator<
        Item = (
            &QualifiedName,
            crate::schema::PersistedTypeRevision,
            Option<&crate::extension::InlineFormatPropertyContractV1>,
        ),
    > {
        self.definition
            .inline_formats()
            .map(|(kind, format)| (kind, format.revision(), format.property_contract()))
    }

    pub(crate) fn paragraph_kind(&self) -> &QualifiedName {
        self.definition.paragraph_kind()
    }

    pub(crate) fn strong_kind(&self) -> &QualifiedName {
        self.definition.strong_kind()
    }

    pub(crate) fn is_text_container(&self, kind: &QualifiedName) -> bool {
        self.element_child_constraint(kind)
            .is_some_and(|constraint| matches!(constraint.kind(), super::compiler::ChildKind::Text))
    }

    pub(crate) fn allows_text_format(&self, kind: &QualifiedName) -> bool {
        self.definition.inline_format(kind).is_some()
    }

    pub(crate) fn knows_element(&self, kind: &QualifiedName) -> bool {
        self.definition.element(kind).is_some()
    }

    pub(crate) fn element_allows_properties(&self, kind: &QualifiedName) -> bool {
        self.definition
            .element(kind)
            .is_some_and(super::compiler::ElementDefinition::allows_properties)
    }

    pub(crate) fn element_allows_entity_id(&self, kind: &QualifiedName) -> bool {
        self.definition
            .element(kind)
            .is_some_and(super::compiler::ElementDefinition::allows_entity_id)
    }

    pub(crate) fn format_property_contract(
        &self,
        kind: &QualifiedName,
    ) -> Option<&crate::extension::InlineFormatPropertyContractV1> {
        self.definition.inline_format(kind)?.property_contract()
    }

    pub(super) fn element_child_constraint(
        &self,
        kind: &QualifiedName,
    ) -> Option<&ChildConstraint> {
        self.definition.element(kind).map(super::compiler::ElementDefinition::children)
    }

    pub(super) fn global_constraints(&self) -> GlobalConstraints {
        self.definition.constraints()
    }

    /// Borrows the opaque process-local proof for storage on a proved value.
    pub(crate) const fn proof(&self) -> &CompiledSchemaProof {
        &self.proof
    }

    /// Returns whether `proof` belongs to this exact minted proof lineage.
    pub(crate) fn shares_proof(&self, proof: &CompiledSchemaProof) -> bool {
        Arc::ptr_eq(&self.proof.0, &proof.0)
    }

    pub(crate) fn is_exact_breditor_base(&self) -> bool {
        is_exact_breditor_base(&self.definition)
    }

    pub(crate) const fn supports_base_text_operations(&self) -> bool {
        self.supports_base_text_operations
    }
}

impl fmt::Debug for CompiledSchema {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CompiledSchema")
            .field("id", self.id())
            .field("fingerprint", &self.fingerprint)
            .field("root_kind", self.root_kind())
            .field("proof", &"<process-local>")
            .finish_non_exhaustive()
    }
}

impl PartialEq for CompiledSchema {
    fn eq(&self, other: &Self) -> bool {
        self.definition == other.definition && self.fingerprint == other.fingerprint
    }
}

impl Eq for CompiledSchema {}

impl Default for CompiledSchema {
    fn default() -> Self {
        Self::breditor_base()
    }
}

#[cfg(test)]
mod tests {
    use super::CompiledSchema;

    #[test]
    fn clones_share_proof_and_independent_factories_do_not() {
        let first = CompiledSchema::breditor_base();
        let clone = first.clone();
        let independently_compiled = CompiledSchema::breditor_base();

        assert_eq!(first, clone);
        assert_eq!(first, independently_compiled);
        assert!(first.shares_proof(clone.proof()));
        assert!(!first.shares_proof(independently_compiled.proof()));
    }

    #[test]
    fn debug_does_not_expose_the_proof_allocation() {
        let schema = CompiledSchema::breditor_base();
        let debug = format!("{schema:?}");
        assert!(debug.contains("<process-local>"));
        assert!(!debug.contains("0x"));
    }
}
