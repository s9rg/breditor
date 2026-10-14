use std::{fmt, sync::Arc};

use crate::{
    extension::ExtensionSet,
    identity::QualifiedName,
    schema::{DurableSchemaBinding, SchemaCompilationError, SchemaFingerprint, SchemaId},
};

use super::child_grammar::{ChildConstraint, ChildKind};
use super::compiler::{
    CompiledSchemaDefinition, GlobalConstraints, compile_base_text_profile, compile_breditor_base,
    is_exact_breditor_base, supports_base_text_operations, supports_paragraph_structure_operations,
    supports_text_splice_operations,
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
    supports_text_splice_operations: bool,
    supports_paragraph_structure_operations: bool,
    supports_base_text_operations: bool,
    #[cfg(feature = "experimental-structural-properties")]
    text_block_kind_capability: Option<TextBlockKindCapability>,
    #[cfg(feature = "experimental-structural-properties")]
    flat_list_capability: Option<FlatListCapability>,
    #[cfg(feature = "experimental-rich-content")]
    rich_content_capability: Option<RichContentCapability>,
}

/// Presence records the compiler's exact experimental structural-language proof.
#[cfg(feature = "experimental-structural-properties")]
#[derive(Clone)]
struct TextBlockKindCapability;

#[cfg(feature = "experimental-structural-properties")]
#[derive(Clone)]
struct FlatListCapability;

#[cfg(feature = "experimental-rich-content")]
#[derive(Clone)]
struct RichContentCapability;

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

    /// Compiles the experimental direct-root paragraph/heading language.
    ///
    /// This feature-gated Rust research surface admits only block-kind changes;
    /// existing paragraph-only editing operations reject it. It is not a
    /// browser profile. Existing V1–V3 operation/history codecs cannot encode
    /// its new operations. Inline-format extensions retain their exact contracts.
    ///
    /// # Errors
    ///
    /// Returns [`SchemaCompilationError`] for the same reserved identities,
    /// duplicate formats and aggregate limits as the base-text compiler.
    #[cfg(feature = "experimental-structural-properties")]
    pub fn try_compile_text_block_profile(
        schema_id: SchemaId,
        extensions: &ExtensionSet,
    ) -> Result<Self, SchemaCompilationError> {
        super::compiler::compile_text_block_profile(schema_id, extensions)
    }

    /// Compiles the experimental flat-list document language.
    ///
    /// Root children are paragraphs, headings or bullet/ordered lists. Each list
    /// has at least one item; each item owns exactly one paragraph or heading.
    /// Ordered-list start and final ordinals must be in `1..=2147483647`.
    /// Nested lists, multiple blocks per item, item numbering overrides and
    /// entity IDs are rejected. Inline extensions retain their exact contracts.
    ///
    /// This grants only the separate flat-list operation capability, not the
    /// existing paragraph/heading capabilities. Durable history and browser
    /// integration are separate gates.
    /// Existing schema fingerprints and document languages remain unchanged.
    ///
    /// # Errors
    ///
    /// Returns [`SchemaCompilationError`] for reserved identities, duplicate
    /// formats or aggregate limits, as with the base-text compiler.
    #[cfg(feature = "experimental-structural-properties")]
    pub fn try_compile_flat_list_profile(
        schema_id: SchemaId,
        extensions: &ExtensionSet,
    ) -> Result<Self, SchemaCompilationError> {
        super::compiler::compile_flat_list_profile(schema_id, extensions)
    }

    /// Compiles experimental nested-list document admission.
    ///
    /// Each item has one paragraph or heading followed by zero or more child
    /// lists. This does not grant flat-list editing capabilities or browser,
    /// history/replay, or session-codec support. Existing profiles are unchanged.
    ///
    /// # Errors
    /// Returns [`SchemaCompilationError`] for reserved identities, invalid
    /// extension declarations or compiler limits.
    #[cfg(feature = "experimental-structural-properties")]
    pub fn try_compile_nested_list_profile(
        schema_id: SchemaId,
        extensions: &ExtensionSet,
    ) -> Result<Self, SchemaCompilationError> {
        super::compiler::compile_nested_list_profile(schema_id, extensions)
    }

    /// Compiles the separate opt-in rich-content AST admission language.
    ///
    /// Flow blocks have stable content IDs. Tables retain all base cells and
    /// non-destructive merge intents; images carry checked immutable asset
    /// bindings and an optional paragraph caption. Nested tables are forbidden
    /// anywhere below another table, including through lists. The compiler
    /// fingerprint includes the sealed rich-rule revision. Existing profiles,
    /// editing capabilities and session/history codecs are not widened.
    ///
    /// # Errors
    /// Rejects reserved schema identities, invalid extensions or compiler limits.
    #[cfg(feature = "experimental-rich-content")]
    pub fn try_compile_rich_content_profile(
        schema_id: SchemaId,
        extensions: &ExtensionSet,
    ) -> Result<Self, SchemaCompilationError> {
        super::compiler::compile_rich_content_profile(schema_id, extensions)
    }

    /// Whether this schema proves the exact sealed rich-content language.
    ///
    /// This read-only query does not grant editing or replication authority.
    #[cfg(feature = "experimental-rich-content")]
    #[must_use]
    pub const fn is_rich_content_profile(&self) -> bool {
        self.rich_content_capability.is_some()
    }

    /// Recognizes the exact nested grammar for the experimental reframe primitive.
    #[cfg(feature = "experimental-structural-properties")]
    pub(crate) fn supports_nested_list_reframe(&self) -> bool {
        super::compiler::supports_nested_list_reframe(&self.definition)
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
        let supports_text_splice_operations = supports_text_splice_operations(&definition);
        let supports_paragraph_structure_operations =
            supports_paragraph_structure_operations(&definition);
        let supports_base_text_operations = supports_base_text_operations(&definition);
        #[cfg(feature = "experimental-structural-properties")]
        let text_block_kind_capability =
            super::compiler::supports_text_block_kind_operations(&definition)
                .then_some(TextBlockKindCapability);
        #[cfg(feature = "experimental-structural-properties")]
        let flat_list_capability = super::compiler::supports_flat_list_operations(&definition)
            .then_some(FlatListCapability);
        #[cfg(feature = "experimental-rich-content")]
        let rich_content_capability =
            super::compiler::supports_rich_content(&definition).then_some(RichContentCapability);
        Self {
            definition,
            fingerprint,
            proof: CompiledSchemaProof::fresh(),
            supports_text_splice_operations,
            supports_paragraph_structure_operations,
            supports_base_text_operations,
            #[cfg(feature = "experimental-structural-properties")]
            text_block_kind_capability,
            #[cfg(feature = "experimental-structural-properties")]
            flat_list_capability,
            #[cfg(feature = "experimental-rich-content")]
            rich_content_capability,
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
            .is_some_and(|constraint| matches!(constraint.single(), Some((ChildKind::Text, _))))
    }

    pub(crate) fn allows_text_format(&self, kind: &QualifiedName) -> bool {
        self.definition.inline_format(kind).is_some()
    }

    /// Borrows one immutable rule set for an entire element validation visit.
    pub(super) fn element_definition(
        &self,
        kind: &QualifiedName,
    ) -> Option<&super::compiler::ElementDefinition> {
        self.definition.element(kind)
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

    /// Returns whether the compiled schema preserves the sealed base text
    /// container shape required by paragraph-local guarded splices.
    ///
    /// Like the structural-operation capability, this permits typed inline
    /// formats because a `TextSplice` carries complete format instances in
    /// both its source guard and replacement.
    pub(crate) const fn supports_text_splice_operations(&self) -> bool {
        self.supports_text_splice_operations
    }

    /// Returns whether the compiled schema preserves the sealed root,
    /// paragraph, and text shape required by paragraph split, join, and
    /// root-text replacement operations.
    ///
    /// Complete typed inline-format instances are admitted because structural
    /// operations carry exact source guards and replacement fragments.
    pub(crate) const fn supports_paragraph_structure_operations(&self) -> bool {
        self.supports_paragraph_structure_operations
    }

    /// Returns whether the schema supports the frozen property-free operation
    /// generations. New typed structural code must use the more specific
    /// capability queries above.
    pub(crate) const fn supports_base_text_operations(&self) -> bool {
        self.supports_base_text_operations
    }

    #[cfg(feature = "experimental-structural-properties")]
    pub(crate) const fn supports_text_block_kind_operations(&self) -> bool {
        self.text_block_kind_capability.is_some()
    }

    #[cfg(feature = "experimental-structural-properties")]
    pub(crate) const fn supports_flat_list_operations(&self) -> bool {
        self.flat_list_capability.is_some()
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
