//! Relocation through text replacement and independent list-container reparenting.
use super::{
    PointRelocation, RelocationError, RootTextRange,
    relocation::{point_at_offset, point_offset_in_container},
};
use crate::{
    document::Document,
    position::{Affinity, NodePath, Point, TextOffset},
};
use std::sync::Arc;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct FlatListTextReplaceMap {
    pub(super) root_start: u32,
    pub(super) old_end: u32,
    pub(super) new_end: u32,
    pub(super) range: RootTextRange,
    pub(super) after_offset: TextOffset,
    pub(super) inserted_count: u32,
    pub(super) source_paths: Arc<[NodePath]>,
    pub(super) result_paths: Arc<[NodePath]>,
    pub(super) preserves_text: bool,
}
impl FlatListTextReplaceMap {
    pub(super) fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        point.resolve(before).map_err(RelocationError::InvalidSourcePoint)?;
        let path = point.target_path().as_slice();
        let outcome = if path.is_empty() {
            let Point::Children { child_index, affinity, .. } = point else {
                return Err(RelocationError::CoordinateOverflow);
            };
            if *child_index <= self.root_start {
                PointRelocation::Exact(point.clone())
            } else if *child_index >= self.old_end {
                PointRelocation::Exact(Point::Children {
                    parent_path: NodePath::root(),
                    child_index: self.shift_root(*child_index)?,
                    affinity: *affinity,
                })
            } else {
                self.gap(after, &[*child_index], *affinity)?
            }
        } else if path[0] < self.root_start {
            PointRelocation::Exact(point.clone())
        } else if path[0] >= self.old_end {
            let mut path = path.to_vec();
            path[0] = self.shift_root(path[0])?;
            PointRelocation::Exact(repath(point, path)?)
        } else if let Some(index) =
            self.source_paths.iter().position(|block| path.starts_with(block.as_slice()))
        {
            self.block_point(before, after, point, index)?
        } else {
            let Point::Children { child_index, affinity, .. } = point else {
                return Err(RelocationError::CoordinateOverflow);
            };
            let mut boundary = path.to_vec();
            boundary.push(*child_index);
            self.gap(after, &boundary, *affinity)?
        };
        match &outcome {
            PointRelocation::Exact(point) => {
                point.resolve(after).map_err(RelocationError::InvalidResultPoint)?;
            }
            PointRelocation::Deleted { before, after: tail } => {
                before.resolve(after).map_err(RelocationError::InvalidResultPoint)?;
                tail.resolve(after).map_err(RelocationError::InvalidResultPoint)?;
            }
        }
        Ok(outcome)
    }
    fn first(&self) -> usize {
        self.range.start().paragraph_index() as usize
    }
    fn last(&self) -> usize {
        self.range.end().paragraph_index() as usize
    }
    fn result_last(&self) -> Result<usize, RelocationError> {
        self.first()
            .checked_add(self.inserted_count as usize)
            .and_then(|n| n.checked_sub(1))
            .ok_or(RelocationError::CoordinateOverflow)
    }
    fn shift_root(&self, index: u32) -> Result<u32, RelocationError> {
        index
            .checked_sub(self.old_end)
            .and_then(|n| self.new_end.checked_add(n))
            .ok_or(RelocationError::CoordinateOverflow)
    }
    fn shift_block(&self, index: usize) -> Result<usize, RelocationError> {
        index
            .checked_sub(self.last() + 1)
            .and_then(|n| self.first().checked_add(self.inserted_count as usize)?.checked_add(n))
            .ok_or(RelocationError::CoordinateOverflow)
    }
    fn exact(
        &self,
        after: &Document,
        index: usize,
        offset: TextOffset,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        point_at_offset(
            after,
            self.result_paths.get(index).ok_or(RelocationError::CoordinateOverflow)?,
            offset,
            affinity,
        )
        .map(PointRelocation::Exact)
    }
    fn edit_edges(
        &self,
        after: &Document,
        affinity: Affinity,
    ) -> Result<(Point, Point), RelocationError> {
        let first =
            self.result_paths.get(self.first()).ok_or(RelocationError::CoordinateOverflow)?;
        let last = self
            .result_paths
            .get(self.result_last()?)
            .ok_or(RelocationError::CoordinateOverflow)?;
        Ok((
            point_at_offset(after, first, self.range.start().offset(), affinity)?,
            point_at_offset(after, last, self.after_offset, affinity)?,
        ))
    }
    fn deleted(
        &self,
        after: &Document,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        let (before, after) = self.edit_edges(after, affinity)?;
        Ok(PointRelocation::Deleted { before, after })
    }
    fn block_point(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
        index: usize,
    ) -> Result<PointRelocation, RelocationError> {
        if index < self.first() || index > self.last() {
            let mapped = if index < self.first() { index } else { self.shift_block(index)? };
            let mut path =
                self.result_paths.get(mapped).ok_or(RelocationError::CoordinateOverflow)?.to_vec();
            path.extend_from_slice(
                &point.target_path().as_slice()[self.source_paths[index].len()..],
            );
            return Ok(PointRelocation::Exact(repath(point, path)?));
        }
        let offset = point_offset_in_container(before, &self.source_paths[index], point)?;
        let affinity = point.affinity();
        if self.preserves_text {
            return self.exact(after, index, offset, affinity);
        }
        if index == self.first() && offset < self.range.start().offset() {
            return self.exact(after, self.first(), offset, affinity);
        }
        if index == self.last() && offset > self.range.end().offset() {
            return self.exact(
                after,
                self.result_last()?,
                self.after_offset.checked_add(offset.get() - self.range.end().offset().get())?,
                affinity,
            );
        }
        if index == self.first() && offset == self.range.start().offset() {
            let (before, after) = self.edit_edges(after, affinity)?;
            return Ok(PointRelocation::Exact(if affinity == Affinity::Before {
                before
            } else {
                after
            }));
        }
        if index == self.last() && offset == self.range.end().offset() {
            return self.exact(after, self.result_last()?, self.after_offset, affinity);
        }
        self.deleted(after, affinity)
    }
    fn gap(
        &self,
        after: &Document,
        boundary: &[u32],
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        let source_gap = self.source_paths.partition_point(|path| path.as_slice() < boundary);
        if !self.preserves_text && source_gap > self.first() && source_gap <= self.last() {
            return self.deleted(after, affinity);
        }
        let gap = if self.preserves_text || source_gap <= self.first() {
            source_gap
        } else {
            self.shift_block(source_gap)?
        };
        let previous = gap > 0 && (affinity == Affinity::Before || gap == self.result_paths.len());
        let index = if previous { gap - 1 } else { gap };
        let path = self.result_paths.get(index).ok_or(RelocationError::CoordinateOverflow)?;
        let block = after.node_at(path)?.as_element().ok_or(RelocationError::CoordinateOverflow)?;
        let child_index = if previous {
            u32::try_from(block.children().len())
                .map_err(|_| RelocationError::CoordinateOverflow)?
        } else {
            0
        };
        Ok(PointRelocation::Exact(Point::Children {
            parent_path: path.clone(),
            child_index,
            affinity,
        }))
    }
}
fn repath(point: &Point, path: Vec<u32>) -> Result<Point, RelocationError> {
    let path = NodePath::try_from_indices(path).map_err(|_| RelocationError::CoordinateOverflow)?;
    Ok(match point {
        Point::Text { utf16_offset, affinity, .. } => {
            Point::Text { text_path: path, utf16_offset: *utf16_offset, affinity: *affinity }
        }
        Point::Children { child_index, affinity, .. } => {
            Point::Children { parent_path: path, child_index: *child_index, affinity: *affinity }
        }
    })
}
