use crate::local_log::{LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalSessionId};

use super::{
    LocalLogStorageGenerationFrameV2, LocalLogStorageSelectedActiveGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationState,
};

/// Complete Frame V2 facts for a selection envelope's checkpoint generation.
///
/// This wrapper prevents a Frame V2 policy from being projected through the
/// legacy Frame V1 accessor on the internal compatibility representation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectedCheckpointGenerationBindingV2 {
    inner: LocalLogStorageSelectedCheckpointGenerationBinding,
}

impl LocalLogStorageSelectedCheckpointGenerationBindingV2 {
    /// Creates permanent checkpoint-only facts for a selected V2 root.
    #[must_use]
    pub const fn checkpoint_only(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        established_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self {
            inner: LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
                log_id,
                session_id,
                established_by_head_id,
            ),
        }
    }

    /// Creates complete retired facts for a selected V2 rotation.
    #[must_use]
    pub const fn retired(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV2,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
        retired_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self {
            inner: LocalLogStorageSelectedCheckpointGenerationBinding::retired_v2(
                log_id,
                session_id,
                frame,
                activated_fence_id,
                activated_by_head_id,
                retired_by_head_id,
            ),
        }
    }

    /// Creates complete reclaimed facts for a selected V2 rotation.
    #[must_use]
    pub const fn reclaimed(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV2,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
        retired_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self {
            inner: LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed_v2(
                log_id,
                session_id,
                frame,
                activated_fence_id,
                activated_by_head_id,
                retired_by_head_id,
            ),
        }
    }

    pub(super) const fn inner(&self) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.inner
    }

    /// Returns the exact checkpoint generation-record state.
    #[must_use]
    pub const fn state(&self) -> LocalLogStorageSelectedCheckpointGenerationState {
        self.inner.state()
    }

    /// Returns the checkpoint generation identity.
    #[must_use]
    pub const fn log_id(&self) -> &LocalLogId {
        self.inner.log_id()
    }

    /// Returns the session identity recorded with the generation.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        self.inner.session_id()
    }

    /// Returns the root head that established a checkpoint-only identity.
    #[must_use]
    pub const fn established_by_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.inner.established_by_head_id()
    }

    /// Returns the exact Frame V2 policy, absent for checkpoint-only facts.
    #[must_use]
    pub const fn frame(&self) -> Option<LocalLogStorageGenerationFrameV2> {
        self.inner.frame_v2()
    }

    /// Returns the immutable fence that activated a retired or reclaimed generation.
    #[must_use]
    pub const fn activated_fence_id(&self) -> Option<&LocalLogStorageFenceId> {
        self.inner.activated_fence_id()
    }

    /// Returns the head that activated a retired or reclaimed generation.
    #[must_use]
    pub const fn activated_by_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.inner.activated_by_head_id()
    }

    /// Returns the head that retired an old active generation.
    #[must_use]
    pub const fn retired_by_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.inner.retired_by_head_id()
    }
}

/// Complete Frame V2 facts for a selection envelope's active generation.
///
/// The value is inspection data only and carries no mutable writer authority.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectedActiveGenerationBindingV2 {
    inner: LocalLogStorageSelectedActiveGenerationBinding,
}

impl LocalLogStorageSelectedActiveGenerationBindingV2 {
    /// Creates one complete set of immutable active Frame V2 facts.
    #[must_use]
    pub const fn new(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV2,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self {
            inner: LocalLogStorageSelectedActiveGenerationBinding::new_v2(
                log_id,
                session_id,
                frame,
                activated_fence_id,
                activated_by_head_id,
            ),
        }
    }

    pub(super) const fn inner(&self) -> &LocalLogStorageSelectedActiveGenerationBinding {
        &self.inner
    }

    /// Returns the active generation identity.
    #[must_use]
    pub const fn log_id(&self) -> &LocalLogId {
        self.inner.log_id()
    }

    /// Returns the session identity recorded with the generation.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        self.inner.session_id()
    }

    /// Returns the exact active Frame V2 policy.
    #[must_use]
    pub const fn frame(&self) -> LocalLogStorageGenerationFrameV2 {
        match self.inner.frame_v2() {
            Some(frame) => frame,
            None => unreachable!(),
        }
    }

    /// Returns the immutable fence that activated the generation.
    #[must_use]
    pub const fn activated_fence_id(&self) -> &LocalLogStorageFenceId {
        self.inner.activated_fence_id()
    }

    /// Returns the head that activated the generation.
    #[must_use]
    pub const fn activated_by_head_id(&self) -> &LocalLogStorageHeadId {
        self.inner.activated_by_head_id()
    }
}
