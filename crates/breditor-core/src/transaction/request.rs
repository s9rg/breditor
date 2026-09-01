use std::sync::Arc;

use thiserror::Error;

use crate::{
    operation::{
        AppliedOperation, ChangeSet, Operation, OperationApplyError, RelocationMap, RelocationStep,
        SelectionRelocationError, SelectionRelocationPolicy,
    },
    schema::SchemaId,
    state::{EditorContext, EditorState, EditorStateError, RevisionError, SnapshotId},
    transaction::{
        Commit, PendingFormatsUpdate, SelectionUpdate, TransactionMetadata, TransactionOutcome,
    },
};

/// An immutable atomic transaction request against one exact editor snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transaction {
    base: EditorState,
    operations: Arc<[Operation]>,
    selection_relocation: SelectionRelocationPolicy,
    selection_update: SelectionUpdate,
    pending_formats_update: PendingFormatsUpdate,
    metadata: TransactionMetadata,
}

impl Transaction {
    /// Creates an atomic transaction with strict selection-deletion handling.
    ///
    /// By default, selection endpoints strictly inside deleted content reject
    /// the whole transaction instead of silently choosing a fallback.
    #[must_use]
    pub fn new(base: &EditorState, operations: Vec<Operation>) -> Self {
        Self {
            base: base.clone(),
            operations: Arc::from(operations),
            selection_relocation: SelectionRelocationPolicy::default(),
            selection_update: SelectionUpdate::default(),
            pending_formats_update: PendingFormatsUpdate::default(),
            metadata: TransactionMetadata::default(),
        }
    }

    /// Returns the required schema identity.
    #[must_use]
    pub fn schema(&self) -> &SchemaId {
        self.base.document().schema()
    }

    /// Returns the exact snapshot against which operations were authored.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.base.snapshot()
    }

    /// Returns the exact editor state against which the request was authored.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        &self.base
    }

    /// Returns operations in forward application order.
    #[must_use]
    pub fn operations(&self) -> &[Operation] {
        &self.operations
    }

    /// Returns endpoint deletion policy.
    #[must_use]
    pub const fn selection_relocation(&self) -> SelectionRelocationPolicy {
        self.selection_relocation
    }

    /// Returns how the result selection is determined.
    #[must_use]
    pub const fn selection_update(&self) -> &SelectionUpdate {
        &self.selection_update
    }

    /// Returns how the result typing-format override is determined.
    #[must_use]
    pub const fn pending_formats_update(&self) -> &PendingFormatsUpdate {
        &self.pending_formats_update
    }

    /// Returns typed transaction metadata.
    #[must_use]
    pub const fn metadata(&self) -> &TransactionMetadata {
        &self.metadata
    }

    /// Sets explicit endpoint deletion handling.
    #[must_use]
    pub const fn with_selection_relocation(mut self, policy: SelectionRelocationPolicy) -> Self {
        self.selection_relocation = policy;
        self
    }

    /// Sets an explicit result-selection strategy.
    #[must_use]
    pub fn with_selection_update(mut self, update: SelectionUpdate) -> Self {
        self.selection_update = update;
        self
    }

    /// Sets an explicit result typing-format strategy.
    #[must_use]
    pub fn with_pending_formats_update(mut self, update: PendingFormatsUpdate) -> Self {
        self.pending_formats_update = update;
        self
    }

    /// Sets action/history metadata.
    #[must_use]
    pub fn with_metadata(mut self, metadata: TransactionMetadata) -> Self {
        self.metadata = metadata;
        self
    }

    /// Applies every operation atomically and publishes at most one commit.
    ///
    /// The input state is immutable. If any operation, selection relocation, or
    /// final-state proof fails, no partial state, inverse, or change set is
    /// returned.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionApplyError`] for schema/snapshot mismatch or any
    /// failed proof in the batch.
    pub fn apply(
        &self,
        context: &EditorContext,
        state: &EditorState,
    ) -> Result<TransactionOutcome, TransactionApplyError> {
        if self.schema() != context.schema().id() {
            return Err(TransactionApplyError::ContextSchemaMismatch {
                transaction_schema: self.schema().clone(),
                context_schema: context.schema().id().clone(),
            });
        }
        if self.base.context() != context {
            return Err(TransactionApplyError::ContextConfigurationMismatch);
        }
        if state.snapshot() != self.base.snapshot() {
            return Err(TransactionApplyError::StaleSnapshot {
                expected: self.base.snapshot().clone(),
                actual: state.snapshot().clone(),
            });
        }
        if state != &self.base {
            return Err(TransactionApplyError::BaseStateMismatch {
                snapshot: state.snapshot().clone(),
            });
        }
        if self.operations.len() > context.max_operations_per_transaction() {
            return Err(TransactionApplyError::OperationLimit {
                actual: self.operations.len(),
                maximum: context.max_operations_per_transaction(),
            });
        }

        let mut current = state.document().clone();
        let mut forward = Vec::new();
        let mut inverses = Vec::new();
        let mut steps = Vec::new();
        let mut changes = Vec::new();
        for (operation_index, operation) in self.operations.iter().enumerate() {
            let before = current.clone();
            match operation
                .apply(context, &current)
                .map_err(|source| TransactionApplyError::Operation { operation_index, source })?
            {
                AppliedOperation::Unchanged => {}
                AppliedOperation::Changed(change) => {
                    let crate::operation::AppliedChange { document, inverse, relocation, change } =
                        *change;
                    steps.push(RelocationStep::new(before, document.clone(), relocation));
                    current = document;
                    forward.push(operation.clone());
                    inverses.push(inverse);
                    changes.push(change.with_operation_index(operation_index));
                }
            }
        }
        let state_update_changed = match &self.selection_update {
            SelectionUpdate::Relocate => false,
            SelectionUpdate::Set(selection) => selection.as_ref() != state.selection(),
        } || match &self.pending_formats_update {
            PendingFormatsUpdate::Preserve => false,
            PendingFormatsUpdate::Set(formats) => formats.as_ref() != state.pending_formats(),
        };
        if forward.is_empty() && !state_update_changed {
            return Ok(TransactionOutcome::Unchanged);
        }

        let result_snapshot = state.snapshot().successor()?;
        let relocation = RelocationMap::from_steps(
            state.snapshot().clone(),
            result_snapshot.clone(),
            state.document().clone(),
            current.clone(),
            steps,
        );
        let selection = match &self.selection_update {
            SelectionUpdate::Relocate => state
                .selection()
                .map(|selection| {
                    relocation.relocate_selection(state, selection, self.selection_relocation)
                })
                .transpose()?,
            SelectionUpdate::Set(selection) => selection.clone(),
        };
        let pending_formats = match &self.pending_formats_update {
            PendingFormatsUpdate::Preserve => state.pending_formats().cloned(),
            PendingFormatsUpdate::Set(formats) => formats.clone(),
        };
        let after = EditorState::try_from_validated_parts(
            context,
            result_snapshot,
            current,
            selection,
            pending_formats,
        )?;
        inverses.reverse();
        let commit = Commit::new(
            state.clone(),
            after,
            forward,
            inverses,
            relocation,
            ChangeSet::from_changes(changes),
            self.metadata.clone(),
        );
        Ok(TransactionOutcome::Committed(Box::new(commit)))
    }
}

/// Why an atomic transaction could not publish a commit.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TransactionApplyError {
    /// The transaction was authored for a different compiled schema.
    #[error(
        "transaction schema {transaction_schema} does not match context schema {context_schema}"
    )]
    ContextSchemaMismatch {
        /// Schema declared by the transaction.
        transaction_schema: SchemaId,
        /// Schema owned by the execution context.
        context_schema: SchemaId,
    },
    /// Schema identity matches, but operation limits/configuration differ.
    #[error("transaction execution context differs from the context that proved its base state")]
    ContextConfigurationMismatch,
    /// The transaction was authored against a different snapshot.
    #[error("transaction expects snapshot {expected:?}, got {actual:?}")]
    StaleSnapshot {
        /// Required base snapshot.
        expected: SnapshotId,
        /// Actual state snapshot.
        actual: SnapshotId,
    },
    /// A caller reused a snapshot identity for different state content.
    #[error("transaction base state does not equal the supplied state at snapshot {snapshot:?}")]
    BaseStateMismatch {
        /// Reused snapshot identity.
        snapshot: SnapshotId,
    },
    /// The request exceeds the configured atomic work budget.
    #[error("transaction has {actual} operations; the configured maximum is {maximum}")]
    OperationLimit {
        /// Actual operation count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// One operation failed; the complete batch is rejected.
    #[error("operation {operation_index} failed: {source}")]
    Operation {
        /// Zero-based operation index.
        operation_index: usize,
        /// Typed operation failure.
        source: OperationApplyError,
    },
    /// The state selection could not be moved through the content changes.
    #[error(transparent)]
    SelectionRelocation(#[from] SelectionRelocationError),
    /// The complete result state failed publication checks.
    #[error(transparent)]
    InvalidResultState(#[from] EditorStateError),
    /// The lineage-local revision cannot advance.
    #[error(transparent)]
    Revision(#[from] RevisionError),
}
