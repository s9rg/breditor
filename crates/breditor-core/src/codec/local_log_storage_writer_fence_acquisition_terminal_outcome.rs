use std::fmt;

use super::{
    LocalLogStorageMutationToken, LocalLogStorageWriterFenceAcquisitionAborted,
    LocalLogStorageWriterFenceAcquisitionNotAttempted,
};

/// Typed result of applying one matching acquisition terminal attestation.
///
/// Only the trusted host-attested `Acquired` branch contains mutation
/// authority, and that token may already be stale when returned. The core does
/// not independently verify the physical transaction. Negative branches
/// preserve the exact plan for retry.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageWriterFenceAcquisitionTerminalOutcome>();
/// ```
#[non_exhaustive]
#[must_use = "an acquisition terminal outcome must be explicitly handled"]
pub enum LocalLogStorageWriterFenceAcquisitionTerminalOutcome {
    /// The host attested that the exact comparison-and-write transaction completed.
    Acquired(LocalLogStorageMutationToken),
    /// The host attested that the exact associated transaction aborted.
    TransactionAborted(LocalLogStorageWriterFenceAcquisitionAborted),
    /// The host attested that the invocation created no transaction.
    NotAttempted(LocalLogStorageWriterFenceAcquisitionNotAttempted),
}

impl fmt::Debug for LocalLogStorageWriterFenceAcquisitionTerminalOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Acquired(token) => formatter.debug_tuple("Acquired").field(token).finish(),
            Self::TransactionAborted(state) => {
                formatter.debug_tuple("TransactionAborted").field(state).finish()
            }
            Self::NotAttempted(state) => {
                formatter.debug_tuple("NotAttempted").field(state).finish()
            }
        }
    }
}
