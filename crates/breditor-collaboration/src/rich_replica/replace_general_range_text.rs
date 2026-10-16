//! Explicit rich target uses the actual before-UI and the separate semantic history contract.
use super::{
    RichReplica, SharedObservation, replace_general_selection_text::GeneralInput,
    selection::Selection,
};
use crate::Error;
use breditor_core::{document::TextFragment, rich_content::BlockId};
impl RichReplica {
    /// Closed rich-run input with native literal decoding and floor allocation.
    /// # Errors
    /// Stale/read-only/disabled reject before parsing; malformed literals, IDs or final state reject atomically.
    pub fn replace_general_range_text_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        use super::general_range_input_json::{self as json, Rich};
        json::authorize(self, observation)?;
        let r: Rich = json::decode(input)?;
        let inserted = json::fragment(&self.codec, r.runs)?;
        let plan = breditor_core::rich_content::actions::RichGeneralRangePlan::capture(
            &self.document,
            &r.selection.admit(&self.document)?,
            &inserted,
        )
        .map_err(|_| Error::Contract("general rich input plan"))?;
        let empty = breditor_core::rich_content::allocate_general_range_paragraphs(
            &r.prefix,
            plan.empty_blocks().len(),
        )
        .map_err(|_| Error::Contract("general input namespace"))?;
        self.replace_general_range_text_guarded(observation, &r.selection, &inserted, &empty)
    }
    /// Replace an explicit native text target without restaging the user's selection.
    /// # Errors
    /// Stale/read-only/disabled, malformed target/runs/IDs or final admission rejects atomically.
    pub fn replace_general_range_text_guarded(
        &mut self,
        observation: &SharedObservation,
        target: &Selection,
        inserted: &TextFragment,
        empty: &[BlockId],
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.general_ranges_enabled() {
            return Err(Error::Contract("general semantic history required"));
        }
        self.replace_general_range_input(
            observation,
            inserted,
            empty,
            GeneralInput { target, typing: None, pending: None },
        )
    }
}
