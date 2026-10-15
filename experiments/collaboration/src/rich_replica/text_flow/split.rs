//! Split logical text without moving or recreating its original character IDs.
use super::{
    cuts::{self, Cut},
    graph,
    index::Index,
    markers,
};
use crate::{
    Error,
    anchor::{Affinity, TextAnchor},
    register::Stamp,
};
use loro::{LoroDoc, VersionVector};

/// A prepared split; permanent definitions are outside the caller's undo group.
///
/// The coordinator publishes the admitted right paragraph's structural birth and
/// these routing effects together. Its empty insertion source belongs to that
/// new paragraph, rather than an offset in a mutable neighbouring source.
pub struct PreparedSplit {
    version: VersionVector,
    target: String,
    assignments: Vec<super::Chunk>,
    moves: Vec<String>,
    fragment: String,
    cut: Cut,
}
impl PreparedSplit {
    /// Validate a scalar cut and prepare immutable routing definitions outside undo.
    /// # Errors
    /// Rejects invalid offsets, missing/non-top roots and historical right identities.
    /// Preparation must run on a disposable candidate.
    pub fn prepare(doc: &LoroDoc, left: &str, offset: u32, right: &str) -> Result<Self, Error> {
        crate::actions::validate_id(right)?;
        let index = Index::read(doc)?;
        if index.graph.definitions.contains_key(&graph::root(right))
            || super::super::model::existing_text(doc, right).is_some()
        {
            return Err(Error::Contract("fresh text-flow split identity"));
        }
        index.point(doc, left, offset, Affinity::After)?;
        Self::reserve(doc, right)?;
        Self::plan(doc, left, offset, right)
    }

    /// Reserve an initially unbound tail fragment. The actual action chooses its
    /// one source after earlier commands in the atomic group have executed.
    pub(in crate::rich_replica) fn reserve(doc: &LoroDoc, right: &str) -> Result<(), Error> {
        graph::prepare_root(doc, right)?;
        graph::prepare_fragment(doc, &graph::tail(right), None, &graph::root(right))?;
        cuts::prepare(doc, right)
    }

    pub(in crate::rich_replica) fn plan(
        doc: &LoroDoc,
        left: &str,
        offset: u32,
        right: &str,
    ) -> Result<Self, Error> {
        let index = Index::read(doc)?;
        let view = index.view(left)?;
        let target = index.view(right)?;
        if view.owner != left || target.owner != right || !target.is_empty() || left == right {
            return Err(Error::Contract(
                "split requires a top root and an empty reserved right root",
            ));
        }
        let point = index.point(doc, left, offset, Affinity::After)?;
        let source = super::super::model::existing_text(doc, &point.source).ok_or(Error::Anchor)?;
        let cut = Cut {
            left: left.into(),
            right: right.into(),
            source: point.source.clone(),
            anchor: TextAnchor::capture(&source, point.offset, Affinity::After)?,
        };
        let mut assignments = vec![];
        let mut moves = vec![];
        if offset < view.len()? {
            let tail = index.intervals(left, offset, view.len()? - offset)?;
            let first = tail.first().ok_or(Error::Offset)?.fragment.clone();
            let full = index.chunks.get(&first).ok_or(Error::Anchor)?;
            if tail[0].start == full[0].start {
                moves.push(first.clone());
            } else {
                assignments =
                    tail.iter().take_while(|chunk| chunk.fragment == first).cloned().collect();
            }
            let top = graph::root(left);
            let mut current = first;
            loop {
                let parent = index
                    .graph
                    .parent(&current)?
                    .ok_or(Error::Contract("split fragment parent"))?;
                let siblings = index.graph.children(parent)?;
                let position = siblings
                    .iter()
                    .position(|node| *node == current)
                    .ok_or(Error::Contract("split sibling occurrence"))?;
                moves.extend(siblings[position + 1..].iter().cloned());
                if parent == top {
                    break;
                }
                current = parent.into();
            }
        }
        Ok(Self {
            version: doc.oplog_vv(),
            target: graph::root(right),
            assignments,
            moves,
            fragment: graph::tail(right),
            cut,
        })
    }

    /// Apply routing and ownership under the caller's explicit undo group.
    /// # Errors
    /// Stale plans reject before writes. Other failures require discarding the staged owner.
    pub fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        if doc.oplog_vv() != self.version {
            return Err(Error::Contract("stale text-flow split"));
        }
        self.apply_staged(doc)
    }
    pub(in crate::rich_replica) fn apply_staged(&self, doc: &LoroDoc) -> Result<(), Error> {
        self.apply_owned(doc, Stamp::next(doc)?)
    }
    pub(in crate::rich_replica) fn apply_owned(
        &self,
        doc: &LoroDoc,
        activation: Stamp,
    ) -> Result<(), Error> {
        let stamp = Stamp::next(doc)?;
        cuts::write(doc, &self.cut, stamp)?;
        for chunk in &self.assignments {
            markers::mark(
                doc,
                &chunk.source,
                chunk.start,
                chunk.length,
                &self.fragment,
                markers::MarkerClock { stamp, activation, ordinal: 0 },
            )?;
        }
        for (ordinal, node) in self.moves.iter().enumerate() {
            graph::move_node(doc, node, &self.target, stamp, ordinal)?;
        }
        Ok(())
    }
}
