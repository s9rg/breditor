/// Attempt state that supplied one append storage-resolution owner.
///
/// This is inspection metadata only. It does not describe current storage,
/// certify historical commit, or grant acknowledgement, retry, or writer
/// authority.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionSourceKind {
    /// A physical append attempt whose terminal result remains uncertain.
    Uncertain,
    /// A physical append transaction that the host attested was aborted.
    AttemptAborted,
    /// An append invocation that the host attested created no transaction.
    NotAttempted,
}

impl LocalLogStorageAppendResolutionSourceKind {
    /// Returns the stable diagnostic spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Uncertain => "uncertain",
            Self::AttemptAborted => "attempt_aborted",
            Self::NotAttempted => "not_attempted",
        }
    }
}
