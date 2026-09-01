use std::sync::Arc;

use crate::{
    operation::{Operation, SelectionRelocationPolicy},
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

/// Complete detached recipe for one exact-base action transaction.
///
/// Every state and history policy is explicit. The registry binds this recipe
/// to the evaluated [`crate::state::EditorState`] and stamps action metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionPlan {
    operations: Arc<[Operation]>,
    selection_relocation: SelectionRelocationPolicy,
    selection_update: SelectionUpdate,
    pending_formats_update: PendingFormatsUpdate,
    history: HistoryIntent,
}

impl ActionPlan {
    /// Creates a complete action plan with no implicit state policy.
    #[must_use]
    pub fn new(
        operations: Vec<Operation>,
        selection_relocation: SelectionRelocationPolicy,
        selection_update: SelectionUpdate,
        pending_formats_update: PendingFormatsUpdate,
        history: HistoryIntent,
    ) -> Self {
        Self {
            operations: Arc::from(operations),
            selection_relocation,
            selection_update,
            pending_formats_update,
            history,
        }
    }

    /// Returns operations in forward application order.
    #[must_use]
    pub fn operations(&self) -> &[Operation] {
        &self.operations
    }

    /// Returns endpoint deletion handling for relocated selections.
    #[must_use]
    pub const fn selection_relocation(&self) -> SelectionRelocationPolicy {
        self.selection_relocation
    }

    /// Returns the explicit result-selection policy.
    #[must_use]
    pub const fn selection_update(&self) -> &SelectionUpdate {
        &self.selection_update
    }

    /// Returns the explicit result pending-format policy.
    #[must_use]
    pub const fn pending_formats_update(&self) -> &PendingFormatsUpdate {
        &self.pending_formats_update
    }

    /// Returns how a successful commit participates in history.
    #[must_use]
    pub const fn history(&self) -> &HistoryIntent {
        &self.history
    }

    pub(crate) fn into_parts(
        self,
    ) -> (
        Vec<Operation>,
        SelectionRelocationPolicy,
        SelectionUpdate,
        PendingFormatsUpdate,
        HistoryIntent,
    ) {
        (
            self.operations.to_vec(),
            self.selection_relocation,
            self.selection_update,
            self.pending_formats_update,
            self.history,
        )
    }
}
