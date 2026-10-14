//! Plain caret input authors exact pending/affinity-derived styles and one advanced-caret group.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::{InsertText, SetFormat},
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::{
    codec::RichFormatsJsonCodec,
    position::Point,
    rich_content::{BlockId, ResolvedRichSelection},
    state::EditorContext,
};
use serde_json::Value;
use std::collections::BTreeMap;

impl RichReplica {
    /// Type at a collapsed shared caret with the admitted pending or source-run formats.
    /// # Errors
    /// Non-carets, invalid text/limits or failed staged publication preserve content/history/UI.
    pub fn insert_plain_text(&mut self, text: &str) -> Result<bool, Error> {
        let selection = self.selection()?.ok_or(Error::Contract("shared typing requires caret"))?;
        let point = selection.caret().ok_or(Error::Contract("shared typing requires caret"))?;
        if text.is_empty() {
            return Ok(false);
        }
        if text.len() > 64 * 1024 {
            return Err(Error::Limit("shared typing bytes"));
        }
        let length = u32::try_from(text.encode_utf16().count()).map_err(|_| Error::Offset)?;
        let formats = self.effective_formats(&selection)?;
        let desired = formats
            .iter()
            .map(|format| {
                Ok((
                    format["type"]
                        .as_str()
                        .ok_or(Error::Contract("shared typing format kind"))?
                        .to_owned(),
                    format.clone(),
                ))
            })
            .collect::<Result<BTreeMap<_, _>, Error>>()?;
        let mut commands = vec![Command::InsertText(InsertText {
            block: point.block.clone(),
            offset: point.offset,
            text: text.into(),
        })];
        for (kind, format) in self.block_formats(&point.block)? {
            if !desired.contains_key(&kind) {
                commands.push(mark(point, length, format, false));
            }
        }
        for format in desired.into_values() {
            commands.push(mark(point, length, format, true));
        }
        let next = TextPoint {
            block: point.block.clone(),
            offset: point.offset.checked_add(length).ok_or(Error::Offset)?,
            affinity: Affinity::After,
        };
        self.apply_with_state(
            commands,
            SelectionUpdate::Set(Some(Selection::TextRange { anchor: next.clone(), focus: next })),
            PendingFormatsUpdate::Set(self.pending_formats().map(<[Value]>::to_vec)),
        )
    }
    /// Guard caret input against every content, selection, pending-format and history publication.
    /// # Errors
    /// A stale/foreign observation rejects before input admission or planning.
    pub fn insert_plain_text_guarded(
        &mut self,
        observation: &SharedObservation,
        text: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.insert_plain_text(text)
    }
    fn effective_formats(&self, selection: &Selection) -> Result<Vec<Value>, Error> {
        if let Some(formats) = self.pending_formats() {
            return Ok(formats.to_vec());
        }
        let ResolvedRichSelection::TextRange { focus, .. } = selection
            .admit(&self.document)?
            .resolve(&self.document)
            .map_err(|_| Error::Contract("shared typing selection"))?
        else {
            return Err(Error::Contract("shared typing selection"));
        };
        let Point::Text { text_path, .. } = focus else {
            return Ok(vec![]);
        };
        let node = self
            .document
            .document()
            .node_at(&text_path)
            .map_err(|_| Error::Contract("shared typing run"))?
            .as_text()
            .ok_or(Error::Contract("shared typing run"))?;
        let codec = RichFormatsJsonCodec::new(EditorContext::new(
            self.codec.schema().clone(),
            self.codec.limits().clone(),
        ));
        Ok(serde_json::from_str(
            &codec.encode(node.formats()).map_err(|_| Error::Contract("shared typing formats"))?,
        )?)
    }
    fn block_formats(&self, block: &str) -> Result<BTreeMap<String, Value>, Error> {
        let node = self
            .document
            .document()
            .node_at(
                self.document
                    .block_path(
                        &BlockId::try_new(block)
                            .map_err(|_| Error::Contract("shared typing block"))?,
                    )
                    .ok_or(Error::Contract("shared typing block"))?,
            )
            .map_err(|_| Error::Contract("shared typing block"))?
            .as_element()
            .ok_or(Error::Contract("shared typing block"))?;
        let codec = RichFormatsJsonCodec::new(EditorContext::new(
            self.codec.schema().clone(),
            self.codec.limits().clone(),
        ));
        let mut kinds = BTreeMap::new();
        for run in node.children().iter().filter_map(breditor_core::document::NodeRef::as_text) {
            let formats: Vec<Value> = serde_json::from_str(
                &codec
                    .encode(run.formats())
                    .map_err(|_| Error::Contract("shared typing run formats"))?,
            )?;
            for format in formats {
                kinds
                    .entry(
                        format["type"]
                            .as_str()
                            .ok_or(Error::Contract("shared typing format kind"))?
                            .to_owned(),
                    )
                    .or_insert(format);
            }
        }
        Ok(kinds)
    }
}
fn mark(point: &TextPoint, length: u32, format: Value, enabled: bool) -> Command {
    Command::SetFormat(SetFormat {
        block: point.block.clone(),
        offset: point.offset,
        length,
        format,
        enabled,
    })
}
