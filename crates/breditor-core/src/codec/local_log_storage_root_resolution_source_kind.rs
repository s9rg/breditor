/// Attempt state that supplied one root storage-resolution owner.
///
/// This is inspection metadata only. It does not describe the current storage
/// value, certify that the candidate committed, or grant retry or writer
/// authority.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionSourceKind {
    /// A physical attempt whose terminal result remains uncertain.
    Uncertain,
    /// A physical transaction that the host attested was aborted.
    AttemptAborted,
    /// An invocation that the host attested created no publication transaction.
    NotAttempted,
    /// A physical transaction that the host attested committed.
    HostAttestedCommitted,
}

impl LocalLogStorageRootResolutionSourceKind {
    /// Returns the stable diagnostic spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Uncertain => "uncertain",
            Self::AttemptAborted => "attempt_aborted",
            Self::NotAttempted => "not_attempted",
            Self::HostAttestedCommitted => "host_attested_committed",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageRootResolutionSourceKind;

    #[test]
    fn source_kind_spellings_are_stable() {
        assert_eq!(LocalLogStorageRootResolutionSourceKind::Uncertain.as_str(), "uncertain");
        assert_eq!(
            LocalLogStorageRootResolutionSourceKind::AttemptAborted.as_str(),
            "attempt_aborted"
        );
        assert_eq!(LocalLogStorageRootResolutionSourceKind::NotAttempted.as_str(), "not_attempted");
        assert_eq!(
            LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted.as_str(),
            "host_attested_committed"
        );
    }
}
