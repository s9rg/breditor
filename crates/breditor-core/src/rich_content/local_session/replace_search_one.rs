//! One current native search hit, one atomic explicit local Undo group.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{RichSearchReplacement, RichSearchResults, plan_rich_search_replace_one};

impl RichLocalSession {
    /// Replace one hit against the exact live publication and complete source AST.
    ///
    /// Retains/maps the actual selection rather than selecting the hit implicitly.
    /// Literal identities are true no-ops, including pending formats and Redo.
    /// # Errors
    /// Rejects stale/foreign observations, read-only policy, changed results,
    /// invalid templates or any final admission/inverse failure before publication.
    pub fn replace_search_one(
        &mut self,
        snapshot: &RichLocalSnapshot,
        results: &RichSearchResults,
        index: usize,
        replacement: &RichSearchReplacement,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        results.validate_for(&self.state.document)?;
        let plan = plan_rich_search_replace_one(results, index, replacement)?;
        self.replace_search_plan(&plan)
    }
}
