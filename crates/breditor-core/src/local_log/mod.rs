//! Runtime values for one durable, ordered, single-writer local editor log.
//!
//! This module defines identities, sequence numbers, and event values only. It
//! does not append, persist, compact, authenticate, or recover a stream. The
//! codec module can serialize one independently valid entry; ordering and I/O
//! boundaries must preserve the scopes documented by these values.

mod entry;
mod event;
mod identity;
mod local_log_id;
mod local_session_id;
mod replay_id;
mod sequence;

pub use entry::LocalLogEntry;
pub use event::{LocalLogEvent, LocalLogEventError, LocalLogEventErrorCode, LocalLogEventKind};
pub use identity::{
    LocalLogIdentityError, LocalLogIdentityErrorCode, MAX_LOCAL_LOG_IDENTITY_BYTES,
};
pub use local_log_id::LocalLogId;
pub use local_session_id::LocalSessionId;
pub use replay_id::ReplayId;
pub use sequence::{LocalLogSequence, LocalLogSequenceError};
