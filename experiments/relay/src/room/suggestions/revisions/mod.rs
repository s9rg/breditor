//! Pending-only author revisions. Prepare/commit records keep ordinary V1 event order intact.
mod enable;
mod prepare;
mod publish;
mod read;
mod replay;
mod types;
use super::super::Room;
use std::collections::BTreeMap;
pub use types::*;

struct RetainedRevision {
    receipt: StoredSuggestionRevision,
    packet: String,
}
pub(super) struct RevisionsState {
    binding: String,
    pub(super) bytes: usize,
    retained: BTreeMap<String, RetainedRevision>,
    by_parent: BTreeMap<String, String>,
    roots: BTreeMap<String, String>,
    pending: Option<(u64, Box<prepare::PreparedRevision>)>,
}
impl RevisionsState {
    fn new(binding: &str) -> Self {
        Self {
            binding: binding.into(),
            bytes: 0,
            retained: BTreeMap::new(),
            by_parent: BTreeMap::new(),
            roots: BTreeMap::new(),
            pending: None,
        }
    }
}
impl Room {
    /// Only replay owns this transient preparation. A complete uncommitted prepare is inert at EOF
    /// or before any other next record; it is never a final Reject or a publication on its own.
    pub(in crate::room) fn abandon_suggestion_revision_preparation(&mut self) {
        if let Some(state) = self.suggestions.as_mut().and_then(|state| state.revisions.as_mut()) {
            state.pending = None;
        }
    }
}
