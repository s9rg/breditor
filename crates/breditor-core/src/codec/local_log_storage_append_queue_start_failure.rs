use std::{error::Error, fmt};

use super::{
    LocalLogStorageAppendPlan, LocalLogStorageAppendQueueStartError,
    LocalLogStorageAppendQueueStartErrorCode,
};

/// Recoverable rejection of one append-queue start action.
///
/// The failure retains the complete unchanged plan. Diagnostics expose only
/// the bounded typed resource error and never the plan's token, cursor, or
/// encoded frame.
#[must_use = "a rejected queue start retains its complete unchanged append plan"]
pub struct LocalLogStorageAppendQueueStartFailure {
    plan: Box<LocalLogStorageAppendPlan>,
    error: LocalLogStorageAppendQueueStartError,
}

impl LocalLogStorageAppendQueueStartFailure {
    pub(super) fn new(
        plan: LocalLogStorageAppendPlan,
        error: LocalLogStorageAppendQueueStartError,
    ) -> Self {
        Self { plan: Box::new(plan), error }
    }

    /// Returns the complete unchanged append plan.
    pub const fn plan(&self) -> &LocalLogStorageAppendPlan {
        &self.plan
    }

    /// Returns the typed queue-start resource error.
    #[must_use]
    pub const fn error(&self) -> LocalLogStorageAppendQueueStartError {
        self.error
    }

    /// Returns the stable machine-readable rejection category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAppendQueueStartErrorCode {
        self.error.code()
    }

    /// Recovers the complete unchanged append plan.
    #[must_use = "the returned plan retains revocable authority and speculative state"]
    pub fn into_plan(self) -> LocalLogStorageAppendPlan {
        *self.plan
    }

    /// Separates the unchanged plan and typed resource error.
    #[must_use = "the returned plan retains revocable authority and speculative state"]
    pub fn into_parts(self) -> (LocalLogStorageAppendPlan, LocalLogStorageAppendQueueStartError) {
        (*self.plan, self.error)
    }
}

impl fmt::Debug for LocalLogStorageAppendQueueStartFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendQueueStartFailure")
            .field("error", &self.error)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for LocalLogStorageAppendQueueStartFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(formatter)
    }
}

impl Error for LocalLogStorageAppendQueueStartFailure {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.error)
    }
}
