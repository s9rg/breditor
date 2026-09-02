use std::fmt;

use crate::local_log::{LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalSessionId};

use super::local_log_storage_generation_frame_v1::LocalLogStorageGenerationFrameV1;

/// Persisted state of the generation selected as the current checkpoint.
///
/// `CheckpointOnly` is valid only for a root selection. `Retired` and
/// `Reclaimed` are the two valid checkpoint states for an ordinary rotation.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedCheckpointGenerationState {
    /// Permanent root checkpoint identity with no frame or activation facts.
    CheckpointOnly,
    /// Formerly active generation whose payload remains eligible for cleanup.
    Retired,
    /// Formerly active generation whose payload cleanup has completed.
    Reclaimed,
}

impl LocalLogStorageSelectedCheckpointGenerationState {
    /// Returns the exact storage-record spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CheckpointOnly => "checkpoint-only",
            Self::Retired => "retired",
            Self::Reclaimed => "reclaimed",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectedCheckpointGenerationState {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum LocalLogStorageSelectedCheckpointGenerationFacts {
    CheckpointOnly {
        log_id: LocalLogId,
        session_id: LocalSessionId,
        established_by_head_id: LocalLogStorageHeadId,
    },
    Rotation {
        state: LocalLogStorageSelectedCheckpointGenerationState,
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV1,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
        retired_by_head_id: LocalLogStorageHeadId,
    },
}

/// Trusted storage-record facts for the generation selected as checkpoint.
///
/// The constructors are shape-safe: checkpoint-only records cannot carry
/// frame, activation, or retirement fields, while retired and reclaimed
/// records must carry all of them. The facts are immutable inspection input;
/// they do not prove that chunks are absent and carry no cleanup authority.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectedCheckpointGenerationBinding {
    facts: LocalLogStorageSelectedCheckpointGenerationFacts,
}

impl LocalLogStorageSelectedCheckpointGenerationBinding {
    /// Creates the permanent checkpoint-only facts required by a root.
    #[must_use]
    pub const fn checkpoint_only(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        established_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self {
            facts: LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly {
                log_id,
                session_id,
                established_by_head_id,
            },
        }
    }

    /// Creates complete facts for a retired rotation checkpoint generation.
    #[must_use]
    pub const fn retired(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV1,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
        retired_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self::rotation(
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
            log_id,
            session_id,
            frame,
            activated_fence_id,
            activated_by_head_id,
            retired_by_head_id,
        )
    }

    /// Creates complete facts for a reclaimed rotation checkpoint generation.
    #[must_use]
    pub const fn reclaimed(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV1,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
        retired_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self::rotation(
            LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
            log_id,
            session_id,
            frame,
            activated_fence_id,
            activated_by_head_id,
            retired_by_head_id,
        )
    }

    #[allow(clippy::too_many_arguments)]
    const fn rotation(
        state: LocalLogStorageSelectedCheckpointGenerationState,
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV1,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
        retired_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self {
            facts: LocalLogStorageSelectedCheckpointGenerationFacts::Rotation {
                state,
                log_id,
                session_id,
                frame,
                activated_fence_id,
                activated_by_head_id,
                retired_by_head_id,
            },
        }
    }

    /// Returns the exact checkpoint generation-record state.
    #[must_use]
    pub const fn state(&self) -> LocalLogStorageSelectedCheckpointGenerationState {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly { .. } => {
                LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly
            }
            LocalLogStorageSelectedCheckpointGenerationFacts::Rotation { state, .. } => *state,
        }
    }

    /// Returns the checkpoint generation identity.
    #[must_use]
    pub const fn log_id(&self) -> &LocalLogId {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly { log_id, .. }
            | LocalLogStorageSelectedCheckpointGenerationFacts::Rotation { log_id, .. } => log_id,
        }
    }

    /// Returns the session identity recorded with the generation.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly {
                session_id, ..
            }
            | LocalLogStorageSelectedCheckpointGenerationFacts::Rotation { session_id, .. } => {
                session_id
            }
        }
    }

    /// Returns the root head that established a checkpoint-only identity.
    ///
    /// This is present exactly when [`Self::state`] is `CheckpointOnly`.
    #[must_use]
    pub const fn established_by_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly {
                established_by_head_id,
                ..
            } => Some(established_by_head_id),
            LocalLogStorageSelectedCheckpointGenerationFacts::Rotation { .. } => None,
        }
    }

    /// Returns the exact Frame V1 policy retained from an old active generation.
    ///
    /// This is absent exactly for a checkpoint-only identity.
    #[must_use]
    pub const fn frame(&self) -> Option<LocalLogStorageGenerationFrameV1> {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly { .. } => None,
            LocalLogStorageSelectedCheckpointGenerationFacts::Rotation { frame, .. } => {
                Some(*frame)
            }
        }
    }

    /// Returns the immutable fence that activated a retired or reclaimed generation.
    ///
    /// This is absent exactly for a checkpoint-only identity.
    #[must_use]
    pub const fn activated_fence_id(&self) -> Option<&LocalLogStorageFenceId> {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly { .. } => None,
            LocalLogStorageSelectedCheckpointGenerationFacts::Rotation {
                activated_fence_id,
                ..
            } => Some(activated_fence_id),
        }
    }

    /// Returns the head that activated a retired or reclaimed generation.
    ///
    /// This is absent exactly for a checkpoint-only identity.
    #[must_use]
    pub const fn activated_by_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly { .. } => None,
            LocalLogStorageSelectedCheckpointGenerationFacts::Rotation {
                activated_by_head_id,
                ..
            } => Some(activated_by_head_id),
        }
    }

    /// Returns the head that retired an old active generation.
    ///
    /// This is absent exactly for a checkpoint-only identity.
    #[must_use]
    pub const fn retired_by_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        match &self.facts {
            LocalLogStorageSelectedCheckpointGenerationFacts::CheckpointOnly { .. } => None,
            LocalLogStorageSelectedCheckpointGenerationFacts::Rotation {
                retired_by_head_id,
                ..
            } => Some(retired_by_head_id),
        }
    }
}

/// Trusted storage-record facts for the currently active generation.
///
/// These immutable facts describe activation history only. They deliberately
/// exclude the mutable writer epoch and current writer fence and therefore do
/// not authorize appends, rotation, or any other mutation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectedActiveGenerationBinding {
    log_id: LocalLogId,
    session_id: LocalSessionId,
    frame: LocalLogStorageGenerationFrameV1,
    activated_fence_id: LocalLogStorageFenceId,
    activated_by_head_id: LocalLogStorageHeadId,
}

impl LocalLogStorageSelectedActiveGenerationBinding {
    /// Creates one complete set of immutable active-generation facts.
    #[must_use]
    pub const fn new(
        log_id: LocalLogId,
        session_id: LocalSessionId,
        frame: LocalLogStorageGenerationFrameV1,
        activated_fence_id: LocalLogStorageFenceId,
        activated_by_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self { log_id, session_id, frame, activated_fence_id, activated_by_head_id }
    }

    /// Returns the active generation identity.
    #[must_use]
    pub const fn log_id(&self) -> &LocalLogId {
        &self.log_id
    }

    /// Returns the session identity recorded with the generation.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the active generation's exact Frame V1 policy.
    #[must_use]
    pub const fn frame(&self) -> LocalLogStorageGenerationFrameV1 {
        self.frame
    }

    /// Returns the immutable non-secret fence that activated the generation.
    #[must_use]
    pub const fn activated_fence_id(&self) -> &LocalLogStorageFenceId {
        &self.activated_fence_id
    }

    /// Returns the head that activated the generation.
    #[must_use]
    pub const fn activated_by_head_id(&self) -> &LocalLogStorageHeadId {
        &self.activated_by_head_id
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageSelectedActiveGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationState,
    };
    use crate::{
        codec::{LocalLogFrameLimits, LocalLogStorageGenerationFrameV1},
        local_log::{LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalSessionId},
    };

    #[test]
    fn checkpoint_only_shape_has_no_rotation_facts() -> Result<(), Box<dyn std::error::Error>> {
        let binding = LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            LocalLogId::try_new("log:checkpoint")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageHeadId::try_new("head:root")?,
        );

        assert_eq!(
            binding.state(),
            LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly
        );
        assert_eq!(
            binding.established_by_head_id().map(LocalLogStorageHeadId::as_str),
            Some("head:root")
        );
        assert_eq!(binding.frame(), None);
        assert_eq!(binding.activated_fence_id(), None);
        assert_eq!(binding.activated_by_head_id(), None);
        assert_eq!(binding.retired_by_head_id(), None);
        Ok(())
    }

    #[test]
    fn retired_and_reclaimed_shapes_retain_all_rotation_facts()
    -> Result<(), Box<dyn std::error::Error>> {
        let retired = LocalLogStorageSelectedCheckpointGenerationBinding::retired(
            LocalLogId::try_new("log:old-active")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(8_192)),
            LocalLogStorageFenceId::try_new("fence:old")?,
            LocalLogStorageHeadId::try_new("head:old")?,
            LocalLogStorageHeadId::try_new("head:new")?,
        );
        let reclaimed = LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
            LocalLogId::try_new("log:old-active")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(8_192)),
            LocalLogStorageFenceId::try_new("fence:old")?,
            LocalLogStorageHeadId::try_new("head:old")?,
            LocalLogStorageHeadId::try_new("head:new")?,
        );

        assert_eq!(retired.state(), LocalLogStorageSelectedCheckpointGenerationState::Retired);
        assert_eq!(reclaimed.state(), LocalLogStorageSelectedCheckpointGenerationState::Reclaimed);
        assert_eq!(retired.established_by_head_id(), None);
        assert_eq!(
            retired.frame().map(LocalLogStorageGenerationFrameV1::limits),
            Some(LocalLogFrameLimits::new(8_192))
        );
        assert_eq!(
            retired.activated_fence_id().map(LocalLogStorageFenceId::as_str),
            Some("fence:old")
        );
        assert_eq!(
            retired.activated_by_head_id().map(LocalLogStorageHeadId::as_str),
            Some("head:old")
        );
        assert_eq!(
            retired.retired_by_head_id().map(LocalLogStorageHeadId::as_str),
            Some("head:new")
        );
        Ok(())
    }

    #[test]
    fn active_shape_contains_only_immutable_activation_facts()
    -> Result<(), Box<dyn std::error::Error>> {
        let active = LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:active")?,
            LocalSessionId::try_new("session:test")?,
            LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(4_096)),
            LocalLogStorageFenceId::try_new("fence:new")?,
            LocalLogStorageHeadId::try_new("head:new")?,
        );

        assert_eq!(active.log_id().as_str(), "log:active");
        assert_eq!(active.session_id().as_str(), "session:test");
        assert_eq!(active.frame().limits().max_payload_bytes(), 4_096);
        assert_eq!(active.activated_fence_id().as_str(), "fence:new");
        assert_eq!(active.activated_by_head_id().as_str(), "head:new");
        Ok(())
    }
}
