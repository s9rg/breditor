//! Dedicated semantic-entry publication and replay; original command execution is unchanged.
use super::{
    PendingFormatsUpdate, RichReplica, SelectionUpdate,
    actions::ReplaceGeneralTextRangeV1,
    history_metadata::Recipe,
    session::{Entry, effects},
};
use crate::{Error, register::Stamp};
use breditor_core::rich_content::RichDocument;

impl RichReplica {
    pub(super) fn apply_general_range_with_state(
        &mut self,
        action: ReplaceGeneralTextRangeV1,
        selection_update: SelectionUpdate,
        pending_update: PendingFormatsUpdate,
        expected: &RichDocument,
        typing: Option<super::typing_history::Request>,
    ) -> Result<bool, Error> {
        self.require_writable()?;
        if !self.general_ranges_enabled() {
            return Err(Error::Contract("general semantic history required"));
        }
        let mut candidate = self.staged()?;
        let before = candidate.doc.oplog_vv();
        let before_ui = candidate.journal.ui.clone();
        let history_key =
            candidate.execute_general_range(&action, &selection_update, &pending_update, false)?;
        if candidate.document.document() != expected.document() {
            return Err(Error::Contract("general semantic lowering differs from native preview"));
        }
        let expected = effects(&candidate.doc, &before)?;
        let after_ui = candidate.journal.ui.clone();
        candidate.journal.entries.push(Entry::GeneralRangeV1 {
            action,
            selection_update,
            pending_update,
            before_ui,
            after_ui,
            history_key,
            expected,
        });
        if let Some(request) = typing {
            candidate.typing_after(request)?;
        }
        self.adopt(candidate)?;
        Ok(true)
    }
    pub(super) fn execute_general_range(
        &mut self,
        action: &ReplaceGeneralTextRangeV1,
        selection: &SelectionUpdate,
        pending: &PendingFormatsUpdate,
        keep_open: bool,
    ) -> Result<String, Error> {
        if !self.general_ranges_enabled() {
            return Err(Error::Contract("general semantic replay family required"));
        }
        self.refresh_document()?;
        let source = self.document.clone();
        let plan = action.plan(&self.codec, &source)?;
        let before_ui = self.journal.ui.clone();
        let before_selection = self.selection_for_mapping()?;
        let stamp = Stamp::next(&self.doc)?;
        let before_preparation = self.doc.state_frontiers();
        self.undo.pause();
        action.prepare(&self.doc, &plan)?;
        self.doc.commit();
        self.undo.resume();
        if self.reviewed_history.is_some() {
            let prepared: loro_internal::undo::DiffBatch =
                self.doc.diff(&before_preparation, &self.doc.state_frontiers())?.into();
            self.reviewed_external(&prepared)?;
        }
        self.refresh_document()?;
        if self.document.document() != source.document() {
            return Err(Error::Contract("general preparation changed visible source"));
        }
        let history_key = stamp.key();
        let meta = self.journal.ui.engine_meta(&self.doc, &history_key)?;
        let mut marker = loro::UndoItemMeta::new();
        marker.set_value(history_key.clone().into());
        self.metadata.lock().push = marker;
        let frontier = self.doc.state_frontiers();
        let undo_count = self.undo.undo_count();
        self.undo.group_start()?;
        action.apply(&self.doc, &self.codec, &self.document, stamp, &plan)?;
        self.doc.commit();
        self.refresh_document()?;
        if !keep_open {
            self.undo.group_end();
        }
        if self.undo.undo_count() == undo_count {
            return Err(Error::Contract("general semantic edit created no history"));
        }
        self.cursors.authored(history_key.clone(), frontier, self.doc.state_frontiers(), meta)?;
        self.history_keys.authored(history_key.clone());
        self.journal.ui.normalize(&self.doc, &self.document, before_selection.as_ref())?;
        self.journal.ui.after(&self.codec, &self.doc, &self.document, selection, pending)?;
        self.recipes.insert(
            history_key.clone(),
            Recipe { before: before_ui, after: self.journal.ui.clone() },
        );
        self.record_reviewed_local(&history_key, false)?;
        Ok(history_key)
    }
}
