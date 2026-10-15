//! Logical/source text cursors resolve before structural deletion fallback.
use super::{CellContext, SelectionLoss, TextPoint};
use crate::{Error, rich_replica::text_flow::FlowAnchor};
use breditor_core::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::rich_replica) struct AnchoredPoint {
    pub block: String,
    pub affinity: crate::anchor::Affinity,
    pub flow: FlowAnchor,
    pub context: Option<CellContext>,
}
impl AnchoredPoint {
    pub fn capture(
        doc: &LoroDoc,
        document: &RichDocument,
        point: &TextPoint,
    ) -> Result<Self, Error> {
        Ok(Self {
            block: point.block.clone(),
            affinity: point.affinity,
            flow: FlowAnchor::capture(doc, &point.block, point.offset, point.affinity)?,
            context: CellContext::owning(document, &point.block)?,
        })
    }
    pub fn resolve(
        &self,
        doc: &LoroDoc,
        document: &RichDocument,
    ) -> Result<Result<(Self, TextPoint), SelectionLoss>, Error> {
        let (block, offset) = self.flow.resolve(doc)?;
        let id = BlockId::try_new(&block).map_err(|_| Error::Contract("shared anchored block"))?;
        if document.block_path(&id).is_some() {
            let kind = super::kind(document, &block)?;
            if kind != "breditor/paragraph" && kind != "breditor/heading" {
                return Err(Error::Contract("shared anchored text kind"));
            }
            let point = TextPoint { block: block.clone(), offset, affinity: self.affinity };
            let mut mapped = self.clone();
            mapped.block.clone_from(&block);
            mapped.context = CellContext::owning(document, &block)?;
            return Ok(Ok((mapped, point)));
        }
        self.fallback(doc, document)
    }
    fn fallback(
        &self,
        doc: &LoroDoc,
        document: &RichDocument,
    ) -> Result<Result<(Self, TextPoint), SelectionLoss>, Error> {
        let Some(context) = &self.context else {
            return Ok(Err(SelectionLoss::TargetDeleted));
        };
        let target = match context.relocate(document, self.affinity, self.affinity)? {
            Ok(value) => value,
            Err(loss) => return Ok(Err(loss)),
        };
        let cell = target.core()?;
        let node = document
            .cell_path(&cell)
            .and_then(|path| document.document().node_at(path).ok())
            .ok_or(Error::Contract("shared fallback cell"))?;
        let Some(node) = caret(node, self.affinity) else {
            return Ok(Err(SelectionLoss::NoTextTarget));
        };
        let name = breditor_core::identity::QualifiedName::try_new("breditor/block-id")
            .map_err(|_| Error::Contract("shared fallback block property"))?;
        let block = node
            .properties()
            .get(&name)
            .and_then(breditor_core::document::PropertyValue::as_string)
            .ok_or(Error::Contract("shared fallback block"))?;
        let offset = if self.affinity == crate::anchor::Affinity::Before {
            node.children().iter().try_fold(0u32, |length, node| {
                length
                    .checked_add(
                        node.as_text().ok_or(Error::Contract("shared fallback text"))?.utf16_len(),
                    )
                    .ok_or(Error::Offset)
            })?
        } else {
            0
        };
        let point = TextPoint { block: block.into(), offset, affinity: self.affinity };
        Ok(Ok((Self::capture(doc, document, &point)?, point)))
    }
}
fn caret(
    node: &NodeRef,
    affinity: crate::anchor::Affinity,
) -> Option<&breditor_core::document::ElementNode> {
    let element = node.as_element()?;
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        return Some(element);
    }
    if affinity == crate::anchor::Affinity::Before {
        element.children().iter().rev().find_map(|node| caret(node, affinity))
    } else {
        element.children().iter().find_map(|node| caret(node, affinity))
    }
}
