//! Complete native Replace All, one private candidate and one explicit local Undo group.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{RichSearchReplacement, RichSearchResults, plan_rich_search_replace_all};

impl RichLocalSession {
    /// Replace every complete source hit atomically, never a truncated prefix.
    ///
    /// No query is re-run for history replay or reopen. An identity/no-hit request
    /// changes no content, UI, publication, typing continuation or Redo branch.
    /// # Errors
    /// Rejects stale/foreign observations, live read-only policy, changed source,
    /// invalid expansion, complete final admission or inverse proof before publication.
    pub fn replace_search_all(
        &mut self,
        snapshot: &RichLocalSnapshot,
        results: &RichSearchResults,
        replacement: &RichSearchReplacement,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        results.validate_for(&self.state.document)?;
        let plan = plan_rich_search_replace_all(results, replacement)?;
        self.replace_search_plan(&plan)
    }
}
