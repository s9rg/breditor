//! Block-prefix relocation for container-only list edits.

use super::{PointRelocation, RelocationError};
use crate::{
    document::Document,
    position::{Affinity, NodePath, Point},
};
use std::sync::Arc;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct FlatListReframeMap {
    start: u32,
    old_end: u32,
    new_end: u32,
    source: Arc<[NodePath]>,
    result: Arc<[NodePath]>,
}

impl FlatListReframeMap {
    pub(crate) fn new(
        start: u32,
        old_end: u32,
        new_end: u32,
        source: Arc<[NodePath]>,
        result: Arc<[NodePath]>,
    ) -> Self {
        Self { start, old_end, new_end, source, result }
    }

    pub(crate) fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        point.resolve(before).map_err(RelocationError::InvalidSourcePoint)?;
        let path = point.target_path().as_slice();
        let mapped = if path.is_empty() {
            let Point::Children { child_index, affinity, .. } = point else {
                return Err(RelocationError::CoordinateOverflow);
            };
            if *child_index <= self.start {
                point.clone()
            } else if *child_index >= self.old_end {
                Point::Children {
                    parent_path: NodePath::root(),
                    child_index: self.shift(*child_index)?,
                    affinity: *affinity,
                }
            } else {
                self.gap(after, &[*child_index], *affinity)?
            }
        } else if path[0] < self.start {
            point.clone()
        } else if path[0] >= self.old_end {
            let mut shifted = path.to_vec();
            shifted[0] = self.shift(shifted[0])?;
            replace_path(point, shifted)?
        } else if let Some(index) =
            self.source.iter().position(|block| path.starts_with(block.as_slice()))
        {
            let mut mapped = self.result[index].to_vec();
            mapped.extend_from_slice(&path[self.source[index].len()..]);
            replace_path(point, mapped)?
        } else {
            // Container boundaries have no text-leaf identity. Canonicalize the
            // same flattened gap to the affinity-owned adjacent text block.
            let Point::Children { child_index, affinity, .. } = point else {
                return Err(RelocationError::CoordinateOverflow);
            };
            let mut boundary = path.to_vec();
            boundary.push(*child_index);
            self.gap(after, &boundary, *affinity)?
        };
        mapped.resolve(after).map_err(RelocationError::InvalidResultPoint)?;
        Ok(PointRelocation::Exact(mapped))
    }

    fn shift(&self, index: u32) -> Result<u32, RelocationError> {
        index
            .checked_sub(self.old_end)
            .and_then(|tail| self.new_end.checked_add(tail))
            .ok_or(RelocationError::CoordinateOverflow)
    }

    fn gap(
        &self,
        after: &Document,
        boundary: &[u32],
        affinity: Affinity,
    ) -> Result<Point, RelocationError> {
        let gap = self.source.partition_point(|path| path.as_slice() < boundary);
        let use_previous = gap > 0 && (affinity == Affinity::Before || gap == self.result.len());
        let index = if use_previous { gap - 1 } else { gap };
        let path = self.result.get(index).ok_or(RelocationError::CoordinateOverflow)?;
        let block = after.node_at(path)?.as_element().ok_or(RelocationError::CoordinateOverflow)?;
        let child_index = if use_previous {
            u32::try_from(block.children().len())
                .map_err(|_| RelocationError::CoordinateOverflow)?
        } else {
            0
        };
        Ok(Point::Children { parent_path: path.clone(), child_index, affinity })
    }
}

fn replace_path(point: &Point, path: Vec<u32>) -> Result<Point, RelocationError> {
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
