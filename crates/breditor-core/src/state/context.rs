use std::sync::Arc;

use crate::{
    profile::CompiledProfileGeneration,
    schema::{CompiledSchema, DocumentLimits},
};

/// Immutable schema and resource limits used to execute editor transactions.
///
/// Keeping this context outside [`crate::document::Document`] lets many
/// snapshots share one compiled schema while ensuring operations never borrow
/// configuration from a JSON codec.
#[derive(Clone, Debug)]
pub struct EditorContext {
    schema: Arc<CompiledSchema>,
    limits: DocumentLimits,
    max_operations_per_transaction: u32,
    profile_generation: Option<CompiledProfileGeneration>,
}

impl EditorContext {
    /// Creates an execution context from a compiled schema and limits.
    #[must_use]
    pub fn new(schema: CompiledSchema, limits: DocumentLimits) -> Self {
        Self {
            schema: Arc::new(schema),
            limits,
            max_operations_per_transaction: 1_024,
            profile_generation: None,
        }
    }

    /// Creates a context bound to one compiled profile generation.
    pub(crate) fn with_profile_generation(
        schema: CompiledSchema,
        limits: DocumentLimits,
        profile_generation: CompiledProfileGeneration,
    ) -> Self {
        Self {
            schema: Arc::new(schema),
            limits,
            max_operations_per_transaction: 1_024,
            profile_generation: Some(profile_generation),
        }
    }

    /// Returns the compiled schema.
    #[must_use]
    pub fn schema(&self) -> &CompiledSchema {
        &self.schema
    }

    /// Returns the document limits enforced by every published state.
    #[must_use]
    pub const fn limits(&self) -> &DocumentLimits {
        &self.limits
    }

    /// Returns the maximum operations executed by one atomic transaction.
    #[must_use]
    pub const fn max_operations_per_transaction(&self) -> u32 {
        self.max_operations_per_transaction
    }

    /// Returns the opaque process-local profile generation, when this context
    /// was created by a compiled profile.
    #[must_use]
    pub const fn profile_generation(&self) -> Option<&CompiledProfileGeneration> {
        self.profile_generation.as_ref()
    }

    /// Sets the maximum operations executed by one atomic transaction.
    #[must_use]
    pub const fn with_max_operations_per_transaction(mut self, maximum: u32) -> Self {
        self.max_operations_per_transaction = maximum;
        self
    }

    /// Returns whether both contexts carry the same process-local compiled
    /// schema proof, without comparing limits or transaction policy.
    pub(crate) fn shares_schema_proof(&self, other: &Self) -> bool {
        self.schema.shares_proof(other.schema.proof())
    }
}

impl PartialEq for EditorContext {
    fn eq(&self, other: &Self) -> bool {
        self.shares_schema_proof(other)
            && self.limits == other.limits
            && self.max_operations_per_transaction == other.max_operations_per_transaction
            && self.profile_generation == other.profile_generation
    }
}

impl Eq for EditorContext {}

impl Default for EditorContext {
    fn default() -> Self {
        Self::new(CompiledSchema::default(), DocumentLimits::default())
    }
}

#[cfg(test)]
mod tests {
    use super::EditorContext;
    use crate::schema::{CompiledSchema, DocumentLimits};

    #[test]
    fn default_pins_the_official_v0_1_transaction_acceptance_floor() {
        assert_eq!(EditorContext::default().max_operations_per_transaction(), 1_024);
    }

    #[test]
    fn equality_requires_the_same_compiled_proof_and_exact_policy() {
        let schema = CompiledSchema::breditor_base();
        let context = EditorContext::new(schema.clone(), DocumentLimits::default());
        let clone = context.clone();
        let independently_compiled =
            EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
        let different_json_budget =
            EditorContext::new(schema.clone(), DocumentLimits::default().with_max_json_bytes(1));
        let different_operation_limit = EditorContext::new(schema, DocumentLimits::default())
            .with_max_operations_per_transaction(1);

        assert_eq!(context.schema(), independently_compiled.schema());
        assert_eq!(context, clone);
        assert_ne!(context, independently_compiled);
        assert_ne!(context, different_json_budget);
        assert_ne!(context, different_operation_limit);
    }
}
