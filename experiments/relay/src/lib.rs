//! Isolated reference-relay transactions: authenticated principals, exclusive writer leases,
//! durable append before acknowledgement, and exact native rich-state recovery.
//!
//! Callers authenticate accounts before supplying a principal. This crate's room authority is
//! neither a browser-selected writer ID nor a full-state import. Networking and deployment are
//! separate adapters; a [`Room`] requires exclusive mutable access across each transaction.
mod access;
mod credentials;
mod log;
mod protocol;
mod room;
#[cfg(feature = "server")]
pub mod server;

pub use access::Role;
pub use protocol::{Admission, DurableReceipt, Lease, Receipt, Recovery, Registration};
pub use room::Room;

/// Explicit service rejection. An I/O failure may have reached storage without an acknowledgement;
/// reopen and retry the exact group instead of assuming that the write was lost.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The authenticated principal lacks the required room permission.
    #[error("room permission denied")]
    Permission,
    /// Resume credential, owner, or active session fencing does not match.
    #[error("writer credential or lease rejected")]
    Lease,
    /// Resource, disk-format or semantic service contract violation.
    #[error("relay contract: {0}")]
    Contract(&'static str),
    /// A prior uncertain persistence result requires reopening the room.
    #[error("relay storage requires recovery before further use")]
    NeedsRecovery,
    /// Exclusive file ownership could not be acquired.
    #[error("room log is already locked")]
    Locked,
    /// Native rich-state admission rejected this group or journal.
    #[error(transparent)]
    Core(#[from] breditor_collab_feasibility::Error),
    /// Bounded serialized record is invalid.
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    /// Local filesystem operation failed.
    #[error(transparent)]
    Io(#[from] std::io::Error),
    /// OS entropy is unavailable. No credential is issued.
    #[error("operating-system entropy unavailable")]
    Entropy,
}

type Result<T> = std::result::Result<T, Error>;
