//! Complete shared Replace All with original-character edits and one selective Undo group.
use super::{
    super::{RichReplica, SharedObservation},
    SharedSearchResults,
};
use crate::Error;
use breditor_core::rich_content::{RichSearchReplacement, plan_rich_search_replace_all};

impl RichReplica {
    /// Replace all complete native matches atomically; no truncated prefix or query replay.
    /// # Errors
    /// Read-only/stale/foreign/disabled sources, invalid templates, native admission
    /// or transport/save bounds reject without partial publication or history loss.
    pub fn replace_search_all_guarded(
        &mut self,
        observed: &SharedObservation,
        results: &SharedSearchResults,
        replacement: &RichSearchReplacement,
    ) -> Result<bool, Error> {
        results.validate(self, observed)?;
        self.require_writable()?;
        if !self.search_contract {
            return Err(Error::Contract("shared search history required"));
        }
        let plan = plan_rich_search_replace_all(&results.core, replacement)?;
        self.apply_search_plan(&plan)
    }
}
