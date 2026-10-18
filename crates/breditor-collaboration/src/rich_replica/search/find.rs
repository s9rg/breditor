//! Pure native shared search, available without mutable history or writable permission.
use super::{
    super::{RichReplica, SharedObservation},
    SharedSearchResults,
};
use crate::Error;
use breditor_core::rich_content::{RichSearchQuery, find_rich_text};
use std::sync::Arc;

impl RichReplica {
    /// Search the exact accepted causal snapshot without publishing content, UI or history.
    /// # Errors
    /// Rejects stale/foreign observations, query/traversal/engine limits or native invariants.
    pub fn find_text_guarded(
        &self,
        observed: &SharedObservation,
        query: &RichSearchQuery,
    ) -> Result<SharedSearchResults, Error> {
        self.check(observed)?;
        let core = find_rich_text(self.document(), query)?;
        Ok(SharedSearchResults {
            owner: Arc::clone(&self.search_owner),
            causal: self.causal_version(),
            applied: self.doc.state_vv(),
            core,
        })
    }
}
