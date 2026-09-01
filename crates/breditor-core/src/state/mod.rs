//! Immutable editor snapshots and their deterministic execution context.

mod context;
mod editor_state;
mod lineage_id;
mod revision;
mod snapshot_id;

pub use context::EditorContext;
pub use editor_state::{EditorState, EditorStateError, PendingFormatError};
pub use lineage_id::{LineageId, LineageIdError, MAX_LINEAGE_ID_BYTES};
pub use revision::{Revision, RevisionError};
pub use snapshot_id::SnapshotId;
