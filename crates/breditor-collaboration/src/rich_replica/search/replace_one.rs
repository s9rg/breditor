//! One native shared hit, current owner guard and one explicit selective Undo group.
use super::{
    super::{RichReplica, SharedObservation},
    SharedSearchResults,
};
use crate::Error;
use breditor_core::rich_content::{RichSearchReplacement, plan_rich_search_replace_one};

impl RichReplica {
    /// Replace one hit under the explicitly selected search recovery contract.
    /// # Errors
    /// Read-only/stale/foreign/disabled sources, invalid templates, native admission
    /// or transport/save bounds reject before any live owner field changes.
    pub fn replace_search_one_guarded(
        &mut self,
        observed: &SharedObservation,
        results: &SharedSearchResults,
        index: usize,
        replacement: &RichSearchReplacement,
    ) -> Result<bool, Error> {
        results.validate(self, observed)?;
        self.require_writable()?;
        if !self.search_contract {
            return Err(Error::Contract("shared search history required"));
        }
        let plan = plan_rich_search_replace_one(&results.core, index, replacement)?;
        self.apply_search_plan(&plan)
    }
}
