use std::fmt;

use crate::{profile::CompiledProfileGeneration, session::SessionHistoryStatus, state::SnapshotId};

use super::instance_id::EditorEngineInstanceId;

/// Exact engine, state, and history observation required by guarded commands.
///
/// [`SnapshotId`] changes after state publication, while the embedded opaque
/// history stamp also changes after effective history-only controls. Keeping
/// both prevents a delayed command from silently running against a different
/// undo/redo observation whose document snapshot happens to be unchanged. The
/// private engine identity also invalidates observations when an engine is
/// consumed and its unchanged components are assembled into another engine.
/// Tokens are process-local observations of one live engine, not serialized
/// capabilities, permissions, hashes, or globally unique revisions.
///
/// Construction is reserved to the engine that owns the private instance
/// identity:
///
/// ```compile_fail
/// use breditor_core::{
///     engine::EditorEngineObservation,
///     session::SessionHistoryStatus,
///     state::SnapshotId,
/// };
///
/// fn cannot_forge_observation(snapshot: SnapshotId, history: SessionHistoryStatus) {
///     let _ = EditorEngineObservation::new(snapshot, history);
/// }
/// ```
#[derive(Clone, Eq, PartialEq)]
pub struct EditorEngineObservation {
    profile_generation: Option<CompiledProfileGeneration>,
    instance: EditorEngineInstanceId,
    snapshot: SnapshotId,
    history: SessionHistoryStatus,
}

impl EditorEngineObservation {
    pub(super) const fn new(
        profile_generation: Option<CompiledProfileGeneration>,
        instance: EditorEngineInstanceId,
        snapshot: SnapshotId,
        history: SessionHistoryStatus,
    ) -> Self {
        Self { profile_generation, instance, snapshot, history }
    }

    /// Returns the correlated compiled-profile generation, when the engine was
    /// created through the profile-aware constructor.
    #[must_use]
    pub const fn profile_generation(&self) -> Option<&CompiledProfileGeneration> {
        self.profile_generation.as_ref()
    }

    pub(super) const fn instance(&self) -> &EditorEngineInstanceId {
        &self.instance
    }

    /// Returns the exact observed editor snapshot.
    #[must_use]
    pub const fn snapshot(&self) -> &SnapshotId {
        &self.snapshot
    }

    /// Returns the exact observed linear-history status.
    #[must_use]
    pub const fn history_status(&self) -> &SessionHistoryStatus {
        &self.history
    }
}

impl fmt::Debug for EditorEngineObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EditorEngineObservation")
            .field("profile_generation", &self.profile_generation)
            .field("instance", &self.instance)
            .field("snapshot", &self.snapshot)
            .field("history", &self.history)
            .finish()
    }
}
