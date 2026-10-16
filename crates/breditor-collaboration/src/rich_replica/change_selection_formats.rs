//! Native selection-level formatting, verified against the pure local result before adoption.
use super::{PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation};
use crate::Error;
use breditor_core::{
    codec::RichFormatsJsonCodec,
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichSelectionCoverage, RichSelectionFormatChange,
    },
    session::HistoryCapacity,
};
impl RichReplica {
    /// Decode the separately versioned selection-format intent only after exact guard/policy checks.
    /// # Errors
    /// Malformed or oversized literals, invalid scopes and any semantic failure publish nothing.
    pub fn change_selection_formats_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let changes = breditor_core::codec::decode_rich_selection_format_changes(
            &super::paragraphs::context(&self.codec),
            input,
        )
        .map_err(|_| Error::Contract("selection format intent"))?;
        self.change_selection_formats_guarded(observation, &changes)
    }
    /// Apply typed changes to the current text/node/merge-closed-grid selection in one native group.
    ///
    /// Rust computes all spans, admits the complete local semantic preview and
    /// lowers only original `SetFormat` annotations. A caret changes pending state
    /// only. Code rejects the complete request. Exact original sequential shared
    /// admission and 64-command limits remain in force; no target is truncated.
    /// # Errors
    /// Stale/read-only, invalid changes, unsupported selections, limits or a
    /// lowering/preview disagreement retain every published field.
    pub fn change_selection_formats_guarded(
        &mut self,
        observation: &SharedObservation,
        changes: &[RichSelectionFormatChange],
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let selection =
            self.selection()?.ok_or(Error::Contract("selection formats require selection"))?;
        let proof = selection.admit(&self.document)?;
        let context = super::paragraphs::context(&self.codec);
        let formats = RichFormatsJsonCodec::new(context.clone());
        let mut preview = RichLocalSession::try_new(
            context,
            self.document.clone(),
            Some(proof.kind().clone()),
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("selection format history"))?,
        )
        .map_err(|_| Error::Contract("selection format preview"))?;
        if let Some(pending) = self.pending_formats() {
            let pending = formats
                .decode(&serde_json::to_string(pending)?)
                .map_err(|_| Error::Contract("selection format pending"))?;
            preview
                .set_pending_formats(&preview.snapshot(), Some(pending))
                .map_err(|_| Error::Contract("selection format pending preview"))?;
        }
        let outcome = preview
            .change_selection_formats(&preview.snapshot(), changes)
            .map_err(|_| Error::Contract("selection format admission"))?;
        if outcome == RichLocalOutcome::Unchanged {
            return Ok(false);
        }
        if selection.caret().is_some() {
            let pending = preview
                .state()
                .pending_formats()
                .ok_or(Error::Contract("selection format pending result"))?;
            return self.set_pending_formats_json(
                &formats
                    .encode(pending)
                    .map_err(|_| Error::Contract("selection format pending encoding"))?,
            );
        }
        let coverage = RichSelectionCoverage::capture(&self.document, &proof)
            .map_err(|_| Error::Contract("selection format coverage"))?;
        let commands =
            super::selection_formats::commands(&self.document, &coverage, changes, &formats)?;
        self.apply_with_state_inner(
            commands,
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map,
            None,
            Some(preview.state().document()),
        )
    }
}
