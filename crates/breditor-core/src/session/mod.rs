//! Synchronous ownership of current editor state and bounded linear history.
//!
//! [`EditorSession`] is the local publication boundary: accepting a commit,
//! applying a transaction, and replaying history all require exclusive access
//! to one authoritative current state. It deliberately owns no DOM event loop,
//! async queue, wall clock, persistence, or collaboration transform.

mod capacity;
mod editor_session;
mod error;
mod history;
mod history_entry;
mod history_stamp;
mod history_status;

pub use capacity::{
    DEFAULT_HISTORY_CAPACITY, HistoryCapacity, HistoryCapacityError, MAX_HISTORY_CAPACITY,
};
pub use editor_session::EditorSession;
pub use error::{HistoryReplayError, SessionCommitError};
pub use history_stamp::HistoryStamp;
pub use history_status::SessionHistoryStatus;

pub(crate) use editor_session::EditorSessionCheckpointParts;
pub(crate) use history::HistoryCheckpointInvariantError;
pub(crate) use history_entry::HistoryEntry;
