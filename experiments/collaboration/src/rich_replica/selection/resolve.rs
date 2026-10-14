//! Direction-preserving causal resolution and deterministic structural relocation.
use super::{AnchoredPoint, CellContext, Selection, SelectionLoss};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{BlockId, RichDocument};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(in crate::rich_replica) enum AnchoredSelection {
    Text { anchor: AnchoredPoint, focus: AnchoredPoint },
    Node { block: String },
    Grid { anchor: CellContext, focus: CellContext },
}
pub(in crate::rich_replica) fn capture(
    doc: &LoroDoc,
    document: &RichDocument,
    selection: &Selection,
) -> Result<AnchoredSelection, Error> {
    selection.admit(document)?;
    Ok(match selection {
        Selection::TextRange { anchor, focus } => AnchoredSelection::Text {
            anchor: AnchoredPoint::capture(doc, document, anchor)?,
            focus: AnchoredPoint::capture(doc, document, focus)?,
        },
        Selection::Node { block } => AnchoredSelection::Node { block: block.clone() },
        Selection::Grid { anchor, focus } => AnchoredSelection::Grid {
            anchor: CellContext::capture(document, anchor.clone())?,
            focus: CellContext::capture(document, focus.clone())?,
        },
    })
}

pub(in crate::rich_replica) fn resolve(
    doc: &LoroDoc,
    document: &RichDocument,
    selection: &AnchoredSelection,
) -> Result<Result<(AnchoredSelection, Selection), SelectionLoss>, Error> {
    let (mapped, candidate) = match selection {
        AnchoredSelection::Text { anchor, focus } => {
            let (anchor, ap) = match anchor.resolve(doc, document)? {
                Ok(value) => value,
                Err(loss) => return Ok(Err(loss)),
            };
            let (focus, fp) = match focus.resolve(doc, document)? {
                Ok(value) => value,
                Err(loss) => return Ok(Err(loss)),
            };
            (
                AnchoredSelection::Text { anchor, focus },
                Selection::TextRange { anchor: ap, focus: fp },
            )
        }
        AnchoredSelection::Node { block } => {
            if document
                .block_path(
                    &BlockId::try_new(block)
                        .map_err(|_| Error::Contract("shared node selection"))?,
                )
                .is_none()
            {
                return Ok(Err(SelectionLoss::TargetDeleted));
            }
            let candidate = Selection::Node { block: block.clone() };
            if candidate.admit(document).is_err()
                && super::kind(document, block)? == "breditor/table"
            {
                return Ok(Err(SelectionLoss::HiddenTable));
            }
            (selection.clone(), candidate)
        }
        AnchoredSelection::Grid { anchor, focus } => {
            let (ra, rf) = direction(&anchor.rows, &anchor.cell.row, &focus.cell.row)?;
            let (ca, cf) = direction(&anchor.columns, &anchor.cell.column, &focus.cell.column)?;
            let a = match anchor.relocate(document, ra, ca)? {
                Ok(value) => value,
                Err(loss) => return Ok(Err(loss)),
            };
            let f = match focus.relocate(document, rf, cf)? {
                Ok(value) => value,
                Err(loss) => return Ok(Err(loss)),
            };
            (
                AnchoredSelection::Grid {
                    anchor: CellContext::capture(document, a.clone())?,
                    focus: CellContext::capture(document, f.clone())?,
                },
                Selection::Grid { anchor: a, focus: f },
            )
        }
    };
    candidate.admit(document)?;
    Ok(Ok((mapped, candidate)))
}
fn direction(axes: &[String], anchor: &str, focus: &str) -> Result<(Affinity, Affinity), Error> {
    let a = axes
        .iter()
        .position(|id| id == anchor)
        .ok_or(Error::Contract("shared grid context anchor"))?;
    let f = axes
        .iter()
        .position(|id| id == focus)
        .ok_or(Error::Contract("shared grid context focus"))?;
    Ok((
        if a <= f { Affinity::After } else { Affinity::Before },
        if a < f { Affinity::Before } else { Affinity::After },
    ))
}
