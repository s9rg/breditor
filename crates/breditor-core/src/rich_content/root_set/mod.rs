//! Multiple editable roots composed under one history owner (see `docs/MULTIPLE_ROOTS.md`).
//!
//! A root set is an ordered collection of independent rich documents — each a
//! normal frozen-grammar document owned by its own [`RichLocalSession`](super::RichLocalSession) —
//! whose Undo units are ordered by ONE global journal. No new node type, grammar or
//! fingerprint is involved: root identity, order, labels and attributes are set
//! metadata. The journal never mutates a root; it classifies each root's
//! process-local [`RichHistoryProbe`](super::RichHistoryProbe) and names which root
//! the next global Undo/Redo belongs to. A selection always lives in exactly one
//! root, so cross-root selections cannot be expressed.

mod checkpoint;
mod id;
mod journal;
mod owner;

pub use checkpoint::{
    RICH_ROOT_SET_FORMAT, RICH_ROOT_SET_FORMAT_VERSION, RichRootCheckpointPart, RichRootHistory,
    RichRootSelectionPolicy, RichRootSetCheckpoint,
};
pub use id::{
    RICH_ROOT_ATTRIBUTE_VALUE_MAX_BYTES, RICH_ROOT_ATTRIBUTES_MAX, RICH_ROOT_ID_MAX_BYTES,
    RICH_ROOT_LABEL_MAX_BYTES, RICH_ROOTS_MAX, RichRootId, RichRootMeta,
};
pub use journal::{RichRootSet, RichRootSetChange};
pub use owner::RichMultiRootSession;

/// Closed root-set failures; a failed call changes neither the set nor any root.
#[derive(Debug, thiserror::Error)]
pub enum RichRootSetError {
    /// A root id is not 1–64 ASCII letters, digits, `-` or `_` starting with a letter.
    #[error("root id is not admitted")]
    InvalidRootId,
    /// A label or attribute exceeds its bound or carries control characters.
    #[error("root metadata is not admitted")]
    InvalidMetadata,
    /// Another root already uses this id.
    #[error("root id is already in use")]
    DuplicateRoot,
    /// No root with this id is in the set.
    #[error("unknown root")]
    UnknownRoot,
    /// The set already holds the maximum number of roots.
    #[error("too many roots")]
    TooManyRoots,
    /// A dynamically added root must start with empty history (its units would have no global order).
    #[error("an added root must start with empty history")]
    HistoryNotEmpty,
    /// A restored set is waiting for every root owner to be attached.
    #[error("the restored root set is incomplete")]
    Incomplete,
    /// A root owner does not match the global journal counts.
    #[error("root history does not match the global journal")]
    HistoryMismatch,
    /// The set checkpoint envelope is malformed or inconsistent.
    #[error("root set checkpoint rejected")]
    CheckpointRejected,
    /// All roots of one owner must share one schema/limits context.
    #[error("root context does not match the set")]
    ContextMismatch,
    /// A root owner failed the requested dispatch.
    #[error(transparent)]
    Session(#[from] super::RichLocalSessionError),
}
