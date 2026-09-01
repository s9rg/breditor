use std::sync::Arc;

use crate::schema::{CompiledSchema, DocumentLimits};

/// Immutable schema and resource limits used to execute editor transactions.
///
/// Keeping this context outside [`crate::document::Document`] lets many
/// snapshots share one compiled schema while ensuring operations never borrow
/// configuration from a JSON codec.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EditorContext {
    schema: Arc<CompiledSchema>,
    limits: DocumentLimits,
    max_operations_per_transaction: usize,
}

impl EditorContext {
    /// Creates an execution context from a compiled schema and limits.
    #[must_use]
    pub fn new(schema: CompiledSchema, limits: DocumentLimits) -> Self {
        Self { schema: Arc::new(schema), limits, max_operations_per_transaction: 1_024 }
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
    pub const fn max_operations_per_transaction(&self) -> usize {
        self.max_operations_per_transaction
    }

    /// Sets the maximum operations executed by one atomic transaction.
    #[must_use]
    pub const fn with_max_operations_per_transaction(mut self, maximum: usize) -> Self {
        self.max_operations_per_transaction = maximum;
        self
    }
}

impl Default for EditorContext {
    fn default() -> Self {
        Self::new(CompiledSchema::default(), DocumentLimits::default())
    }
}
