//! Runtime values for one durable, ordered, single-writer local editor log.
//!
//! This module defines identities, sequence numbers, event values, and an
//! atomic genesis recovery boundary. It does not append, persist, frame,
//! compact, or authenticate a stream. The codec module can serialize one
//! independently valid entry; storage must preserve the scopes and ordering
//! documented by these values.

mod application;
mod application_error;
mod entry;
mod event;
mod identity;
mod local_log_id;
mod local_session_id;
mod recovered;
mod recovery;
mod recovery_error;
mod recovery_limits;
mod replay_id;
mod sequence;

pub use application_error::{
    LocalLogEventApplicationError, LocalLogEventApplicationErrorCode,
    LocalLogReplayTransactionErrorCode,
};
pub use entry::LocalLogEntry;
pub use event::{LocalLogEvent, LocalLogEventError, LocalLogEventErrorCode, LocalLogEventKind};
pub use identity::{
    LocalLogIdentityError, LocalLogIdentityErrorCode, MAX_LOCAL_LOG_IDENTITY_BYTES,
};
pub use local_log_id::LocalLogId;
pub use local_session_id::LocalSessionId;
pub use recovered::RecoveredLocalLog;
pub use recovery::LocalLogRecovery;
pub use recovery_error::{
    LocalLogRecoveryCounter, LocalLogRecoveryError, LocalLogRecoveryErrorCode,
};
pub use recovery_limits::{
    DEFAULT_LOCAL_LOG_RECOVERY_MAX_APPLIED_OPERATIONS, DEFAULT_LOCAL_LOG_RECOVERY_MAX_OBSERVATIONS,
    DEFAULT_LOCAL_LOG_RECOVERY_MAX_UNIQUE_EVENTS, LocalLogRecoveryLimits,
};
pub use replay_id::ReplayId;
pub use sequence::{LocalLogSequence, LocalLogSequenceError};
