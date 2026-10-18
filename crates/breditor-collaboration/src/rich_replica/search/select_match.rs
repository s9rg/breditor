//! Guarded search navigation publishes actual native selection, never guessed SDK coordinates.
use super::{
    super::{RichReplica, SharedObservation},
    SharedSearchResults, selection,
};
use crate::Error;
impl RichReplica {
    /// Select one source-proved match without editing content or clearing Redo.
    /// Read-only owners can navigate; search history need not be enabled.
    /// # Errors
    /// Rejects stale/foreign sources, an invalid index and selection/save failures atomically.
    pub fn select_search_match_guarded(
        &mut self,
        observed: &SharedObservation,
        results: &SharedSearchResults,
        index: usize,
    ) -> Result<bool, Error> {
        results.validate(self, observed)?;
        let selected = results.core.selection(index)?;
        self.set_selection_guarded(observed, Some(&selection::candidate(selected.kind())?))
    }
}
