use crate::local_log::{LocalLogId, LocalSessionId};

/// Trusted host binding for one active local-log tail.
///
/// Local Log Frame V1 carries an ordinary Local Log Entry V1 payload, which
/// already asserts both identities. The frame codec compares those untrusted
/// assertions with this independently supplied binding before publishing an
/// entry. The binding is a storage-scope check, not authorization, integrity,
/// provenance, writer fencing, or proof that the generation is still active.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogFrameBinding {
    session_id: LocalSessionId,
    active_log_id: LocalLogId,
}

impl LocalLogFrameBinding {
    /// Creates one trusted active-tail scope.
    #[must_use]
    pub const fn new(session_id: LocalSessionId, active_log_id: LocalLogId) -> Self {
        Self { session_id, active_log_id }
    }

    /// Returns the trusted durable session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the trusted active append-generation identity.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        &self.active_log_id
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogFrameBinding;
    use crate::local_log::{LocalLogId, LocalSessionId};

    #[test]
    fn binding_preserves_the_two_independent_trusted_scopes()
    -> Result<(), Box<dyn std::error::Error>> {
        let session = LocalSessionId::try_new("session:frame-binding")?;
        let log = LocalLogId::try_new("log:frame-binding:g1")?;
        let binding = LocalLogFrameBinding::new(session.clone(), log.clone());

        assert_eq!(binding.session_id(), &session);
        assert_eq!(binding.active_log_id(), &log);
        Ok(())
    }
}
