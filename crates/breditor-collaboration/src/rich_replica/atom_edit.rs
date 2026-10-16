//! Small native atom-edit adapters; no shared mutation or identity allocation.
use super::{
    RichReplica,
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{RichSelectionKind, selected_flow_atom};
use serde_json::{Value, json};

pub(super) fn target(owner: &RichReplica) -> Result<String, Error> {
    let selection = owner.selection()?.ok_or(Error::Contract("atom edit requires selection"))?;
    let proof = selection.admit(&owner.document)?;
    Ok(selected_flow_atom(&owner.document, &proof)
        .map_err(|_| Error::Contract("atom edit requires whole visible atom"))?
        .as_str()
        .into())
}
pub(super) fn paragraph(id: &str, text: &str) -> Result<Value, Error> {
    super::paragraphs::id(id)?;
    if text.len() > 64 * 1024 {
        return Err(Error::Limit("shared atom replacement bytes"));
    }
    Ok(json!({"kind":"element","type":"breditor/paragraph","entityId":null,
        "properties":{"breditor/block-id":id},"children":if text.is_empty() {vec![]}
        else {vec![json!({"kind":"text","text":text,"formats":[]})]}}))
}
pub(super) fn selection(kind: &RichSelectionKind) -> Result<Selection, Error> {
    match kind {
        RichSelectionKind::Document => {
            Err(Error::Contract("atom recovery cannot be document scope"))
        }
        RichSelectionKind::Node(id) => Ok(Selection::Node { block: id.as_str().into() }),
        RichSelectionKind::TextRange { anchor, focus } => {
            let point =
                |p: &breditor_core::rich_content::RichTextPoint| -> Result<TextPoint, Error> {
                    Ok(TextPoint {
                        block: p.block().as_str().into(),
                        offset: u32::try_from(p.offset().get()).map_err(|_| Error::Offset)?,
                        affinity: match p.affinity() {
                            breditor_core::position::Affinity::Before => Affinity::Before,
                            breditor_core::position::Affinity::After => Affinity::After,
                        },
                    })
                };
            Ok(Selection::TextRange { anchor: point(anchor)?, focus: point(focus)? })
        }
        RichSelectionKind::Grid { .. } => Err(Error::Contract("atom recovery cannot be grid")),
    }
}
pub(super) fn caret(id: &str, offset: u32) -> Selection {
    let p = TextPoint { block: id.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: p.clone(), focus: p }
}
