//! Resolve original causal targets without the editor caret's neighboring-cell fallback.
use super::{
    ReviewAnchorLoss as Loss, ReviewAnchorResolution as Resolution, ReviewAnchorTarget as Target,
    packet::{Anchors, MAX_BYTES, Packet},
};
use crate::{
    Error,
    rich_replica::{
        RichReplica,
        selection::{self, CellTarget, Selection, TextPoint},
    },
};
use breditor_core::rich_content::{BlockId, TableId};

impl RichReplica {
    /// Resolve a durable review anchor, retaining pending/orphaned targets without publication.
    /// # Errors
    /// Rejects another document/profile/engine, malformed cursors, noncanonical clocks and budgets.
    pub fn resolve_review_anchor(&self, input: &str) -> Result<Resolution, Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("review anchor bytes"));
        }
        let packet: Packet = serde_json::from_str(input)?;
        if !packet.ready(self)? {
            return Ok(Resolution::Pending);
        }
        let selection = match &packet.anchors {
            Anchors::Document => {
                return Ok(Resolution::Resolved { target: Target::Document });
            }
            Anchors::Text { anchor, focus, was_range } => {
                let (ab, ao) = anchor.resolve(&self.doc)?;
                let (fb, fo) = focus.resolve(&self.doc)?;
                for block in [&ab, &fb] {
                    if self
                        .document
                        .block_path(
                            &BlockId::try_new(block)
                                .map_err(|_| Error::Contract("review anchor block"))?,
                        )
                        .is_none()
                    {
                        return Ok(orphan(Loss::TargetDeleted));
                    }
                    if !super::super::protocol::Protocol::read(&self.doc)?
                        .text(&selection::kind(&self.document, block)?)
                    {
                        return Ok(orphan(Loss::TargetKindChanged));
                    }
                }
                if *was_range && ab == fb && ao == fo {
                    return Ok(orphan(Loss::RangeCollapsed));
                }
                Selection::TextRange {
                    anchor: TextPoint {
                        block: ab,
                        offset: ao,
                        affinity: anchor.captured_affinity(),
                    },
                    focus: TextPoint { block: fb, offset: fo, affinity: focus.captured_affinity() },
                }
            }
            Anchors::Node { block } => {
                if self
                    .document
                    .block_path(
                        &BlockId::try_new(block)
                            .map_err(|_| Error::Contract("review anchor node"))?,
                    )
                    .is_none()
                {
                    return Ok(orphan(Loss::TargetDeleted));
                }
                Selection::Node { block: block.clone() }
            }
            Anchors::Grid { anchor, focus } => {
                for cell in [anchor, focus] {
                    if let Some(loss) = self.review_cell_loss(cell)? {
                        return Ok(orphan(loss));
                    }
                }
                Selection::Grid { anchor: anchor.clone(), focus: focus.clone() }
            }
        };
        if selection.admit(&self.document).is_err() {
            return Ok(orphan(Loss::TargetKindChanged));
        }
        Ok(Resolution::Resolved { target: Target::Selection(selection) })
    }

    fn review_cell_loss(&self, cell: &CellTarget) -> Result<Option<Loss>, Error> {
        let Some(table) = self
            .document
            .table(
                &TableId::try_new(&cell.table)
                    .map_err(|_| Error::Contract("review anchor table"))?,
            )
            .map_err(|_| Error::Contract("review anchor geometry"))?
        else {
            return Ok(Some(Loss::TargetDeleted));
        };
        if table.geometry().is_hidden() {
            return Ok(Some(Loss::HiddenTable));
        }
        if !table.rows().iter().any(|r| r.as_str() == cell.row)
            || !table.columns().iter().any(|c| c.id().as_str() == cell.column)
        {
            return Ok(Some(Loss::TargetDeleted));
        }
        Ok(None)
    }
}
fn orphan(reason: Loss) -> Resolution {
    Resolution::Orphaned { reason }
}
