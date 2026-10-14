//! Original-axis fallback never chooses an unrelated concurrently inserted axis.
use super::{CellTarget, SelectionLoss};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{BlockId, RichDocument, TableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::rich_replica) struct CellContext {
    pub cell: CellTarget,
    pub rows: Vec<String>,
    pub columns: Vec<String>,
}
impl CellContext {
    pub fn capture(document: &RichDocument, cell: CellTarget) -> Result<Self, Error> {
        let view = document
            .table(
                &TableId::try_new(&cell.table)
                    .map_err(|_| Error::Contract("shared selection table"))?,
            )
            .map_err(|_| Error::Contract("shared selection geometry"))?
            .ok_or(Error::Contract("shared selection table"))?;
        Ok(Self {
            cell,
            rows: view.rows().iter().map(|id| id.as_str().into()).collect(),
            columns: view.columns().iter().map(|value| value.id().as_str().into()).collect(),
        })
    }
    pub fn owning(document: &RichDocument, block: &str) -> Result<Option<Self>, Error> {
        let path = document
            .block_path(
                &BlockId::try_new(block).map_err(|_| Error::Contract("shared selection block"))?,
            )
            .ok_or(Error::Contract("visible shared selection block"))?
            .to_vec();
        document
            .cell_entries()
            .find(|(_, cell)| path.starts_with(&cell.to_vec()))
            .map(|(cell, _)| Self::capture(document, CellTarget::from_core(cell)))
            .transpose()
    }
    pub fn relocate(
        &self,
        document: &RichDocument,
        row_affinity: Affinity,
        column_affinity: Affinity,
    ) -> Result<Result<CellTarget, SelectionLoss>, Error> {
        if self.rows.len() > 256 || self.columns.len() > 128 {
            return Err(Error::Limit("shared selection axis context"));
        }
        let Some(view) = document
            .table(
                &TableId::try_new(&self.cell.table)
                    .map_err(|_| Error::Contract("shared selection table"))?,
            )
            .map_err(|_| Error::Contract("shared selection geometry"))?
        else {
            return Ok(Err(SelectionLoss::TargetDeleted));
        };
        if view.geometry().is_hidden() {
            return Ok(Err(SelectionLoss::HiddenTable));
        }
        let rows =
            view.rows().iter().map(breditor_core::rich_content::RowId::as_str).collect::<Vec<_>>();
        let columns = view.columns().iter().map(|value| value.id().as_str()).collect::<Vec<_>>();
        let Some(row) = neighbour(&self.rows, &rows, &self.cell.row, row_affinity) else {
            return Ok(Err(SelectionLoss::TargetDeleted));
        };
        let Some(column) = neighbour(&self.columns, &columns, &self.cell.column, column_affinity)
        else {
            return Ok(Err(SelectionLoss::TargetDeleted));
        };
        Ok(Ok(CellTarget { table: self.cell.table.clone(), row, column }))
    }
}
fn neighbour(
    before: &[String],
    after: &[&str],
    target: &str,
    affinity: Affinity,
) -> Option<String> {
    if after.contains(&target) {
        return Some(target.into());
    }
    let index = before.iter().position(|id| id == target)?;
    let previous = before[..index].iter().rev().find(|id| after.contains(&id.as_str()));
    let next = before[index + 1..].iter().find(|id| after.contains(&id.as_str()));
    match affinity {
        Affinity::Before => previous.or(next),
        Affinity::After => next.or(previous),
    }
    .cloned()
}
