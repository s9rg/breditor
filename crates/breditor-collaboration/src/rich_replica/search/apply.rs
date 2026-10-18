//! Stage original-character splices, exact UI, replay effects and transport admission as one group.
use super::super::{
    RichReplica,
    history_metadata::Recipe,
    session::{Entry, MAX_UPDATE_BYTES, effects},
    text_flow,
};
use super::{SearchActionV1, insert, selection};
use crate::{Error, register::Stamp};
use breditor_core::rich_content::RichSearchReplacePlan;
use loro::ExportMode;
use std::collections::BTreeSet;

impl RichReplica {
    pub(in crate::rich_replica) fn apply_search_plan(
        &mut self,
        plan: &RichSearchReplacePlan,
    ) -> Result<bool, Error> {
        if plan.edits().is_empty() {
            return Ok(false);
        }
        let expected = plan
            .preview(&super::super::paragraphs::context(&self.codec), &self.document)
            .map_err(|_| Error::Contract("search complete native preview"))?;
        if expected.document() == self.document.document() {
            return Ok(false);
        }
        let action = SearchActionV1::capture(&self.codec, &self.document, plan)?;
        let mut candidate = self.staged()?;
        let before = candidate.doc.oplog_vv();
        let before_ui = candidate.journal.ui.clone();
        let history_key = candidate.execute_search(&action)?;
        if candidate.document.document() != expected.document() {
            return Err(Error::Contract("search lowering differs from native preview"));
        }
        if candidate.doc.export(ExportMode::updates(&before))?.len() > MAX_UPDATE_BYTES {
            return Err(Error::Limit("search authored update bytes"));
        }
        let expected = effects(&candidate.doc, &before)?;
        let after_ui = candidate.journal.ui.clone();
        candidate.journal.entries.push(Entry::SearchV1 {
            action,
            before_ui,
            after_ui,
            history_key,
            expected,
        });
        self.adopt(candidate)?;
        Ok(true)
    }
    pub(in crate::rich_replica) fn execute_search(
        &mut self,
        action: &SearchActionV1,
    ) -> Result<String, Error> {
        if !self.search_contract {
            return Err(Error::Contract("search semantic history required"));
        }
        self.refresh_document()?;
        let source = self.document.clone();
        let plan = action.plan(&self.codec, &source)?;
        let core_selection = selection::source(self)?;
        let preview = plan
            .preview_with_selection(
                &super::super::paragraphs::context(&self.codec),
                &source,
                core_selection.as_ref(),
            )
            .map_err(|_| Error::Contract("search native selection preview"))?;
        let before_ui = self.journal.ui.clone();
        let before_selection = self.selection_for_mapping()?;
        // Capture the first semantic priority before immutable preparation authors any operations.
        let stamp = Stamp::next(&self.doc)?;
        let before_preparation = self.doc.state_frontiers();
        self.undo.pause();
        let mut prepared = BTreeSet::new();
        for edit in plan.edits() {
            if prepared.insert(edit.block()) {
                text_flow::prepare_root(&self.doc, edit.block().as_str())?;
            }
        }
        self.doc.commit();
        self.undo.resume();
        if self.reviewed_history.is_some() {
            let diff: loro_internal::undo::DiffBatch =
                self.doc.diff(&before_preparation, &self.doc.state_frontiers())?.into();
            self.reviewed_external(&diff)?;
        }
        self.refresh_document()?;
        if self.document.document() != source.document() {
            return Err(Error::Contract("search preparation changed source"));
        }
        let history_key = stamp.key();
        let meta = self.journal.ui.engine_meta(&self.doc, &history_key)?;
        let mut marker = loro::UndoItemMeta::new();
        marker.set_value(history_key.clone().into());
        self.metadata.lock().push = marker;
        let frontier = self.doc.state_frontiers();
        let undo_count = self.undo.undo_count();
        let mut direct_splices = text_flow::PlainSearchSplices::capture(
            &self.doc,
            plan.edits().iter().map(|edit| edit.block().as_str()),
        )?;
        self.undo.group_start()?;
        for (ordinal, edit) in plan.edits().iter().rev().enumerate() {
            let edit_stamp = if ordinal == 0 { stamp } else { Stamp::next(&self.doc)? };
            let start = u32::try_from(edit.start().get()).map_err(|_| Error::Offset)?;
            let length =
                u32::try_from(edit.end().get() - edit.start().get()).map_err(|_| Error::Offset)?;
            if edit.inserted().iter().all(|run| run.formats().is_empty()) {
                let content: String =
                    edit.inserted().iter().map(breditor_core::document::TextRun::text).collect();
                if direct_splices.replace(
                    &self.doc,
                    edit.block().as_str(),
                    start..start + length,
                    &content,
                )? {
                    continue;
                }
            }
            if length > 0 {
                text_flow::delete(&self.doc, edit.block().as_str(), start, length)?;
            }
            self.doc.commit();
            insert::insert(&self.doc, &self.codec, edit, edit_stamp)?;
            self.doc.commit();
        }
        self.undo.group_end();
        self.refresh_document()?;
        if self.document.document() != preview.document().document()
            || self.undo.undo_count() == undo_count
        {
            return Err(Error::Contract("search semantic result or history differs"));
        }
        self.cursors.authored(history_key.clone(), frontier, self.doc.state_frontiers(), meta)?;
        self.history_keys.authored(history_key.clone());
        selection::apply(self, &preview, &before_ui, before_selection.as_ref())?;
        self.recipes.insert(
            history_key.clone(),
            Recipe { before: before_ui, after: self.journal.ui.clone() },
        );
        self.record_reviewed_local(&history_key, false)?;
        Ok(history_key)
    }
}
