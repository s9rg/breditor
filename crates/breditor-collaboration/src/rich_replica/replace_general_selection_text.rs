//! One exact native preview and one staged shared publication for general selected text.
use super::{
    PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation, general_range_plan,
};
use crate::Error;
use breditor_core::{
    codec::RichFormatsJsonCodec,
    document::{FormatSet, TextFragment},
    rich_content::{BlockId, RichLocalOutcome, actions::RichGeneralRangePlan},
};
pub(super) struct GeneralInput<'a> {
    pub target: &'a super::selection::Selection,
    pub typing: Option<super::typing_history::Request>,
    pub pending: Option<FormatSet>,
}
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
    /// Replace selected text using native partial-structure preservation.
    ///
    /// One staged group retains causal source characters, owned births/deletions and
    /// selective Undo. The complete result must equal the native preview. Exact fresh
    /// IDs are caller-owned, including identities in discarded durable history.
    /// Separate explicit-target methods provide the additive Wasm/source-facade capability.
    /// # Errors
    /// Stale/read-only, invalid IDs/styles, command limits or any lowering mismatch
    /// reject atomically. The original history family retains its primitive lowering
    /// limits; the explicit general family admits the complete semantic result once.
    pub fn replace_general_selection_text_guarded(
        &mut self,
        observation: &SharedObservation,
        inserted: &TextFragment,
        empty: &[BlockId],
    ) -> Result<bool, Error> {
        self.replace_general_selection_text_with_typing(observation, inserted, empty, None)
    }
    pub(super) fn replace_general_selection_text_with_typing(
        &mut self,
        observation: &SharedObservation,
        inserted: &TextFragment,
        empty: &[BlockId],
        typing: Option<super::typing_history::Request>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let target = self.selection()?.ok_or(Error::Contract("general range selection"))?;
        self.replace_general_range_input(
            observation,
            inserted,
            empty,
            GeneralInput { target: &target, typing, pending: None },
        )
    }
    pub(super) fn replace_general_range_input(
        &mut self,
        observation: &SharedObservation,
        inserted: &TextFragment,
        empty: &[BlockId],
        input: GeneralInput<'_>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let selection = input.target;
        let request = general_range_plan::request(&self.codec, selection, inserted)?;
        let context = super::paragraphs::context(&self.codec);
        let formats = RichFormatsJsonCodec::new(context.clone());
        let mut preview = self.general_range_preview()?;
        let target = selection.admit(&self.document)?.kind().clone();
        let plan = RichGeneralRangePlan::capture(
            &self.document,
            &selection.admit(&self.document)?,
            inserted,
        )
        .map_err(|_| Error::Contract("general range preview plan"))?;
        if preview
            .replace_general_range_text(&preview.snapshot(), &target, inserted, empty)
            .map_err(|_| Error::Contract("general range native admission"))?
            == RichLocalOutcome::Unchanged
        {
            return Ok(false);
        }
        if let Some(pending) = input.pending {
            preview
                .set_pending_formats(&preview.snapshot(), Some(pending))
                .map_err(|_| Error::Contract("general range preview input formats"))?;
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
        if self.general_ranges_enabled()
            && preview.state().document().document() != self.document.document()
        {
            return self.apply_general_range_with_state(
                super::actions::ReplaceGeneralTextRangeV1 {
                    range: request,
                    empty: empty.iter().map(|id| id.as_str().into()).collect(),
                },
                selection,
                pending,
                preview.state().document(),
                input.typing,
            );
        }
        let commands = if self.general_ranges_enabled() {
            vec![]
        } else {
            general_range_plan::commands(
                &self.codec,
                &plan,
                request,
                empty,
                preview.state().document(),
            )?
        };
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
