//! Deeply independent local reviewed-history rows for one disposable native staging candidate.
use super::ReviewedHistory;
use crate::Error;
impl ReviewedHistory {
    pub(in crate::rich_replica) fn fork(&self) -> Result<Self, Error> {
        Ok(Self {
            identity: self.identity.clone(),
            undo: self.undo.clone(),
            redo: self.redo.clone(),
            adopted: self.adopted.clone(),
            cursors: self.cursors.fork()?,
        })
    }
}
