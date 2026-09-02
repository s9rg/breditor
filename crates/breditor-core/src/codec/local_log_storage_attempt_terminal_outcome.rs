use std::fmt;

use super::{
    LocalLogStorageAttemptAborted, LocalLogStorageHostAttestedCommitted,
    LocalLogStorageNotAttempted,
};

/// The typed result of applying one matching physical terminal attestation.
///
/// Only `HostAttestedCommitted` is positive historical plan-commit evidence.
/// The other variants describe one physical invocation and leave plan-level
/// status unresolved.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAttemptTerminalOutcome>();
/// ```
#[non_exhaustive]
#[must_use = "a storage-attempt terminal outcome must be explicitly handled"]
pub enum LocalLogStorageAttemptTerminalOutcome {
    /// The host attested that one exact armed publication transaction committed.
    HostAttestedCommitted(LocalLogStorageHostAttestedCommitted),
    /// One associated physical transaction aborted and rolled back.
    AttemptAborted(LocalLogStorageAttemptAborted),
    /// One adapter invocation created no publication-capable transaction.
    NotAttempted(LocalLogStorageNotAttempted),
}

impl fmt::Debug for LocalLogStorageAttemptTerminalOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HostAttestedCommitted(state) => {
                formatter.debug_tuple("HostAttestedCommitted").field(state).finish()
            }
            Self::AttemptAborted(state) => {
                formatter.debug_tuple("AttemptAborted").field(state).finish()
            }
            Self::NotAttempted(state) => {
                formatter.debug_tuple("NotAttempted").field(state).finish()
            }
        }
    }
}
