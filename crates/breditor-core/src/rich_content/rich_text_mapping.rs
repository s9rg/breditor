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

    fn offset(
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

pub(super) fn map_text(
    old: &ElementNode,
    new: &ElementNode,
    point: &RichTextPoint,
    maps: &[RichTextMap],
) -> Result<RichTextPoint, RichSelectionError> {
    let mut current = old;
    let mut offset = point.offset();
    for map in maps.iter().filter(|map| &map.block == point.block()) {
        let before = map.before.as_element().ok_or(RichSelectionError::Invariant)?;
        let after = map.after.as_element().ok_or(RichSelectionError::Invariant)?;
        if !same_text(current, before) {
            return Err(RichSelectionError::TextChanged);
        }
        offset = map.offset(offset, point.affinity())?;
        current = after;
    }
    if !same_text(current, new) {
        return Err(RichSelectionError::TextChanged);
    }
    Ok(RichTextPoint::new(point.block().clone(), offset, point.affinity()))
}
