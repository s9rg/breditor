//! Local causal selections resolve into the original Rust text/node/grid selection family.
mod candidate;
mod context;
mod point;
mod resolve;

pub use candidate::{CellTarget, Selection, SelectionLoss, SelectionOutcome, TextPoint};
pub(super) use context::CellContext;
pub(super) use point::AnchoredPoint;
pub(super) use resolve::{AnchoredSelection, capture, resolve};

use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{BlockId, RichDocument};

pub(super) fn core_affinity(value: Affinity) -> breditor_core::position::Affinity {
    match value {
        Affinity::Before => breditor_core::position::Affinity::Before,
        Affinity::After => breditor_core::position::Affinity::After,
    }
}

pub(super) fn kind(document: &RichDocument, block: &str) -> Result<String, Error> {
    let path = document
        .block_path(
            &BlockId::try_new(block).map_err(|_| Error::Contract("shared selection block"))?,
        )
        .ok_or(Error::Contract("visible shared selection block"))?;
    Ok(document
        .document()
        .node_at(path)
        .map_err(|_| Error::Contract("shared selection path"))?
        .as_element()
        .ok_or(Error::Contract("shared selection element"))?
        .kind()
        .as_str()
        .into())
}
