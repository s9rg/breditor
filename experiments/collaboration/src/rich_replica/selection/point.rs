//! Stable text cursor capture/resolution, including normalization paragraphs without activation.
use super::{CellContext, SelectionLoss, TextPoint};
use crate::{Error, anchor::TextAnchor};
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
    pub anchor: TextAnchor,
    pub context: Option<CellContext>,
}
impl AnchoredPoint {
    pub fn repair_history_cursor(
        &mut self,
        doc: &LoroDoc,
        source: &loro_internal::undo::CursorWithPos,
        diff: &loro_internal::undo::DiffBatch,
    ) -> Result<(), Error> {
        let cursor = self.anchor.engine_cursor()?;
        if cursor.id.is_none()
            || doc.get_cursor_pos(&cursor).map_err(|_| Error::Anchor)?.update.is_none()
        {
            return Ok(());
        }
        if source.cursor.container != super::super::model::text_id(&self.block) {
            return Err(Error::Anchor);
        }
        let (position, deleted) = history_position(diff, &source.cursor.container, source.pos.pos);
        let position = if !deleted && source.cursor.side == loro::cursor::Side::Right {
            position.checked_add(1).ok_or(Error::Offset)?
        } else {
            position
        };
        let text = super::super::model::existing_text(doc, &self.block).ok_or(Error::Anchor)?;
        let offset = text
            .convert_pos(position, loro::cursor::PosType::Unicode, loro::cursor::PosType::Utf16)
            .ok_or(Error::Anchor)?;
        self.anchor = TextAnchor::capture(
            &text,
            u32::try_from(offset).map_err(|_| Error::Offset)?,
            self.affinity,
        )?;
        Ok(())
    }
    pub fn current_engine_cursor(&self, doc: &LoroDoc) -> Result<loro::cursor::Cursor, Error> {
        if let Some(text) = super::super::model::existing_text(doc, &self.block) {
            TextAnchor::capture(&text, self.anchor.resolve(doc, &text)?, self.affinity)?
                .engine_cursor()
        } else {
            let cursor = self.anchor.engine_cursor()?;
            if cursor.container != super::super::model::text_id(&self.block) || cursor.id.is_some()
            {
                return Err(Error::Anchor);
            }
            Ok(cursor)
        }
    }
    pub fn capture(
        doc: &LoroDoc,
        document: &RichDocument,
        point: &TextPoint,
    ) -> Result<Self, Error> {
        let anchor = if let Some(text) = super::super::model::existing_text(doc, &point.block) {
            TextAnchor::capture(&text, point.offset, point.affinity)?
        } else {
            if point.offset != 0 {
                return Err(Error::Offset);
            }
            TextAnchor::empty(super::super::model::text_id(&point.block), point.affinity)
        };
        Ok(Self {
            block: point.block.clone(),
            affinity: point.affinity,
            anchor,
            context: CellContext::owning(document, &point.block)?,
        })
    }
    pub fn resolve(
        &self,
        doc: &LoroDoc,
        document: &RichDocument,
    ) -> Result<Result<(Self, TextPoint), SelectionLoss>, Error> {
        let id =
            BlockId::try_new(&self.block).map_err(|_| Error::Contract("shared anchored block"))?;
        if document.block_path(&id).is_some() {
            let kind = super::kind(document, &self.block)?;
            if kind != "breditor/paragraph" && kind != "breditor/heading" {
                return Err(Error::Contract("shared anchored text kind"));
            }
            let offset = if let Some(text) = super::super::model::existing_text(doc, &self.block) {
                self.anchor.resolve(doc, &text)?
            } else {
                let cursor = self.anchor.engine_cursor()?;
                if cursor.container != super::super::model::text_id(&self.block)
                    || cursor.id.is_some()
                {
                    return Err(Error::Anchor);
                }
                0
            };
            let point = TextPoint { block: self.block.clone(), offset, affinity: self.affinity };
            let mut mapped = self.clone();
            mapped.context = CellContext::owning(document, &self.block)?;
            return Ok(Ok((mapped, point)));
        }
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

fn history_position(
    diff: &loro_internal::undo::DiffBatch,
    container: &loro::ContainerID,
    position: usize,
) -> (usize, bool) {
    let Some(loro_internal::event::Diff::Text(text)) = diff.cid_to_events.get(container) else {
        return (position, false);
    };
    let mut index = 0;
    let mut deleted = false;
    for item in text.iter() {
        match item {
            loro_internal::event::TextDiffItem::Retain { len, .. } => index += len,
            loro_internal::event::TextDiffItem::Replace { delete, .. } => {
                deleted |= position >= index && position < index + delete;
                index += delete;
            }
        }
    }
    (text.transform_pos(position, true), deleted)
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
