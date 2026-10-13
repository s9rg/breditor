//! Deterministic, non-destructive merge overlays over stable ordered table axes.

use super::{CellId, ChangeId, ColumnId, MergeId, RowId, TableId};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use thiserror::Error;

/// Why checked table geometry cannot be constructed or resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum TableGeometryError {
    /// A provisional opt-in count/work ceiling was exceeded.
    #[error("table geometry exceeds its explicit count limits")]
    Limit,
    /// One ordered axis repeats an identity.
    #[error("table axes must contain unique stable identities")]
    DuplicateAxis,
    /// Bounds name a different table or a currently absent axis.
    #[error("merge bounds must identify cells in this visible table")]
    Bounds,
    /// Bounds are reversed in current row/column order.
    #[error("merge bounds must be ordered from top-left to bottom-right")]
    ReversedBounds,
    /// A merge must cover at least two base cells.
    #[error("a merge must contain at least two base cells")]
    Singleton,
    /// One merge identity carries different records.
    #[error("a merge identity cannot be reused for a different region")]
    MergeIdentityReuse,
    /// A merge record belongs to a different table.
    #[error("merge records must belong to the resolved table")]
    ForeignRegion,
}

/// Explicit host-lowerable ceilings for the opt-in geometry implementation.
///
/// Defaults exercise the plan's initial budgets; they are not shipping promises.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RichTableLimits {
    rows: usize,
    columns: usize,
    cells: usize,
    merges: usize,
}

impl Default for RichTableLimits {
    fn default() -> Self {
        Self { rows: 256, columns: 128, cells: 4096, merges: 256 }
    }
}

impl RichTableLimits {
    /// Select lower ceilings; zero merge records can disable merges.
    ///
    /// # Errors
    /// Rejects zero row/column/cell limits or values above provisional maxima.
    pub fn try_new(
        rows: usize,
        columns: usize,
        cells: usize,
        merges: usize,
    ) -> Result<Self, TableGeometryError> {
        if rows == 0
            || columns == 0
            || cells == 0
            || rows > 256
            || columns > 128
            || cells > 4096
            || merges > 256
        {
            return Err(TableGeometryError::Limit);
        }
        Ok(Self { rows, columns, cells, merges })
    }
}

/// Verified-by-host causal priority, ordered numerically by clock/writer/counter.
///
/// This value is not proof that a client owns the named replica or clock.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct CausalStamp {
    lamport: u64,
    change: ChangeId,
}

impl CausalStamp {
    /// Combine a host-verified causal clock with a typed logical change identity.
    #[must_use]
    pub const fn new(lamport: u64, change: ChangeId) -> Self {
        Self { lamport, change }
    }
    /// Exact numeric causal clock.
    #[must_use]
    pub const fn lamport(self) -> u64 {
        self.lamport
    }
    /// Logical action identity, distinct from the merge-region identity.
    #[must_use]
    pub const fn change(self) -> ChangeId {
        self.change
    }
}

/// Two stable base cells delimiting an inclusive rectangular selection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CellBounds {
    first: CellId,
    last: CellId,
}

impl CellBounds {
    /// Preserve bounds for validation against a specific ordered table snapshot.
    #[must_use]
    pub const fn new(first: CellId, last: CellId) -> Self {
        Self { first, last }
    }
}

/// Original merge intent, including the full axis context for move detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeRegion {
    id: MergeId,
    stamp: CausalStamp,
    table: TableId,
    row_context: Arc<[RowId]>,
    column_context: Arc<[ColumnId]>,
    row_start: usize,
    row_end: usize,
    column_start: usize,
    column_end: usize,
}

impl MergeRegion {
    /// Immutable region identity targeted by split/retraction.
    #[must_use]
    pub const fn id(&self) -> &MergeId {
        &self.id
    }
    /// Total-order priority; no wall-clock or locale-sensitive string sorting.
    #[must_use]
    pub const fn stamp(&self) -> CausalStamp {
        self.stamp
    }
}

/// A retained region that is inactive in this derived view, without content loss.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergeConflictReason {
    /// No captured member survives on at least one axis.
    AxesDeleted,
    /// Surviving original members no longer retain their captured relative order.
    AxesReordered,
    /// A previously outside axis moved inside the captured region's boundaries.
    OldAxisMovedInside,
    /// Deletion reduced the rectangle to one cell.
    Singleton,
    /// A higher-priority active region occupies part of this rectangle.
    Overlap,
}

/// Observable normalization result for an inactive merge intent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeConflict {
    region: MergeId,
    reason: MergeConflictReason,
}

impl MergeConflict {
    /// Region whose content remains retained in base cells.
    #[must_use]
    pub const fn region(&self) -> &MergeId {
        &self.region
    }
    /// Deterministic reason for deactivation.
    #[must_use]
    pub const fn reason(&self) -> MergeConflictReason {
        self.reason
    }
}

/// One visible grid coordinate and its presentation master.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedCell {
    base: CellId,
    master: CellId,
    row_span: u32,
    column_span: u32,
    source_cells: Vec<CellId>,
}

impl ResolvedCell {
    /// Base-cell identity, even when its presentation is covered by a merge.
    #[must_use]
    pub const fn base(&self) -> &CellId {
        &self.base
    }
    /// Visible master identity; a covered coordinate must not render another cell.
    #[must_use]
    pub const fn master(&self) -> &CellId {
        &self.master
    }
    /// Whether this coordinate is a presentation master.
    #[must_use]
    pub fn is_master(&self) -> bool {
        self.base == self.master
    }
    /// Master row span; covered cells report zero.
    #[must_use]
    pub const fn row_span(&self) -> u32 {
        self.row_span
    }
    /// Master column span; covered cells report zero.
    #[must_use]
    pub const fn column_span(&self) -> u32 {
        self.column_span
    }
    /// Ordered base-cell partition presented by this master, never flattened away.
    #[must_use]
    pub fn source_cells(&self) -> &[CellId] {
        &self.source_cells
    }
}

/// A pure derived presentation. It does not mutate or delete any source content.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedTable {
    rows: Arc<[RowId]>,
    columns: Arc<[ColumnId]>,
    cells: Vec<ResolvedCell>,
    active: Vec<MergeId>,
    conflicts: Vec<MergeConflict>,
}

impl ResolvedTable {
    /// An axisless table is hidden; materialization must not invent repair rows.
    #[must_use]
    pub fn is_hidden(&self) -> bool {
        self.rows.is_empty() || self.columns.is_empty()
    }
    /// All current grid coordinates in deterministic row-major order.
    #[must_use]
    pub fn cells(&self) -> &[ResolvedCell] {
        &self.cells
    }
    /// Lookup current display indices; persistent selections use stable identities.
    #[must_use]
    pub fn cell(&self, row: usize, column: usize) -> Option<&ResolvedCell> {
        if row >= self.rows.len() || column >= self.columns.len() {
            return None;
        }
        self.cells.get(row.checked_mul(self.columns.len())?.checked_add(column)?)
    }
    /// Active regions in descending shared priority order.
    #[must_use]
    pub fn active_regions(&self) -> &[MergeId] {
        &self.active
    }
    /// Inactive conflicting regions in the same deterministic priority order.
    #[must_use]
    pub fn conflicts(&self) -> &[MergeConflict] {
        &self.conflicts
    }
}

/// Checked stable axis order and explicit resource ceilings for one table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableShape {
    table: TableId,
    rows: Arc<[RowId]>,
    columns: Arc<[ColumnId]>,
    limits: RichTableLimits,
}

fn unique<T: Ord>(values: &[T]) -> bool {
    values.iter().collect::<BTreeSet<_>>().len() == values.len()
}

fn interval<T: Ord>(
    current: &[T],
    context: &[T],
    start: usize,
    end: usize,
) -> Result<(usize, usize), MergeConflictReason> {
    let members = &context[start..=end];
    let positions: BTreeMap<_, _> =
        current.iter().enumerate().map(|(index, id)| (id, index)).collect();
    let surviving: Vec<_> = members.iter().filter_map(|id| positions.get(id).copied()).collect();
    let Some(first) = surviving.first().copied() else {
        return Err(MergeConflictReason::AxesDeleted);
    };
    let Some(last) = surviving.last().copied() else {
        return Err(MergeConflictReason::AxesDeleted);
    };
    if surviving.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(MergeConflictReason::AxesReordered);
    }
    let known: BTreeSet<_> = context.iter().collect();
    let inside: BTreeSet<_> = members.iter().collect();
    if current[first..=last].iter().any(|id| known.contains(id) && !inside.contains(id)) {
        return Err(MergeConflictReason::OldAxisMovedInside);
    }
    Ok((first, last))
}

impl TableShape {
    /// Validate current axes; empty axes are allowed as retained hidden state.
    ///
    /// # Errors
    /// Rejects duplicate identities and count/product limits before grid allocation.
    pub fn try_new(
        table: TableId,
        rows: Vec<RowId>,
        columns: Vec<ColumnId>,
        limits: RichTableLimits,
    ) -> Result<Self, TableGeometryError> {
        if rows.len() > limits.rows
            || columns.len() > limits.columns
            || rows.len().checked_mul(columns.len()).is_none_or(|cells| cells > limits.cells)
        {
            return Err(TableGeometryError::Limit);
        }
        if !unique(&rows) || !unique(&columns) {
            return Err(TableGeometryError::DuplicateAxis);
        }
        Ok(Self { table, rows: rows.into(), columns: columns.into(), limits })
    }

    /// Capture one non-destructive merge intent against this ordered snapshot.
    ///
    /// # Errors
    /// Rejects foreign/absent cells, reversed bounds and one-cell rectangles.
    pub fn capture_merge(
        &self,
        id: MergeId,
        stamp: CausalStamp,
        bounds: &CellBounds,
    ) -> Result<MergeRegion, TableGeometryError> {
        if self.limits.merges == 0 {
            return Err(TableGeometryError::Limit);
        }
        if bounds.first.table() != &self.table || bounds.last.table() != &self.table {
            return Err(TableGeometryError::Bounds);
        }
        let row_start = self
            .rows
            .iter()
            .position(|row| row == bounds.first.row())
            .ok_or(TableGeometryError::Bounds)?;
        let row_end = self
            .rows
            .iter()
            .position(|row| row == bounds.last.row())
            .ok_or(TableGeometryError::Bounds)?;
        let column_start = self
            .columns
            .iter()
            .position(|column| column == bounds.first.column())
            .ok_or(TableGeometryError::Bounds)?;
        let column_end = self
            .columns
            .iter()
            .position(|column| column == bounds.last.column())
            .ok_or(TableGeometryError::Bounds)?;
        if row_start > row_end || column_start > column_end {
            return Err(TableGeometryError::ReversedBounds);
        }
        if row_start == row_end && column_start == column_end {
            return Err(TableGeometryError::Singleton);
        }
        Ok(MergeRegion {
            id,
            stamp,
            table: self.table.clone(),
            row_context: Arc::clone(&self.rows),
            column_context: Arc::clone(&self.columns),
            row_start,
            row_end,
            column_start,
            column_end,
        })
    }

    /// Resolve the same accepted record set identically in any receive order.
    ///
    /// Retractions affect only named observed regions. New axes strictly between
    /// surviving captured boundaries expand a region; boundary insertions do not.
    /// Reordering/overlap deactivates intent while retaining every base-cell body.
    ///
    /// # Errors
    /// Rejects count limits, foreign records and ambiguous region-identity reuse.
    pub fn resolve(
        &self,
        regions: &[MergeRegion],
        retracted: &BTreeSet<MergeId>,
    ) -> Result<ResolvedTable, TableGeometryError> {
        if regions.len() > self.limits.merges || retracted.len() > self.limits.merges {
            return Err(TableGeometryError::Limit);
        }
        let mut unique_regions: BTreeMap<&MergeId, &MergeRegion> = BTreeMap::new();
        for region in regions {
            if region.table != self.table {
                return Err(TableGeometryError::ForeignRegion);
            }
            if let Some(existing) = unique_regions.insert(&region.id, region)
                && existing != region
            {
                return Err(TableGeometryError::MergeIdentityReuse);
            }
        }
        let mut ordered: Vec<_> =
            unique_regions.into_values().filter(|region| !retracted.contains(&region.id)).collect();
        ordered.sort_by(|left, right| {
            right.stamp.cmp(&left.stamp).then_with(|| right.id.cmp(&left.id))
        });
        let mut cells = Vec::with_capacity(self.rows.len() * self.columns.len());
        for row in self.rows.iter() {
            for column in self.columns.iter() {
                let base = CellId::new(self.table.clone(), row.clone(), column.clone());
                cells.push(ResolvedCell {
                    base: base.clone(),
                    master: base.clone(),
                    row_span: 1,
                    column_span: 1,
                    source_cells: vec![base],
                });
            }
        }
        let mut occupied = vec![false; cells.len()];
        let mut active = vec![];
        let mut conflicts = vec![];
        for region in ordered {
            let axes = interval(&self.rows, &region.row_context, region.row_start, region.row_end)
                .and_then(|rows| {
                    interval(
                        &self.columns,
                        &region.column_context,
                        region.column_start,
                        region.column_end,
                    )
                    .map(|columns| (rows, columns))
                });
            let reason = match axes {
                Err(reason) => Some(reason),
                Ok(((first_row, last_row), (first_column, last_column))) => {
                    if first_row == last_row && first_column == last_column {
                        Some(MergeConflictReason::Singleton)
                    } else {
                        let indices: Vec<_> = (first_row..=last_row)
                            .flat_map(|row| {
                                (first_column..=last_column)
                                    .map(move |column| row * self.columns.len() + column)
                            })
                            .collect();
                        if indices.iter().any(|index| occupied[*index]) {
                            Some(MergeConflictReason::Overlap)
                        } else {
                            let master_index = first_row * self.columns.len() + first_column;
                            let master = cells[master_index].base.clone();
                            let sources =
                                indices.iter().map(|index| cells[*index].base.clone()).collect();
                            for index in indices {
                                occupied[index] = true;
                                cells[index].master = master.clone();
                                cells[index].source_cells.clear();
                                cells[index].row_span = 0;
                                cells[index].column_span = 0;
                            }
                            cells[master_index].row_span = u32::try_from(last_row - first_row + 1)
                                .map_err(|_| TableGeometryError::Limit)?;
                            cells[master_index].column_span =
                                u32::try_from(last_column - first_column + 1)
                                    .map_err(|_| TableGeometryError::Limit)?;
                            cells[master_index].source_cells = sources;
                            active.push(region.id.clone());
                            None
                        }
                    }
                }
            };
            if let Some(reason) = reason {
                conflicts.push(MergeConflict { region: region.id.clone(), reason });
            }
        }
        Ok(ResolvedTable {
            rows: Arc::clone(&self.rows),
            columns: Arc::clone(&self.columns),
            cells,
            active,
            conflicts,
        })
    }
}
