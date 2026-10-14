//! Internal export/restore boundary with complete local history replay.

use super::{
    RichLocalSession, RichLocalSessionError, RichLocalState, history_entry::RichHistoryEntry,
    history_recipe::HistoryRecipe, local_rewrite::LocalRewrite,
};
use crate::{
    document::FormatSet,
    rich_content::{RichDocument, RichSelectionKind},
    session::HistoryCapacity,
    state::{EditorContext, Revision},
};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub(crate) struct Metadata {
    pub(crate) selection: Option<RichSelectionKind>,
    pub(crate) pending: Option<FormatSet>,
    pub(crate) revision: Revision,
}

impl Metadata {
    pub(crate) fn from_state(state: &RichLocalState) -> Self {
        // New state fields require explicit durability classification here.
        let RichLocalState { document: _, selection, pending_formats, revision } = state;
        Self {
            selection: selection.as_ref().map(|value| value.kind().clone()),
            pending: pending_formats.clone(),
            revision: *revision,
        }
    }
    fn state(
        self,
        context: &EditorContext,
        document: RichDocument,
    ) -> Result<RichLocalState, RichLocalSessionError> {
        RichLocalState::try_new(context, document, self.selection, self.pending, self.revision)
    }
}

#[derive(Clone)]
pub(crate) struct Entry {
    pub(crate) before: Metadata,
    pub(crate) after: Metadata,
    pub(crate) recipe: LocalRewrite,
}

#[derive(Clone)]
pub(crate) struct Checkpoint {
    pub(crate) base: RichDocument,
    pub(crate) base_metadata: Metadata,
    pub(crate) entries: Vec<Entry>,
    pub(crate) current: Metadata,
    pub(crate) cursor: usize,
    pub(crate) capacity: HistoryCapacity,
}

impl RichLocalSession {
    pub(crate) fn durable_checkpoint(&self) -> Result<Checkpoint, RichLocalSessionError> {
        let base = self.entries.first().map_or(&self.state, |entry| &entry.before);
        let mut entries = Vec::with_capacity(self.entries.len());
        for entry in &self.entries {
            if entry.forward.apply(&self.context, &entry.before.document)?.document()
                != entry.after.document.document()
                || entry.inverse.apply(&self.context, &entry.after.document)?.document()
                    != entry.before.document.document()
            {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
            entries.push(Entry {
                before: Metadata::from_state(&entry.before),
                after: Metadata::from_state(&entry.after),
                recipe: LocalRewrite::between(&entry.before.document, &entry.after.document),
            });
        }
        let boundary = if self.cursor == 0 {
            &base.document
        } else {
            &self.entries[self.cursor - 1].after.document
        };
        if boundary.document() != self.state.document.document() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        Ok(Checkpoint {
            base: base.document.clone(),
            base_metadata: Metadata::from_state(base),
            entries,
            current: Metadata::from_state(&self.state),
            cursor: self.cursor,
            capacity: self.capacity,
        })
    }

    pub(crate) fn restore_checkpoint(
        context: EditorContext,
        checkpoint: Checkpoint,
    ) -> Result<Self, RichLocalSessionError> {
        let Checkpoint { base, base_metadata, entries: records, current, cursor, capacity } =
            checkpoint;
        if records.len() > capacity.as_usize() || cursor > records.len() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let base = base_metadata.state(&context, base)?;
        let mut document = base.document.clone();
        let mut revision = base.revision;
        let mut entries = Vec::with_capacity(records.len());
        for Entry { before, after, recipe } in records {
            if before.revision < revision || after.revision != before.revision.successor()? {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
            let before = before.state(&context, document.clone())?;
            document = recipe.apply(&context, &document)?;
            let after = after.state(&context, document.clone())?;
            let inverse = recipe.inverse();
            if inverse.apply(&context, &document)?.document() != before.document.document() {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
            revision = after.revision;
            entries.push(RichHistoryEntry {
                before,
                after,
                forward: HistoryRecipe::Recovered(recipe),
                inverse: HistoryRecipe::Recovered(inverse),
            });
        }
        if current.revision < revision {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let boundary =
            if cursor == 0 { base.document } else { entries[cursor - 1].after.document.clone() };
        let state = current.state(&context, boundary)?;
        Ok(Self { context, state, entries, cursor, capacity, token: Arc::new(()) })
    }
}
