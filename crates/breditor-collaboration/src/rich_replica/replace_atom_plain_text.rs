//! Plain atom replacement lowers to original owned insertion/deletion in one group.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::{DeleteBlock, InsertBlocks},
    atom_edit,
};
use crate::Error;
use serde_json::Value;
impl RichReplica {
    /// Replace a selected whole image/table/rule with one fresh plain paragraph.
    ///
    /// Empty explicit input intentionally replaces with an empty paragraph. Its
    /// final UTF-16 caret pins plain formats. Original commands and saved formats
    /// remain unchanged. Creator Undo hides the replacement birth; peer edits
    /// remain causal and reappear on Redo. No asset-store deletion is performed.
    /// # Errors
    /// Stale/read-only, non-atoms, reused IDs, input limits or failed admission are atomic.
    /// Original insertion admission requires transient node headroom before hiding the atom.
    pub fn replace_atom_plain_text_guarded(
        &mut self,
        observation: &SharedObservation,
        paragraph: &str,
        text: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let (commands, selection, pending) = self.plan_atom_replacement(paragraph, text)?;
        self.apply_with_state(commands, selection, pending)
    }
    pub(super) fn plan_atom_replacement(
        &self,
        paragraph: &str,
        text: &str,
    ) -> Result<(Vec<Command>, SelectionUpdate, PendingFormatsUpdate), Error> {
        let block = atom_edit::target(self)?;
        let node = atom_edit::paragraph(paragraph, text)?;
        let offset = u32::try_from(text.encode_utf16().count()).map_err(|_| Error::Offset)?;
        let root: Value = serde_json::from_str(&self.canonical)?;
        let (parent, _) = super::paragraphs::layout(&root["root"], &block)?;
        Ok((
            vec![
                Command::InsertBlocks(InsertBlocks {
                    parent,
                    before: Some(block.clone()),
                    nodes: vec![node],
                }),
                Command::DeleteBlock(DeleteBlock { block }),
            ],
            SelectionUpdate::Set(Some(atom_edit::caret(paragraph, offset))),
            PendingFormatsUpdate::Set(Some(vec![])),
        ))
    }
}
