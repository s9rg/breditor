//! Native selection coverage and final semantic preview precede one complete shared adoption.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::SetBlockLayout,
};
use crate::Error;
use breditor_core::{
    codec::{RichFormatsJsonCodec, decode_rich_block_layout_patch, encode_rich_block_layout_patch},
    rich_content::{
        RichBlockLayoutPatch, RichLocalOutcome, RichLocalSession, RichSelectionCoverage,
    },
    session::HistoryCapacity,
};
impl RichReplica {
    /// Decode strict layout intent only after exact guard and writable policy.
    /// # Errors
    /// Wrong profile, malformed input and any semantic/resource failure publish nothing.
    pub fn change_selection_layout_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let patch = decode_rich_block_layout_patch(&super::paragraphs::context(&self.codec), input)
            .map_err(|_| Error::Contract("selection layout intent"))?;
        self.change_selection_layout_guarded(observation, &patch)
    }
    /// Patch every native covered text block, including code and empty boundaries, in one group.
    ///
    /// Each requested property uses its own causal field. A caret edits the block,
    /// not pending inline formats. The original64-command ceiling remains strict.
    /// # Errors
    /// Stale/read-only, non-V3, no targets, limits or disagreement with native preview is atomic.
    pub fn change_selection_layout_guarded(
        &mut self,
        observation: &SharedObservation,
        patch: &RichBlockLayoutPatch,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let context = super::paragraphs::context(&self.codec);
        let patch_json = encode_rich_block_layout_patch(&context, patch)
            .map_err(|_| Error::Contract("selection layout profile"))?;
        let selection =
            self.selection()?.ok_or(Error::Contract("selection layout requires selection"))?;
        let proof = selection.admit(&self.document)?;
        let mut preview = RichLocalSession::try_new(
            context.clone(),
            self.document.clone(),
            Some(proof.kind().clone()),
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("selection layout history"))?,
        )
        .map_err(|_| Error::Contract("selection layout preview"))?;
        if let Some(pending) = self.pending_formats() {
            let value = RichFormatsJsonCodec::new(context)
                .decode(&serde_json::to_string(pending)?)
                .map_err(|_| Error::Contract("selection layout pending"))?;
            preview
                .set_pending_formats(&preview.snapshot(), Some(value))
                .map_err(|_| Error::Contract("selection layout pending preview"))?;
        }
        if preview
            .change_selection_layout(&preview.snapshot(), patch)
            .map_err(|_| Error::Contract("selection layout admission"))?
            == RichLocalOutcome::Unchanged
        {
            return Ok(false);
        }
        let coverage = RichSelectionCoverage::capture(&self.document, &proof)
            .map_err(|_| Error::Contract("selection layout coverage"))?;
        if coverage.text().len() > 64 {
            return Err(Error::Limit("selection layout commands"));
        }
        let commands = coverage
            .text()
            .iter()
            .map(|span| {
                Command::SetBlockLayout(SetBlockLayout {
                    block: span.block().as_str().into(),
                    patch_json: patch_json.clone(),
                })
            })
            .collect();
        self.apply_with_state_inner(
            commands,
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map,
            None,
            Some(preview.state().document()),
        )
    }
}
