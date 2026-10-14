//! Split logical text without moving or recreating its original character IDs.
use super::{
    cuts::{self, Cut},
    graph::{self, Origin},
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
/// This lowerer changes text routing only. The coordinator must separately admit
/// and publish the right paragraph's structural birth in the same history group.
pub struct PreparedSplit {
    version: VersionVector,
    target: String,
    assignments: Vec<super::Chunk>,
    moves: Vec<String>,
    fragment: String,
    cut: Cut,
}
impl PreparedSplit {
    /// Validate a scalar-aligned cut and prepare its immutable routing definitions.
    ///
    /// # Errors
    /// Rejects missing/non-top roots, historical right identities, invalid offsets
    /// and malformed causal data. Preparation must run on a disposable candidate.
    pub fn prepare(doc: &LoroDoc, left: &str, offset: u32, right: &str) -> Result<Self, Error> {
        crate::actions::validate_id(right)?;
        let index = Index::read(doc)?;
        if index.graph.definitions.contains_key(&graph::root(right))
            || super::super::model::existing_text(doc, right).is_some()
        {
            return Err(Error::Contract("fresh text-flow split identity"));
        }
        let view = index.view(left)?;
        if view.owner != left {
            return Err(Error::Contract("split requires top text root"));
        }
        let point = index.point(doc, left, offset, Affinity::After)?;
        let origin_text =
            super::super::model::existing_text(doc, &point.source).ok_or(Error::Anchor)?;
        let origin = Origin {
            source: point.source.clone(),
            anchor: Some(TextAnchor::capture(&origin_text, point.offset, Affinity::After)?),
        };
        let mut assignments = vec![];
        let mut moves = vec![];
        let fragment = graph::tail(right);
        if offset < view.len()? {
            let tail = index.intervals(left, offset, view.len()? - offset)?;
            // The first fragment may contain several formatting/ownership runs.
            // Assign only its suffix. Following sibling roots/fragments retain
            // their identity and are moved as subtrees, not flattened strings.
            let first = tail.first().ok_or(Error::Offset)?.fragment.clone();
            let full = index.chunks.get(&first).ok_or(Error::Anchor)?;
            let partial = tail[0].start != full[0].start;
            if partial {
                assignments =
                    tail.iter().take_while(|chunk| chunk.fragment == first).cloned().collect();
            } else {
                moves.push(first.clone());
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
        let cut = Cut {
            left: left.into(),
            right: right.into(),
            source: origin.source.clone(),
            anchor: origin.anchor.clone().ok_or(Error::Anchor)?,
        };
        graph::prepare_root(doc, right, Some(origin))?;
        cuts::prepare(doc, right)?;
        if !assignments.is_empty() {
            graph::prepare_fragment(doc, &fragment, &point.source, &graph::root(right))?;
        }
        Ok(Self {
            version: doc.oplog_vv(),
            target: graph::root(right),
            assignments,
            moves,
            fragment,
            cut,
        })
    }
    /// Apply only routing/ownership effects under the caller's explicit undo group.
    ///
    /// # Errors
    /// Stale plans reject before writes. Other failures require discarding the
    /// staged document; this low-level API is not an atomic publication boundary.
    pub fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        if doc.oplog_vv() != self.version {
            return Err(Error::Contract("stale text-flow split"));
        }
        let stamp = Stamp::next(doc)?;
        cuts::write(doc, &self.cut, stamp)?;
        for chunk in &self.assignments {
            markers::mark(doc, &chunk.source, chunk.start, chunk.length, &self.fragment, stamp, 0)?;
        }
        for (ordinal, node) in self.moves.iter().enumerate() {
            graph::move_node(doc, node, &self.target, stamp, ordinal)?;
        }
        // An end split has no characters to move. Its structural birth is still
        // meaningful, but no synthetic character is added to make history nonempty.
        Ok(())
    }
}
