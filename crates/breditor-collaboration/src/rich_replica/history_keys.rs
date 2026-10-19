//! Exact engine-owned keys and original input counts, including invisible popped items.
use crate::Error;

#[derive(Clone)]
pub(super) struct Item {
    pub key: String,
    pub steps: u32,
}
#[derive(Default, Clone)]
pub(super) struct HistoryKeys {
    pub undo: Vec<Item>,
    pub redo: Vec<Item>,
}
impl HistoryKeys {
    pub fn authored(&mut self, key: String) {
        self.undo.push(Item { key, steps: 1 });
        self.redo.clear();
    }
    pub fn extend(&mut self, key: &str) -> Result<(), Error> {
        let item = self.undo.last_mut().ok_or(Error::ReplayMismatch)?;
        if item.key != key || item.steps >= breditor_core::rich_content::RICH_TYPING_GROUP_MAX_STEPS
        {
            return Err(Error::ReplayMismatch);
        }
        item.steps += 1;
        self.redo.clear();
        Ok(())
    }
    pub fn popped(&mut self, redo: bool, keys: &[String], changed: bool) -> Result<(), Error> {
        let (stack, opposite) =
            if redo { (&mut self.redo, &mut self.undo) } else { (&mut self.undo, &mut self.redo) };
        let mut last = None;
        for key in keys {
            let item = stack.pop().ok_or(Error::ReplayMismatch)?;
            if item.key != *key {
                return Err(Error::ReplayMismatch);
            }
            last = Some(item);
        }
        if changed {
            opposite.push(last.ok_or(Error::ReplayMismatch)?);
        }
        Ok(())
    }
    pub fn validate(&self, undo: usize, redo: usize) -> Result<(), Error> {
        if self.undo.len() != undo || self.redo.len() != redo {
            return Err(Error::ReplayMismatch);
        }
        Ok(())
    }
    pub fn steps(&self) -> usize {
        self.undo.iter().chain(&self.redo).map(|item| item.steps as usize).sum()
    }
}
