//! Witnessed multi-block replacement, including retained suffix and removed body positions.
//!
//! Inverse mapping relocates inserted text by affinity; it cannot reconstruct
//! deleted selections. Exact local undo restores saved before/after selections.

use super::{BlockId, RichSelectionError, RichTextPoint};
use crate::{
    document::{ElementNode, NodeRef},
    position::{Affinity, TextOffset},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RichRangeMap {
    pub(crate) first: BlockId,
    pub(crate) last: BlockId,
    pub(crate) start: TextOffset,
    pub(crate) end: TextOffset,
    pub(crate) inserted: TextOffset,
    pub(crate) before_first: NodeRef,
    pub(crate) before_last: NodeRef,
    pub(crate) after: NodeRef,
    pub(crate) removed: Vec<(BlockId, NodeRef)>,
    pub(crate) undoing: bool,
}

fn element(node: &NodeRef) -> Result<&ElementNode, RichSelectionError> {
    node.as_element().ok_or(RichSelectionError::Invariant)
}

impl RichRangeMap {
    pub(crate) fn inverse(&self) -> Self {
        let mut map = self.clone();
        map.undoing = !map.undoing;
        map
    }
    pub(super) fn map<'a>(
        &'a self,
        point: &RichTextPoint,
    ) -> Result<Option<(RichTextPoint, &'a ElementNode, &'a ElementNode)>, RichSelectionError> {
        let cut =
            self.start.checked_add(self.inserted.get()).map_err(|_| RichSelectionError::Offset)?;
        if self.undoing {
            if point.block() != &self.first {
                return Ok(None);
            }
            let suffix = point.offset() > cut
                || (point.offset() == cut && point.affinity() == Affinity::After);
            let (block, offset, target) = if suffix {
                (
                    &self.last,
                    self.end
                        .checked_add(point.offset().get() - cut.get())
                        .map_err(|_| RichSelectionError::Offset)?,
                    &self.before_last,
                )
            } else if point.offset() < self.start
                || (point.offset() == self.start && point.affinity() == Affinity::Before)
            {
                (&self.first, point.offset(), &self.before_first)
            } else if point.affinity() == Affinity::After {
                (&self.last, self.end, &self.before_last)
            } else {
                (&self.first, self.start, &self.before_first)
            };
            return Ok(Some((
                RichTextPoint::new(block.clone(), offset, point.affinity()),
                element(&self.after)?,
                element(target)?,
            )));
        }
        let witness = if point.block() == &self.first {
            Some(&self.before_first)
        } else if point.block() == &self.last {
            Some(&self.before_last)
        } else {
            self.removed.iter().find(|(block, _)| block == point.block()).map(|(_, node)| node)
        };
        let Some(witness) = witness else {
            return Ok(None);
        };
        let offset = if point.block() == &self.first && point.offset() < self.start {
            point.offset()
        } else if point.block() == &self.last && point.offset() >= self.end {
            cut.checked_add(point.offset().get() - self.end.get())
                .map_err(|_| RichSelectionError::Offset)?
        } else if point.affinity() == Affinity::Before {
            self.start
        } else {
            cut
        };
        Ok(Some((
            RichTextPoint::new(self.first.clone(), offset, point.affinity()),
            element(witness)?,
            element(&self.after)?,
        )))
    }
}
