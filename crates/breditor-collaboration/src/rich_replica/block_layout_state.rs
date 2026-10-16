//! Native independent layout state, read only after the owner's exact observation proof.
use super::{RichReplica, SharedObservation};
use crate::Error;
impl RichReplica {
    /// Read exact independent mixed values, retaining inheritance and physical/logical alignment.
    /// # Errors
    /// Stale/foreign observations, non-V3 profile and native proof/encoding failure reject.
    pub fn block_layout_state_json_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let context = super::paragraphs::context(&self.codec);
        let selection = self.selection()?.as_ref().map(|s| s.admit(&self.document)).transpose()?;
        let state = breditor_core::rich_content::inspect_block_layout(
            &context,
            &self.document,
            selection.as_ref(),
        )
        .map_err(|_| Error::Contract("shared block layout read"))?;
        breditor_core::codec::encode_rich_block_layout_state(&context, &state)
            .map_err(|_| Error::Contract("shared block layout read encoding"))
    }
}
