/// Attempt state that supplied one rotation storage-resolution owner.
///
/// This is inspection metadata only. It does not describe current storage,
/// certify historical commit, or grant retry or writer authority.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionSourceKind {
    /// A physical attempt whose terminal result remains uncertain.
    Uncertain,
    /// A physical transaction that the host attested was aborted.
    AttemptAborted,
    /// An invocation that the host attested created no publication transaction.
    NotAttempted,
    /// A physical transaction that the host attested committed.
    HostAttestedCommitted,
}

impl LocalLogStorageRotationResolutionSourceKind {
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
