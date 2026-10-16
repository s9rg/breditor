//! One exact native preview and one staged shared publication for general selected text.
use super::{
    PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation, general_range_plan,
};
use crate::Error;
use breditor_core::{
    codec::RichFormatsJsonCodec,
    document::TextFragment,
    rich_content::{BlockId, RichLocalOutcome, RichLocalSession, actions::RichGeneralRangePlan},
    session::HistoryCapacity,
};
impl RichReplica {
    /// Read native general text replacement requirements under the exact current observation.
    /// Reads remain legal in read-only mode and confer no publication authority.
    /// # Errors
    /// Stale/foreign guards, absent/non-text selections and input/source limits reject.
    pub fn plan_general_selection_text_guarded(
        &self,
        observation: &SharedObservation,
        inserted: &TextFragment,
    ) -> Result<RichGeneralRangePlan, Error> {
        self.check(observation)?;
        let selection = self.selection()?.ok_or(Error::Contract("general range selection"))?;
        general_range_plan::request(&self.codec, &selection, inserted)?;
        RichGeneralRangePlan::capture(&self.document, &selection.admit(&self.document)?, inserted)
            .map_err(|_| Error::Contract("general range native plan"))
    }
    /// Replace selected text using native partial-structure preservation and original commands.
    ///
    /// One staged group retains causal source characters, owned births/deletions and
    /// selective Undo. The complete result must equal the native preview. Exact fresh
    /// IDs are caller-owned, including identities in discarded durable history.
    /// This native integration is not yet a Wasm/SDK editing capability.
    /// # Errors
    /// Stale/read-only, invalid IDs/styles, command limits or any lowering mismatch
    /// reject atomically. Original paste admission needs transient insertion headroom;
    /// normalization states not expressible by these commands also refuse, never flatten.
    pub fn replace_general_selection_text_guarded(
        &mut self,
        observation: &SharedObservation,
        inserted: &TextFragment,
        empty: &[BlockId],
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let selection = self.selection()?.ok_or(Error::Contract("general range selection"))?;
        let request = general_range_plan::request(&self.codec, &selection, inserted)?;
        let context = super::paragraphs::context(&self.codec);
        let formats = RichFormatsJsonCodec::new(context.clone());
        let mut preview = RichLocalSession::try_new(
            context,
            self.document.clone(),
            Some(selection.admit(&self.document)?.kind().clone()),
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("general range history"))?,
        )
        .map_err(|_| Error::Contract("general range preview"))?;
        if let Some(pending) = self.pending_formats() {
            let pending = formats
                .decode(&serde_json::to_string(pending)?)
                .map_err(|_| Error::Contract("general range pending formats"))?;
            preview
                .set_pending_formats(&preview.snapshot(), Some(pending))
                .map_err(|_| Error::Contract("general range preview pending"))?;
        }
        let plan = preview
            .plan_general_selection_text(&preview.snapshot(), inserted)
            .map_err(|_| Error::Contract("general range preview plan"))?;
        if preview
            .replace_general_selection_text(&preview.snapshot(), inserted, empty)
            .map_err(|_| Error::Contract("general range native admission"))?
            == RichLocalOutcome::Unchanged
        {
            return Ok(false);
        }
        let selection = SelectionUpdate::Set(Some(super::atom_edit::selection(
            preview
                .state()
                .selection()
                .ok_or(Error::Contract("general range resulting caret"))?
                .kind(),
        )?));
        let pending = PendingFormatsUpdate::Set(
            preview
                .state()
                .pending_formats()
                .map(|pending| {
                    serde_json::from_str(
                        &formats
                            .encode(pending)
                            .map_err(|_| Error::Contract("general range resulting formats"))?,
                    )
                    .map_err(Error::from)
                })
                .transpose()?,
        );
        let commands = general_range_plan::commands(
            &self.codec,
            &plan,
            request,
            empty,
            preview.state().document(),
        )?;
        if commands.is_empty() {
            let mut candidate = self.staged()?;
            candidate.journal.ui.after(
                &candidate.codec,
                &candidate.doc,
                &candidate.document,
                &selection,
                &pending,
            )?;
            if candidate.journal.ui == self.journal.ui {
                return Ok(false);
            }
            self.adopt(candidate)?;
            return Ok(true);
        }
        self.apply_with_state_inner(
            commands,
            selection,
            pending,
            None,
            Some(preview.state().document()),
        )
    }
}
