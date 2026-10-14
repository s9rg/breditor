//! Witnessed local text-splice maps over stable block-relative UTF-16 positions.

use super::{BlockId, RichSelectionError, RichTextPoint, rich_selection_mapping::same_text};
use crate::{
    document::{ElementNode, NodeRef},
    position::{Affinity, TextOffset},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RichTextMap {
    pub(crate) block: BlockId,
    pub(crate) start: TextOffset,
    pub(crate) end: TextOffset,
    pub(crate) inserted: TextOffset,
    pub(crate) before: NodeRef,
    pub(crate) after: NodeRef,
}

impl RichTextMap {
    pub(crate) fn inverse(&self) -> Result<Self, RichSelectionError> {
        Ok(Self {
            block: self.block.clone(),
            start: self.start,
            end: self
                .start
                .checked_add(self.inserted.get())
                .map_err(|_| RichSelectionError::Offset)?,
            inserted: TextOffset::try_new(
                self.end.get().checked_sub(self.start.get()).ok_or(RichSelectionError::Offset)?,
            )
            .map_err(|_| RichSelectionError::Offset)?,
            before: self.after.clone(),
            after: self.before.clone(),
        })
    }

    pub(super) fn offset(
        &self,
        offset: TextOffset,
        affinity: Affinity,
    ) -> Result<TextOffset, RichSelectionError> {
        let x = offset.get();
        let start = self.start.get();
        let end = self.end.get();
        let value = if x < start {
            x
        } else if x >= end && end > start {
            x.checked_sub(end - start)
                .and_then(|x| x.checked_add(self.inserted.get()))
                .ok_or(RichSelectionError::Offset)?
        } else if x > end {
            x.checked_add(self.inserted.get()).ok_or(RichSelectionError::Offset)?
        } else if affinity == Affinity::Before {
            start
        } else {
            start.checked_add(self.inserted.get()).ok_or(RichSelectionError::Offset)?
        };
        TextOffset::try_new(value).map_err(|_| RichSelectionError::Offset)
    }
}

/// Witnessed split/join relation; inverse direction retains all original rich runs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RichBoundaryMap {
    pub(crate) left: BlockId,
    pub(crate) right: BlockId,
    pub(crate) offset: TextOffset,
    pub(crate) joined: NodeRef,
    pub(crate) left_node: NodeRef,
    pub(crate) right_node: NodeRef,
    pub(crate) splitting: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum RichPositionMap {
    Text(RichTextMap),
    Boundary(RichBoundaryMap),
}

impl RichPositionMap {
    pub(crate) fn inverse(&self) -> Result<Self, RichSelectionError> {
        match self {
            Self::Text(map) => Ok(Self::Text(map.inverse()?)),
            Self::Boundary(map) => {
                let mut inverse = map.clone();
                inverse.splitting = !inverse.splitting;
                Ok(Self::Boundary(inverse))
            }
        }
    }
}

fn element(node: &NodeRef) -> Result<&ElementNode, RichSelectionError> {
    node.as_element().ok_or(RichSelectionError::Invariant)
}

fn boundary<'a>(
    map: &'a RichBoundaryMap,
    point: &RichTextPoint,
) -> Result<Option<(RichTextPoint, &'a ElementNode, &'a ElementNode)>, RichSelectionError> {
    if map.splitting && point.block() == &map.left {
        let goes_right = point.offset() > map.offset
            || (point.offset() == map.offset && point.affinity() == Affinity::After);
        let (block, offset, node) = if goes_right {
            (
                &map.right,
                TextOffset::try_new(point.offset().get() - map.offset.get())
                    .map_err(|_| RichSelectionError::Offset)?,
                &map.right_node,
            )
        } else {
            (&map.left, point.offset(), &map.left_node)
        };
        return Ok(Some((
            RichTextPoint::new(block.clone(), offset, point.affinity()),
            element(&map.joined)?,
            element(node)?,
        )));
    }
    if !map.splitting && (point.block() == &map.left || point.block() == &map.right) {
        let from_right = point.block() == &map.right;
        let offset = if from_right {
            point.offset().checked_add(map.offset.get()).map_err(|_| RichSelectionError::Offset)?
        } else {
            point.offset()
        };
        return Ok(Some((
            RichTextPoint::new(map.left.clone(), offset, point.affinity()),
            element(if from_right { &map.right_node } else { &map.left_node })?,
            element(&map.joined)?,
        )));
    }
    Ok(None)
}

pub(super) fn map_text<'a>(
    old: &'a ElementNode,
    point: &RichTextPoint,
    maps: &'a [RichPositionMap],
) -> Result<(RichTextPoint, &'a ElementNode), RichSelectionError> {
    let mut current = old;
    let mut point = point.clone();
    for map in maps {
        let update = match map {
            RichPositionMap::Text(map) if &map.block == point.block() => Some((
                RichTextPoint::new(
                    point.block().clone(),
                    map.offset(point.offset(), point.affinity())?,
                    point.affinity(),
                ),
                element(&map.before)?,
                element(&map.after)?,
            )),
            RichPositionMap::Boundary(map) => boundary(map, &point)?,
            RichPositionMap::Text(_) => None,
        };
        if let Some((mapped, before, after)) = update {
            if !same_text(current, before) {
                return Err(RichSelectionError::TextChanged);
            }
            point = mapped;
            current = after;
        }
    }
    Ok((point, current))
}
