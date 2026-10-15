//! Join ordered text roots while retaining all original text containers and cursors.
use super::{graph, index::Index};
use crate::{Error, register::Stamp};
use loro::{LoroDoc, VersionVector};

/// A prepared routing join; AST sibling/grammar admission belongs to the coordinator.
pub struct PreparedJoin {
    version: VersionVector,
    left: String,
    right: String,
}
impl PreparedJoin {
    /// Prepare a join of distinct top-level text roots without changing text.
    /// # Errors
    /// Rejects missing, equal or already attached roots and malformed causal state.
    pub fn prepare(doc: &LoroDoc, left: &str, right: &str) -> Result<Self, Error> {
        let index = Index::read(doc)?;
        if left == right || index.view(left)?.owner != left || index.view(right)?.owner != right {
            return Err(Error::Contract("join requires distinct top text roots"));
        }
        Ok(Self { version: doc.oplog_vv(), left: graph::root(left), right: graph::root(right) })
    }
    /// Reparent the whole right text root, including later offline character edits.
    /// # Errors
    /// A stale plan rejects before writing; other failures require discarding its staged owner.
    pub fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        if doc.oplog_vv() != self.version {
            return Err(Error::Contract("stale text-flow join"));
        }
        self.apply_staged(doc)
    }
    pub(in crate::rich_replica) fn apply_staged(&self, doc: &LoroDoc) -> Result<(), Error> {
        graph::move_node(doc, &self.right, &self.left, Stamp::next(doc)?, 0)
    }
}
