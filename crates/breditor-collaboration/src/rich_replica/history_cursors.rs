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
    // Only the explicitly reviewed owner uses a virtual arrival-basis inverse. An imported
    // host effect was external to older items; its first owned inverse must cross a barrier.
    owned_inverse: Option<DiffBatch>,
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
    fn fork(&self) -> Result<Self, Error> {
        Ok(Self {
            rows: self
                .rows
                .iter()
                .map(|row| {
                    Ok(Row {
                        items: row.items.clone(),
                        remote: Arc::new(Mutex::new(
                            row.remote
                                .lock()
                                .map_err(|_| Error::Contract("history cursor lock"))?
                                .clone(),
                        )),
                    })
                })
                .collect::<Result<_, Error>>()?,
        })
    }
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
    /// The reviewed owner and its ordered native row witness must retain exactly the same keys.
    pub fn check_keys<'a>(
        &self,
        redo: bool,
        keys: impl Iterator<Item = &'a str>,
    ) -> Result<(), Error> {
        let stack = if redo { &self.redo } else { &self.undo };
        if !stack.rows.iter().flat_map(|row| &row.items).map(|item| item.key.as_str()).eq(keys) {
            return Err(Error::ReplayMismatch);
        }
        Ok(())
    }
    /// Independent copy of the native grouping and remote-coordinate witness at activation.
    pub fn fork(&self) -> Result<Self, Error> {
        Ok(Self { undo: self.undo.fork()?, redo: self.redo.fork()? })
    }
    /// Append an owned received contribution in THIS device's arrival basis. Older history
    /// already observed that contribution as external, so its first inverse is a row barrier.
    pub fn owned(
        &mut self,
        doc: &LoroDoc,
        key: String,
        before: Frontiers,
        after: Frontiers,
        meta: UndoItemMeta,
    ) -> Result<(), Error> {
        let mut inverse: DiffBatch = doc.diff(&after, &before)?.into();
        let intervening: DiffBatch = doc.diff(&after, &doc.state_frontiers())?.into();
        inverse.transform(&intervening, true);
        self.undo.rows.push(Row {
            items: vec![Item { key, before, after, meta, owned_inverse: Some(inverse) }],
            remote: Arc::default(),
        });
        self.redo = Stack::default();
        Ok(())
    }
    /// Derive an inverse against the ordered row witness, not a global historical checkout diff.
    /// Newer owned inverses may recreate text IDs; those are not external peer insertions.
    pub fn take_inverse(
        &mut self,
        doc: &LoroDoc,
        redo: bool,
        key: &str,
    ) -> Result<(UndoItemMeta, DiffBatch, DiffBatch), Error> {
        let stack = if redo { &mut self.redo } else { &mut self.undo };
        let (item, remote) = stack.pop()?;
        if item.key != key {
            return Err(Error::ReplayMismatch);
        }
        let barrier = item.owned_inverse.is_some();
        let raw: DiffBatch = match item.owned_inverse {
            Some(inverse) => inverse,
            None => doc.diff(&item.after, &item.before)?.into(),
        };
        let external = remote.lock().map_err(|_| Error::Contract("history cursor lock"))?.clone();
        let mut inverse = raw.clone();
        inverse.transform(&external, true);
        let coordinates = if barrier {
            // The prior row ends at arrival and already includes the original host effect.
            // Compose the row's external changes and this real inverse into that prior row;
            // never merge a host-before-basis delta into an arrival-basis remote witness.
            if !stack.rows.last().is_some_and(|row| row.items.is_empty()) {
                return Err(Error::ReplayMismatch);
            }
            stack.rows.pop().ok_or(Error::ReplayMismatch)?;
            let mut transition = external;
            transition.compose(&inverse);
            stack.compose(&transition)?;
            transition
        } else {
            stack.transform(&raw)?;
            remote.lock().map_err(|_| Error::Contract("history cursor lock"))?.clone()
        };
        Ok((item.meta, coordinates, inverse))
    }
    /// Clone an exact retained span when explicitly transferring local history ownership.
    pub fn retained_span(
        &self,
        redo: bool,
        key: &str,
    ) -> Result<(Frontiers, Frontiers, UndoItemMeta), Error> {
        let stack = if redo { &self.redo } else { &self.undo };
        let item = stack
            .rows
            .iter()
            .flat_map(|row| &row.items)
            .find(|item| item.key == key)
            .ok_or(Error::ReplayMismatch)?;
        Ok((item.before.clone(), item.after.clone(), item.meta.clone()))
    }
    /// Exact semantic span of the most recent local item, excluding paused immutable preparation.
    /// This is a read of the existing engine grouping mirror, never a new history owner.
    pub fn latest_authored(&self, key: &str) -> Result<(&Frontiers, &Frontiers), Error> {
        let item = self
            .undo
            .rows
            .iter()
            .rev()
            .find_map(|row| row.items.last())
            .ok_or(Error::ReplayMismatch)?;
        if item.key != key {
            return Err(Error::ReplayMismatch);
        }
        Ok((&item.before, &item.after))
    }
    pub fn authored(
        &mut self,
        key: String,
        before: Frontiers,
        after: Frontiers,
        meta: UndoItemMeta,
    ) -> Result<(), Error> {
        self.undo.push(Item { key, before, after, meta, owned_inverse: None })?;
        self.redo = Stack::default();
        Ok(())
    }
    pub fn imported(&mut self, diff: &DiffBatch) -> Result<(), Error> {
        self.undo.compose(diff)?;
        self.redo.compose(diff)
    }
    pub fn extend(&mut self, key: &str, after: Frontiers) -> Result<(), Error> {
        let item = self
            .undo
            .rows
            .iter_mut()
            .rev()
            .find_map(|row| row.items.last_mut())
            .ok_or(Error::ReplayMismatch)?;
        if item.key != key {
            return Err(Error::ReplayMismatch);
        }
        item.after = after;
        self.redo = Stack::default();
        Ok(())
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
        stack.push(Item { key, before, after, meta, owned_inverse: None })
    }
}
