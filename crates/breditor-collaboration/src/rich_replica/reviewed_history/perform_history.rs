//! Selectively inverse one ordered contribution on the actual local writer, never an AST snapshot.
use super::Item;
use crate::{Error, rich_replica::RichReplica};
use loro_internal::undo::DiffBatch;
impl RichReplica {
    pub(in crate::rich_replica) fn perform_reviewed_history(
        &mut self,
        redo: bool,
    ) -> Result<(bool, Vec<String>), Error> {
        let previous = self.selection_for_mapping()?;
        let mut popped = Vec::new();
        let mut repaired = None;
        let mut changed = false;
        loop {
            let history = self.reviewed_history.as_mut().ok_or(Error::ReplayMismatch)?;
            let Some(item) = (if redo { &mut history.redo } else { &mut history.undo }).pop()
            else {
                break;
            };
            let recipe = self.recipes.get(&item.key).ok_or(Error::ReplayMismatch)?;
            let opposite = if redo { &recipe.before } else { &recipe.after }
                .engine_meta(&self.doc, &item.key)?;
            let before = self.doc.state_frontiers();
            let (meta, coordinates, inverse) = self
                .reviewed_history
                .as_mut()
                .ok_or(Error::ReplayMismatch)?
                .cursors
                .take_inverse(&self.doc, redo, &item.key)?;
            self.undo.group_end();
            self.undo.pause();
            let applied = self.doc.apply_diff(inverse.into());
            self.doc.commit();
            self.undo.resume();
            applied?;
            let after = self.doc.state_frontiers();
            changed = after != before;
            let actual: DiffBatch = self.doc.diff(&before, &after)?.into();
            self.cursors.imported(&actual)?;
            popped.push(item.key.clone());
            repaired = Some((item.key.clone(), meta, coordinates));
            if changed {
                let history = self.reviewed_history.as_mut().ok_or(Error::ReplayMismatch)?;
                history.cursors.opposite(
                    redo,
                    item.key.clone(),
                    before.clone(),
                    after.clone(),
                    opposite,
                )?;
                (if redo { &mut history.undo } else { &mut history.redo }).push(Item {
                    key: item.key,
                    steps: item.steps,
                    ui_basis: before.clone(),
                    before,
                    after,
                });
                break;
            }
        }
        self.refresh_document()?;
        if let Some((key, meta, diff)) = repaired {
            let recipe = self.recipes.get_mut(&key).ok_or(Error::ReplayMismatch)?;
            let state = if redo { &mut recipe.after } else { &mut recipe.before };
            state.apply_engine_cursors(&self.doc, &meta, &diff)?;
            self.journal.ui = state.clone();
            self.journal.ui.normalize(&self.doc, &self.document, previous.as_ref())?;
        }
        if let Some(typing) = &mut self.typing {
            typing.continuation = None;
        }
        Ok((changed, popped))
    }
}
