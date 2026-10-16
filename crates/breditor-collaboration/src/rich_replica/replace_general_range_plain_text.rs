//! Native explicit plain target; no temporary selection or JavaScript style inference.
use super::{
    RichReplica, SharedObservation, replace_general_selection_text::GeneralInput,
    selection::Selection,
};
use crate::Error;
use breditor_core::rich_content::BlockId;
impl RichReplica {
    /// Closed browser request; the host reserves one fresh prefix and Rust allocates exact floors.
    /// # Errors
    /// Stale/read-only/disabled owners reject before request parsing; all later failures are atomic.
    pub fn replace_general_range_plain_text_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        use super::general_range_input_json::{self as json, Plain};
        json::authorize(self, observation)?;
        let r: Plain = json::decode(input)?;
        let plan =
            self.plan_general_range_plain_text_guarded(observation, &r.selection, &r.text)?;
        let empty = breditor_core::rich_content::allocate_general_range_paragraphs(
            &r.prefix,
            plan.range().empty_blocks().len(),
        )
        .map_err(|_| Error::Contract("general input namespace"))?;
        self.replace_general_range_plain_text_guarded(observation, &r.selection, &r.text, &empty)
    }
    /// Replace an explicit general target with native plain input and actual before-UI history.
    /// # Errors
    /// Stale/read-only/disabled, invalid target/IDs or late final limits publish nothing.
    pub fn replace_general_range_plain_text_guarded(
        &mut self,
        observation: &SharedObservation,
        target: &Selection,
        text: &str,
        empty: &[BlockId],
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.general_ranges_enabled() {
            return Err(Error::Contract("general semantic history required"));
        }
        let plan = self.plan_general_range_plain_text_guarded(observation, target, text)?;
        self.replace_general_range_input(
            observation,
            plan.inserted(),
            empty,
            GeneralInput { target, typing: None, pending: Some(plan.formats().clone()) },
        )
    }
}
