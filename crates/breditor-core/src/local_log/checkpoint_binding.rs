use thiserror::Error;

use super::{LocalLogId, LocalSessionId};

/// Trusted host binding for one durable local-log checkpoint storage slot.
///
/// The three identities are opaque names, not authorization or provenance.
/// A checkpoint codec compares untrusted wire values with this independently
/// supplied binding before publishing a runtime anchor. Hosts must construct
/// it from trusted configuration or storage metadata, never from the same JSON
/// being decoded.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[allow(clippy::struct_field_names)]
pub struct LocalLogCheckpointBinding {
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    successor_log_id: LocalLogId,
}

impl LocalLogCheckpointBinding {
    /// Creates one session-stable, generation-advancing checkpoint binding.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointBindingError::GenerationNotAdvanced`] when
    /// the sealed and successor generation identities are equal.
    pub fn try_new(
        session_id: LocalSessionId,
        checkpoint_log_id: LocalLogId,
        successor_log_id: LocalLogId,
    ) -> Result<Self, LocalLogCheckpointBindingError> {
        if checkpoint_log_id == successor_log_id {
            return Err(LocalLogCheckpointBindingError::GenerationNotAdvanced);
        }
        Ok(Self { session_id, checkpoint_log_id, successor_log_id })
    }

    /// Returns the trusted durable session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the trusted sealed-generation identity.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        &self.checkpoint_log_id
    }

    /// Returns the trusted successor-generation identity.
    #[must_use]
    pub const fn successor_log_id(&self) -> &LocalLogId {
        &self.successor_log_id
    }
}

/// Why a trusted checkpoint binding cannot name a generation transition.
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCheckpointBindingError {
    /// A generation transition must not reuse the sealed generation identity.
    #[error("local-log checkpoint binding must advance to a distinct successor generation")]
    GenerationNotAdvanced,
}

impl LocalLogCheckpointBindingError {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GenerationNotAdvanced => "local_log_checkpoint_binding.generation_not_advanced",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};
    use crate::local_log::{LocalLogId, LocalSessionId};

    #[test]
    fn binding_requires_a_distinct_successor_generation() -> Result<(), Box<dyn std::error::Error>>
    {
        let session = LocalSessionId::try_new("session:bound")?;
        let sealed = LocalLogId::try_new("log:sealed")?;
        let successor = LocalLogId::try_new("log:successor")?;
        let binding =
            LocalLogCheckpointBinding::try_new(session.clone(), sealed.clone(), successor.clone())?;

        assert_eq!(binding.session_id(), &session);
        assert_eq!(binding.checkpoint_log_id(), &sealed);
        assert_eq!(binding.successor_log_id(), &successor);
        assert_eq!(
            LocalLogCheckpointBinding::try_new(session, sealed.clone(), sealed),
            Err(LocalLogCheckpointBindingError::GenerationNotAdvanced)
        );
        assert_eq!(
            LocalLogCheckpointBindingError::GenerationNotAdvanced.as_str(),
            "local_log_checkpoint_binding.generation_not_advanced"
        );
        Ok(())
    }
}
