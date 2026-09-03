use std::fmt;

use super::{
    LocalLogStorageAppendAttemptAborted, LocalLogStorageAppendHeadPresent,
    LocalLogStorageAppendNotAttempted,
};

/// Typed result of applying one matching append terminal attestation.
///
/// `HeadPresent` is positive host-attested physical evidence but deliberately
/// does not pop the FIFO head. The separate acknowledgement transition must do
/// that explicitly. Negative variants preserve the exact queue for serialized
/// resubmission and remove no head.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendTerminalOutcome>();
/// ```
#[non_exhaustive]
#[must_use = "an append terminal outcome must be explicitly handled"]
pub enum LocalLogStorageAppendTerminalOutcome {
    /// The exact head was host-attested present after transaction completion.
    HeadPresent(LocalLogStorageAppendHeadPresent),
    /// The exact associated physical transaction aborted.
    AttemptAborted(LocalLogStorageAppendAttemptAborted),
    /// The named adapter invocation created no transaction.
    NotAttempted(LocalLogStorageAppendNotAttempted),
}

impl fmt::Debug for LocalLogStorageAppendTerminalOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HeadPresent(state) => formatter.debug_tuple("HeadPresent").field(state).finish(),
            Self::AttemptAborted(state) => {
                formatter.debug_tuple("AttemptAborted").field(state).finish()
            }
            Self::NotAttempted(state) => {
                formatter.debug_tuple("NotAttempted").field(state).finish()
            }
        }
    }
}
