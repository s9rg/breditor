//! Local selection/typing metadata never enters the replicated content roots.
use super::selection::{self, AnchoredSelection, Selection, SelectionOutcome};
use crate::Error;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    rich_content::RichDocument,
    state::EditorContext,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Choose causal mapping or an explicit selection admitted after the whole action group.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case", deny_unknown_fields)]
pub enum SelectionUpdate {
    /// Preserve stable endpoints through content changes and explicit deletion fallback.
    #[default]
    Map,
    /// Set a new post-action selection, including explicit clearing.
    Set(Option<Selection>),
}

/// Pending formats are local typing state, not shared document formatting or history entries.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case", deny_unknown_fields)]
pub enum PendingFormatsUpdate {
    /// Keep the override only while its effective caret block/kind remains unchanged.
    #[default]
    Map,
    /// Set admitted complete formats; null derives at the caret and an empty array types plain.
    Set(Option<Vec<Value>>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PendingContext {
    block: String,
    kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UiState {
    pub selection: Option<AnchoredSelection>,
    pub pending: Option<Vec<Value>>,
    context: Option<PendingContext>,
    pub outcome: SelectionOutcome,
}
impl UiState {
    pub fn engine_meta(&self, doc: &LoroDoc, key: &str) -> Result<loro::UndoItemMeta, Error> {
        let mut meta = loro::UndoItemMeta::new();
        meta.set_value(key.into());
        if let Some(AnchoredSelection::Text { anchor, focus }) = &self.selection {
            meta.add_cursor(&anchor.current_engine_cursor(doc)?);
            meta.add_cursor(&focus.current_engine_cursor(doc)?);
        }
        Ok(meta)
    }
    pub fn apply_engine_cursors(
        &mut self,
        doc: &LoroDoc,
        meta: &loro::UndoItemMeta,
        diff: &loro_internal::undo::DiffBatch,
    ) -> Result<(), Error> {
        if let Some(AnchoredSelection::Text { anchor, focus }) = &mut self.selection {
            if meta.cursors.len() != 2 {
                return Err(Error::ReplayMismatch);
            }
            anchor.repair_history_cursor(doc, &meta.cursors[0], diff)?;
            focus.repair_history_cursor(doc, &meta.cursors[1], diff)?;
        } else if !meta.cursors.is_empty() {
            return Err(Error::ReplayMismatch);
        }
        Ok(())
    }
    pub fn candidate(
        &self,
        doc: &LoroDoc,
        document: &RichDocument,
    ) -> Result<Option<Selection>, Error> {
        self.selection
            .as_ref()
            .map(|selection| selection::resolve(doc, document, selection))
            .transpose()?
            .map(|result| {
                result
                    .map(|(_, candidate)| candidate)
                    .map_err(|_| Error::Contract("unmapped shared selection"))
            })
            .transpose()
    }
    pub fn normalize(
        &mut self,
        doc: &LoroDoc,
        document: &RichDocument,
        previous: Option<&Selection>,
    ) -> Result<(), Error> {
        if let Some(selection) = &self.selection {
            match selection::resolve(doc, document, selection)? {
                Ok((mapped, candidate)) => {
                    self.selection = Some(mapped);
                    self.outcome = if previous == Some(&candidate) {
                        SelectionOutcome::Preserved
                    } else {
                        SelectionOutcome::Relocated
                    };
                }
                Err(reason) => {
                    self.selection = None;
                    self.outcome = SelectionOutcome::Cleared { reason };
                }
            }
        }
        if self.pending.is_some() != self.context.is_some() {
            return Err(Error::Contract("shared pending context binding"));
        }
        let candidate = self.candidate(doc, document)?;
        let context = candidate
            .as_ref()
            .and_then(Selection::caret)
            .map(|point| -> Result<PendingContext, Error> {
                Ok(PendingContext {
                    block: point.block.clone(),
                    kind: selection::kind(document, &point.block)?,
                })
            })
            .transpose()?;
        if self.context.is_some() && self.context != context {
            self.pending = None;
            self.context = None;
        }
        Ok(())
    }
    pub fn set_selection(
        &mut self,
        doc: &LoroDoc,
        document: &RichDocument,
        value: Option<&Selection>,
    ) -> Result<(), Error> {
        self.selection =
            value.map(|selection| selection::capture(doc, document, selection)).transpose()?;
        self.pending = None;
        self.context = None;
        self.outcome = SelectionOutcome::Preserved;
        Ok(())
    }
    pub fn set_pending(
        &mut self,
        codec: &DocumentJsonCodecV2,
        doc: &LoroDoc,
        document: &RichDocument,
        value: Option<&[Value]>,
    ) -> Result<(), Error> {
        let Some(value) = value else {
            self.pending = None;
            self.context = None;
            return Ok(());
        };
        let candidate = self.candidate(doc, document)?;
        let point = candidate
            .as_ref()
            .and_then(Selection::caret)
            .ok_or(Error::Contract("shared pending formats require caret"))?;
        self.pending = Some(canonical_formats(codec, value)?);
        self.context = Some(PendingContext {
            block: point.block.clone(),
            kind: selection::kind(document, &point.block)?,
        });
        Ok(())
    }
    pub fn after(
        &mut self,
        codec: &DocumentJsonCodecV2,
        doc: &LoroDoc,
        document: &RichDocument,
        selection: &SelectionUpdate,
        pending: &PendingFormatsUpdate,
    ) -> Result<(), Error> {
        if let SelectionUpdate::Set(value) = selection {
            let current = self.candidate(doc, document)?;
            if current != *value {
                self.set_selection(doc, document, value.as_ref())?;
            }
        }
        if let PendingFormatsUpdate::Set(value) = pending {
            self.set_pending(codec, doc, document, value.as_deref())?;
        }
        if let Some(value) = &self.pending {
            canonical_formats(codec, value)?;
        }
        Ok(())
    }
}

pub(super) fn canonical_formats(
    codec: &DocumentJsonCodecV2,
    value: &[Value],
) -> Result<Vec<Value>, Error> {
    let formats = RichFormatsJsonCodec::new(EditorContext::new(
        codec.schema().clone(),
        codec.limits().clone(),
    ));
    let admitted = formats
        .decode(&serde_json::to_string(value)?)
        .map_err(|_| Error::Contract("shared pending formats admission"))?;
    Ok(serde_json::from_str(
        &formats
            .encode(&admitted)
            .map_err(|_| Error::Contract("shared pending formats encoding"))?,
    )?)
}
