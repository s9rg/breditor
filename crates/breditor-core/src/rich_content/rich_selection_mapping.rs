//! Structural-only stable-ID relocation with explicit loss/fallback outcomes.

use super::{
    BlockId, CellId, RichDocument, RichSelection, RichSelectionError, RichSelectionKind,
    RichTableView, RichTextPoint,
    rich_selection::{block, text_length},
};
use crate::{
    document::{ElementNode, NodeRef},
    position::{Affinity, TextOffset},
};

/// Why structural mapping intentionally cleared a visible selection.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichSelectionLoss {
    /// No surviving stable target or safe original-axis neighbour exists.
    TargetDeleted,
    /// The selected table has no visible axes.
    HiddenTable,
    /// A replacement cell has no paragraph/heading caret target.
    NoTextTarget,
}

/// Observable result of moving a selection through a structural edit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichSelectionMappingOutcome {
    /// Stable endpoints survived; snapshot paths or merge coverage may still change.
    Preserved,
    /// A deleted cell endpoint moved to an explicit surviving neighbour.
    Relocated,
    /// No visible selection survived, with a machine-readable reason.
    Cleared(RichSelectionLoss),
}

/// Mapped selection, or explicit clearing, bound to the resulting snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichSelectionMapping {
    selection: Option<RichSelection>,
    outcome: RichSelectionMappingOutcome,
}

impl RichSelectionMapping {
    /// New selection, or `None` when deliberately cleared.
    #[must_use]
    pub const fn selection(&self) -> Option<&RichSelection> {
        self.selection.as_ref()
    }
    /// Stable mapping outcome; callers must not silently treat clearing as success.
    #[must_use]
    pub const fn outcome(&self) -> RichSelectionMappingOutcome {
        self.outcome
    }
    /// Transfer the mapped selection to the local coordinator.
    #[must_use]
    pub fn into_selection(self) -> Option<RichSelection> {
        self.selection
    }
}

fn cleared(reason: RichSelectionLoss) -> RichSelectionMapping {
    RichSelectionMapping { selection: None, outcome: RichSelectionMappingOutcome::Cleared(reason) }
}

fn neighbour<T: Clone + PartialEq>(
    before: &[T],
    after: &[T],
    target: &T,
    affinity: Affinity,
) -> Option<T> {
    if after.contains(target) {
        return Some(target.clone());
    }
    let index = before.iter().position(|id| id == target)?;
    let previous = before[..index].iter().rev().find(|id| after.contains(id));
    let next = before[index + 1..].iter().find(|id| after.contains(id));
    match affinity {
        Affinity::Before => previous.or(next),
        Affinity::After => next.or(previous),
    }
    .cloned()
}

fn move_cell(
    before: &RichTableView,
    after: &RichTableView,
    cell: &CellId,
    row_affinity: Affinity,
    column_affinity: Affinity,
) -> Option<CellId> {
    let columns_before: Vec<_> =
        before.columns().iter().map(|column| column.id().clone()).collect();
    let columns_after: Vec<_> = after.columns().iter().map(|column| column.id().clone()).collect();
    Some(CellId::new(
        cell.table().clone(),
        neighbour(before.rows(), after.rows(), cell.row(), row_affinity)?,
        neighbour(&columns_before, &columns_after, cell.column(), column_affinity)?,
    ))
}

fn owning_cell(document: &RichDocument, id: &BlockId) -> Option<CellId> {
    let target = document.block_path(id)?.to_vec();
    document
        .cell_entries()
        .find(|(_, path)| target.starts_with(&path.to_vec()))
        .map(|(cell, _)| cell.clone())
}

fn caret_block(node: &NodeRef, affinity: Affinity) -> Option<&ElementNode> {
    let element = node.as_element()?;
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        return Some(element);
    }
    if affinity == Affinity::Before {
        element.children().iter().rev().find_map(|child| caret_block(child, affinity))
    } else {
        element.children().iter().find_map(|child| caret_block(child, affinity))
    }
}

fn same_text(left: &ElementNode, right: &ElementNode) -> bool {
    left.children().iter().filter_map(NodeRef::as_text).flat_map(|text| text.text().chars()).eq(
        right.children().iter().filter_map(NodeRef::as_text).flat_map(|text| text.text().chars()),
    )
}

fn move_text(
    before: &RichDocument,
    after: &RichDocument,
    point: &RichTextPoint,
) -> Result<Result<RichTextPoint, RichSelectionLoss>, RichSelectionError> {
    let old = block(before, point.block())?;
    if after.block_path(point.block()).is_some() {
        let new = block(after, point.block())?;
        if old.kind() != new.kind() || !same_text(old, new) {
            return Err(RichSelectionError::TextChanged);
        }
        return Ok(Ok(point.clone()));
    }
    let Some(cell) = owning_cell(before, point.block()) else {
        return Ok(Err(RichSelectionLoss::TargetDeleted));
    };
    let previous = before
        .table(cell.table())
        .map_err(|_| RichSelectionError::Invariant)?
        .ok_or(RichSelectionError::MissingTarget)?;
    let Some(current) = after.table(cell.table()).map_err(|_| RichSelectionError::Invariant)?
    else {
        return Ok(Err(RichSelectionLoss::TargetDeleted));
    };
    if current.geometry().is_hidden() {
        return Ok(Err(RichSelectionLoss::HiddenTable));
    }
    let Some(target) = move_cell(&previous, &current, &cell, point.affinity(), point.affinity())
    else {
        return Ok(Err(RichSelectionLoss::TargetDeleted));
    };
    let node = after
        .cell_path(&target)
        .and_then(|path| after.document().node_at(path).ok())
        .ok_or(RichSelectionError::Invariant)?;
    let Some(caret) = caret_block(node, point.affinity()) else {
        return Ok(Err(RichSelectionLoss::NoTextTarget));
    };
    let id = BlockId::try_new(
        super::ast_properties::string(caret, "block-id")
            .map_err(|_| RichSelectionError::Invariant)?,
    )
    .map_err(|_| RichSelectionError::Invariant)?;
    let offset =
        if point.affinity() == Affinity::Before { text_length(caret)? } else { TextOffset::ZERO };
    Ok(Ok(RichTextPoint::new(id, offset, point.affinity())))
}

/// Rebase through a structural snapshot pair; arbitrary text edits are rejected.
///
/// Endpoint direction and insertion affinity survive. Deleted endpoints use
/// surviving original-axis neighbours, never unrelated newly created axes.
/// The local history coordinator must retain before/after selections separately
/// for exact undo; a deletion fallback is not automatically reversible.
///
/// # Errors
/// Rejects a stale source selection, different document/schema, changed text in
/// a surviving block or a violated typed AST invariant.
pub fn rebase_rich_selection(
    before: &RichDocument,
    after: &RichDocument,
    selection: &RichSelection,
) -> Result<RichSelectionMapping, RichSelectionError> {
    selection.resolve(before)?;
    if before.id() != after.id()
        || before.document().schema_fingerprint() != after.document().schema_fingerprint()
    {
        return Err(RichSelectionError::Binding);
    }
    let kind = match selection.kind() {
        RichSelectionKind::Node(id) => {
            let Some(_) = after.block_path(id) else {
                return Ok(cleared(RichSelectionLoss::TargetDeleted));
            };
            if block(before, id)?.kind() != block(after, id)?.kind() {
                return Err(RichSelectionError::TargetKind);
            }
            let kind = RichSelectionKind::Node(id.clone());
            return match RichSelection::try_new(after, kind) {
                Ok(selection) => Ok(RichSelectionMapping {
                    selection: Some(selection),
                    outcome: RichSelectionMappingOutcome::Preserved,
                }),
                Err(RichSelectionError::HiddenTable) => Ok(cleared(RichSelectionLoss::HiddenTable)),
                Err(error) => Err(error),
            };
        }
        RichSelectionKind::TextRange { anchor, focus } => {
            let anchor = match move_text(before, after, anchor)? {
                Ok(point) => point,
                Err(reason) => return Ok(cleared(reason)),
            };
            let focus = match move_text(before, after, focus)? {
                Ok(point) => point,
                Err(reason) => return Ok(cleared(reason)),
            };
            RichSelectionKind::TextRange { anchor, focus }
        }
        RichSelectionKind::Grid { anchor, focus } => {
            let previous = before
                .table(anchor.table())
                .map_err(|_| RichSelectionError::Invariant)?
                .ok_or(RichSelectionError::MissingTarget)?;
            let Some(current) =
                after.table(anchor.table()).map_err(|_| RichSelectionError::Invariant)?
            else {
                return Ok(cleared(RichSelectionLoss::TargetDeleted));
            };
            if current.geometry().is_hidden() {
                return Ok(cleared(RichSelectionLoss::HiddenTable));
            }
            let ar = previous
                .rows()
                .iter()
                .position(|id| id == anchor.row())
                .ok_or(RichSelectionError::MissingTarget)?;
            let fr = previous
                .rows()
                .iter()
                .position(|id| id == focus.row())
                .ok_or(RichSelectionError::MissingTarget)?;
            let ac = previous
                .columns()
                .iter()
                .position(|id| id.id() == anchor.column())
                .ok_or(RichSelectionError::MissingTarget)?;
            let fc = previous
                .columns()
                .iter()
                .position(|id| id.id() == focus.column())
                .ok_or(RichSelectionError::MissingTarget)?;
            let ra = if ar <= fr { Affinity::After } else { Affinity::Before };
            let ca = if ac <= fc { Affinity::After } else { Affinity::Before };
            let rf = if ar < fr { Affinity::Before } else { Affinity::After };
            let cf = if ac < fc { Affinity::Before } else { Affinity::After };
            let Some(anchor) = move_cell(&previous, &current, anchor, ra, ca) else {
                return Ok(cleared(RichSelectionLoss::TargetDeleted));
            };
            let Some(focus) = move_cell(&previous, &current, focus, rf, cf) else {
                return Ok(cleared(RichSelectionLoss::TargetDeleted));
            };
            RichSelectionKind::Grid { anchor, focus }
        }
    };
    let outcome = if &kind == selection.kind() {
        RichSelectionMappingOutcome::Preserved
    } else {
        RichSelectionMappingOutcome::Relocated
    };
    Ok(RichSelectionMapping { selection: Some(RichSelection::try_new(after, kind)?), outcome })
}
