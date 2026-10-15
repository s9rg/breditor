//! Pending typing formats are independently admitted local state, never a content undo unit.
use super::{RichReplica, SharedObservation};
use crate::Error;
use serde_json::Value;

impl RichReplica {
    /// Admit the strict literal-array wire directly, preserving duplicate-field detection.
    /// # Errors
    /// Malformed/oversized arrays, non-caret overrides or failed adoption retain all state.
    pub fn set_pending_formats_json(&mut self, input: &str) -> Result<bool, Error> {
        if input.len() > 64 * 1024 {
            return Err(Error::Limit("shared pending JSON bytes"));
        }
        if input.trim() == "null" {
            return self.set_pending_formats(None);
        }
        let codec = breditor_core::codec::RichFormatsJsonCodec::new(
            breditor_core::state::EditorContext::new(
                self.codec.schema().clone(),
                self.codec.limits().clone(),
            ),
        );
        let formats =
            codec.decode(input).map_err(|_| Error::Contract("shared pending formats admission"))?;
        let value: Vec<Value> = serde_json::from_str(
            &codec
                .encode(&formats)
                .map_err(|_| Error::Contract("shared pending formats encoding"))?,
        )?;
        self.set_pending_formats(Some(&value))
    }
    /// Set complete caret formats; null derives and an empty array explicitly types plain.
    /// # Errors
    /// Non-caret overrides, invalid literals or failed staged adoption retain content/history/UI.
    pub fn set_pending_formats(&mut self, formats: Option<&[Value]>) -> Result<bool, Error> {
        let mut candidate = self.staged()?;
        candidate.journal.ui.set_pending(
            &candidate.codec,
            &candidate.doc,
            &candidate.document,
            formats,
        )?;
        if self.journal.ui == candidate.journal.ui {
            return Ok(false);
        }
        self.adopt(candidate)?;
        Ok(true)
    }
    /// Guard pending formats against content, local selection, pending formats and history changes.
    /// # Errors
    /// Stale/foreign observations reject before literal admission or mutation.
    pub fn set_pending_formats_guarded(
        &mut self,
        observation: &SharedObservation,
        formats: Option<&[Value]>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.set_pending_formats(formats)
    }
    /// Current admitted pending override, independent of any shared marks.
    #[must_use]
    pub fn pending_formats(&self) -> Option<&[Value]> {
        self.journal.ui.pending.as_deref()
    }
}
