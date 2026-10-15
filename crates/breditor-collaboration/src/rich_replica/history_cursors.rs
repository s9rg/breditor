//! Cursor-coordinate bases mirror history grouping; the engine still authors every inverse.
//!
//! Native history can recreate text items. Its cursor transform is left-biased,
//! unlike Breditor's character-affine anchors. This read-only projection tracks
//! remote deltas in the same before-span basis and repairs only recreated/deleted
//! references. It does not implement a CRDT or author any document operations.
use crate::Error;
use loro::{Frontiers, LoroDoc, UndoItemMeta};
use loro_internal::undo::DiffBatch;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
struct Item {
    key: String,
    before: Frontiers,
    after: Frontiers,
    meta: UndoItemMeta,
}
#[derive(Default)]
struct Row {
    items: Vec<Item>,
    remote: Arc<Mutex<DiffBatch>>,
}
#[derive(Default)]
struct Stack {
    rows: Vec<Row>,
}

impl Stack {
    fn compose(&mut self, diff: &DiffBatch) -> Result<(), Error> {
        if self.rows.iter().all(|row| row.items.is_empty()) {
            return Ok(());
        }
        if let Some(row) = self.rows.last_mut() {
            row.remote.lock().map_err(|_| Error::Contract("history cursor lock"))?.compose(diff);
        }
        Ok(())
    }
    fn push(&mut self, item: Item) -> Result<(), Error> {
        if self.rows.iter().all(|row| row.items.is_empty()) {
            self.rows.clear();
        }
        let fresh = if let Some(row) = self.rows.last() {
            !row.remote
                .lock()
                .map_err(|_| Error::Contract("history cursor lock"))?
                .cid_to_events
                .is_empty()
        } else {
            true
        };
        if fresh {
            self.rows.push(Row::default());
        }
        self.rows.last_mut().ok_or(Error::ReplayMismatch)?.items.push(item);
        Ok(())
    }
    fn pop(&mut self) -> Result<(Item, Arc<Mutex<DiffBatch>>), Error> {
        while self.rows.last().is_some_and(|row| row.items.is_empty()) {
            let row = self.rows.pop().ok_or(Error::ReplayMismatch)?;
            let diff = row.remote.lock().map_err(|_| Error::Contract("history cursor lock"))?;
            self.compose(&diff)?;
        }
        let row = self.rows.last_mut().ok_or(Error::ReplayMismatch)?;
        Ok((row.items.pop().ok_or(Error::ReplayMismatch)?, Arc::clone(&row.remote)))
    }
    fn transform(&mut self, inverse: &DiffBatch) -> Result<(), Error> {
        if let Some(row) = self.rows.last_mut() {
            row.remote
                .lock()
                .map_err(|_| Error::Contract("history cursor lock"))?
                .transform(inverse, false);
        }
        Ok(())
    }
}

#[derive(Default)]
pub(super) struct HistoryCursors {
    undo: Stack,
    redo: Stack,
}
impl HistoryCursors {
    pub fn authored(
        &mut self,
        key: String,
        before: Frontiers,
        after: Frontiers,
        meta: UndoItemMeta,
    ) -> Result<(), Error> {
        self.undo.push(Item { key, before, after, meta })?;
        self.redo = Stack::default();
        Ok(())
    }
    pub fn imported(&mut self, diff: &DiffBatch) -> Result<(), Error> {
        self.undo.compose(diff)?;
        self.redo.compose(diff)
    }
    pub fn pop(
        &mut self,
        doc: &LoroDoc,
        redo: bool,
        key: &str,
    ) -> Result<(UndoItemMeta, DiffBatch), Error> {
        let stack = if redo { &mut self.redo } else { &mut self.undo };
        let (item, remote) = stack.pop()?;
        if item.key != key {
            return Err(Error::ReplayMismatch);
        }
        let inverse: DiffBatch = doc.diff(&item.after, &item.before)?.into();
        stack.transform(&inverse)?;
        let diff = remote.lock().map_err(|_| Error::Contract("history cursor lock"))?.clone();
        Ok((item.meta, diff))
    }
    pub fn opposite(
        &mut self,
        redo: bool,
        key: String,
        before: Frontiers,
        after: Frontiers,
        meta: UndoItemMeta,
    ) -> Result<(), Error> {
        let stack = if redo { &mut self.undo } else { &mut self.redo };
        stack.push(Item { key, before, after, meta })
    }
}
