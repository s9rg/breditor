//! First-key general replacement starts a natural group using the logical start's native style.
use super::{
    RichReplica, SharedObservation,
    selection::Selection,
    typing_history::{Kind, Request, separator},
};
use crate::Error;
use breditor_core::{codec::RichFormatsJsonCodec, document::TextRun, rich_content::BlockId};
impl RichReplica {
    /// Replace a text selection with user input and allow subsequent same-caret typing to join.
    /// Requires explicit general and natural history. A caret uses ordinary native typing.
    /// Empty input proves the text source but deletes nothing and consumes no IDs.
    /// # Errors
    /// Stale/read-only/disabled, non-text, malformed text, IDs or any final admission failure is atomic.
    pub fn replace_general_typing_text_guarded(
        &mut self,
        observation: &SharedObservation,
        text: &str,
        empty: &[BlockId],
        clock_ms: u64,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.general_ranges_enabled() || !self.typing_history_enabled() {
            return Err(Error::Contract("general natural history required"));
        }
        let selection = self.selection()?.ok_or(Error::Contract("general typing selection"))?;
        let Selection::TextRange { anchor, focus } = &selection else {
            return Err(Error::Contract("general typing requires text range"));
        };
        selection.admit(&self.document)?;
        if text.is_empty() {
            return Ok(false);
        }
        if text.len() > 64 * 1024 {
            return Err(Error::Limit("general typing bytes"));
        }
        if selection.caret().is_some() {
            if !empty.is_empty() {
                return Err(Error::Contract("caret typing requires no floor IDs"));
            }
            return self.insert_typing_text_guarded(observation, text, clock_ms);
        }
        let (start, _) = super::range_plan::ordered(&self.document, anchor, focus)?;
        let caret = Selection::TextRange { anchor: start.clone(), focus: start.clone() };
        let formats = self.effective_formats(&caret)?;
        let marks = RichFormatsJsonCodec::new(super::paragraphs::context(&self.codec))
            .decode(&serde_json::to_string(&formats)?)
            .map_err(|_| Error::Contract("general typing formats"))?;
        let inserted = TextRun::try_new(text, marks)
            .map_err(|_| Error::Contract("general typing run"))?
            .into();
        let request = Request {
            join: false,
            kind: Kind::Insert,
            clock: clock_ms,
            formats,
            isolated: separator(text),
        };
        self.replace_general_selection_text_with_typing(
            observation,
            &inserted,
            empty,
            Some(request),
        )
    }
}
