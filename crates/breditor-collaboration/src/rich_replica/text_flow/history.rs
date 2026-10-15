//! Repair both floating source cursors and end bindings after native history recreates IDs.
use super::FlowAnchor;
use crate::{
    Error,
    anchor::{Affinity, TextAnchor},
};
use loro::{
    LoroDoc,
    cursor::{Cursor, PosType, Side},
};
use loro_internal::undo::{CursorWithPos, DiffBatch};

impl FlowAnchor {
    pub(in crate::rich_replica) fn history_cursor_count(&self) -> usize {
        1 + usize::from(self.end_binding.is_some())
    }
    pub(in crate::rich_replica) fn engine_cursors(
        &self,
        doc: &LoroDoc,
    ) -> Result<Vec<Cursor>, Error> {
        let mut values = vec![current(doc, self.source(), &self.anchor, self.point.affinity)?];
        if let Some(binding) = &self.end_binding {
            values.push(current(doc, self.source(), binding, Affinity::Before)?);
        }
        Ok(values)
    }
    pub(in crate::rich_replica) fn repair_history_cursors(
        &mut self,
        doc: &LoroDoc,
        sources: &[CursorWithPos],
        diff: &DiffBatch,
    ) -> Result<(), Error> {
        if sources.len() != self.history_cursor_count() {
            return Err(Error::ReplayMismatch);
        }
        let source = self.source().to_owned();
        repair(doc, &source, &mut self.anchor, self.point.affinity, &sources[0], diff)?;
        if let Some(binding) = &mut self.end_binding {
            repair(doc, &source, binding, Affinity::Before, &sources[1], diff)?;
        }
        Ok(())
    }
}
fn current(
    doc: &LoroDoc,
    source: &str,
    anchor: &TextAnchor,
    affinity: Affinity,
) -> Result<Cursor, Error> {
    if let Some(text) = super::super::model::existing_text(doc, source) {
        TextAnchor::capture(&text, anchor.resolve(doc, &text)?, affinity)?.engine_cursor()
    } else {
        let cursor = anchor.engine_cursor()?;
        if cursor.container != super::super::model::text_id(source) || cursor.id.is_some() {
            return Err(Error::Anchor);
        }
        Ok(cursor)
    }
}
fn repair(
    doc: &LoroDoc,
    source: &str,
    anchor: &mut TextAnchor,
    affinity: Affinity,
    basis: &CursorWithPos,
    diff: &DiffBatch,
) -> Result<(), Error> {
    let cursor = anchor.engine_cursor()?;
    if cursor.id.is_none()
        || doc.get_cursor_pos(&cursor).map_err(|_| Error::Anchor)?.update.is_none()
    {
        return Ok(());
    }
    if basis.cursor.container != super::super::model::text_id(source) {
        return Err(Error::Anchor);
    }
    let (position, deleted) = history_position(diff, &basis.cursor.container, basis.pos.pos);
    let position = if !deleted && basis.cursor.side == Side::Right {
        position.checked_add(1).ok_or(Error::Offset)?
    } else {
        position
    };
    let text = super::super::model::existing_text(doc, source).ok_or(Error::Anchor)?;
    let offset =
        text.convert_pos(position, PosType::Unicode, PosType::Utf16).ok_or(Error::Anchor)?;
    *anchor =
        TextAnchor::capture(&text, u32::try_from(offset).map_err(|_| Error::Offset)?, affinity)?;
    Ok(())
}
fn history_position(
    diff: &DiffBatch,
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
