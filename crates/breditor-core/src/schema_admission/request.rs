use crate::{
    codec::LocalLogCheckpointLimits,
    local_log::{LocalLogCheckpointAnchor, LocalLogCheckpointBinding},
    session::HistoryCapacity,
    state::{EditorContext, LineageId},
};

use super::{PreparedSchemaAdmission, SchemaAdmissionError};

/// Complete host-selected target for one structural schema admission.
///
/// The request owns configuration only. It is not a storage reservation,
/// writer fence, migration authority, or proof that any target bytes were
/// adopted. [`Self::try_prepare`] borrows both this request and the source, so
/// every failure leaves them available unchanged.
#[derive(Clone, Debug)]
pub struct SchemaAdmissionRequest {
    pub(super) target_context: EditorContext,
    pub(super) target_lineage: LineageId,
    pub(super) target_checkpoint_binding: LocalLogCheckpointBinding,
    pub(super) target_history_capacity: HistoryCapacity,
    pub(super) checkpoint_limits: LocalLogCheckpointLimits,
}

impl SchemaAdmissionRequest {
    /// Creates a target using the default complete checkpoint policy.
    #[must_use]
    pub fn new(
        target_context: EditorContext,
        target_lineage: LineageId,
        target_checkpoint_binding: LocalLogCheckpointBinding,
        target_history_capacity: HistoryCapacity,
    ) -> Self {
        Self {
            target_context,
            target_lineage,
            target_checkpoint_binding,
            target_history_capacity,
            checkpoint_limits: LocalLogCheckpointLimits::default(),
        }
    }

    /// Replaces the target checkpoint admission and compaction policy.
    #[must_use]
    pub const fn with_checkpoint_limits(
        mut self,
        checkpoint_limits: LocalLogCheckpointLimits,
    ) -> Self {
        self.checkpoint_limits = checkpoint_limits;
        self
    }

    /// Returns the exact compiled target proof and runtime policy.
    #[must_use]
    pub const fn target_context(&self) -> &EditorContext {
        &self.target_context
    }

    /// Returns the required fresh editor-state lineage.
    #[must_use]
    pub const fn target_lineage(&self) -> &LineageId {
        &self.target_lineage
    }

    /// Returns the required fresh local session and target generation edge.
    #[must_use]
    pub const fn target_checkpoint_binding(&self) -> &LocalLogCheckpointBinding {
        &self.target_checkpoint_binding
    }

    /// Returns the capacity installed on the new, empty history.
    #[must_use]
    pub const fn target_history_capacity(&self) -> HistoryCapacity {
        self.target_history_capacity
    }

    /// Returns the complete policy used to encode the prepared V2 checkpoint.
    #[must_use]
    pub const fn checkpoint_limits(&self) -> &LocalLogCheckpointLimits {
        &self.checkpoint_limits
    }

    /// Validates and prepares one unchanged-AST schema transition.
    ///
    /// The source checkpoint is only borrowed. Success creates a separate
    /// revision-zero state, empty history, local session, generation edge, and
    /// canonical Local Log Checkpoint V2 value. The caller must separately
    /// adopt those bytes into a new persistence root.
    ///
    /// # Errors
    ///
    /// Returns [`SchemaAdmissionError`] for reused boundary identities, an
    /// unchanged fingerprint, source/target structural rejection, target-state
    /// construction failure, or checkpoint encoding failure. Neither source
    /// nor external storage is changed.
    pub fn try_prepare(
        &self,
        source: &LocalLogCheckpointAnchor,
    ) -> Result<PreparedSchemaAdmission, SchemaAdmissionError> {
        super::prepare::prepare(source, self)
    }
}
