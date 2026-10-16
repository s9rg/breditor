//! Explicit first-key target and subsequent typing form one selective group, never a prior burst.
use super::{
    RichReplica, SharedObservation,
    replace_general_selection_text::GeneralInput,
    selection::Selection,
    typing_history::{Kind, Request, separator},
};
use crate::Error;
use breditor_core::{codec::RichFormatsJsonCodec, rich_content::BlockId};
impl RichReplica {
    /// Closed first-key request with canonical clock and a host-reserved fresh namespace.
    /// # Errors
    /// Stale/read-only/disabled owners reject before decoding; invalid input or admission is atomic.
    pub fn replace_general_range_typing_text_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        use super::general_range_input_json::{self as json, Typing};
        json::authorize(self, observation)?;
        if !self.typing_history_enabled() {
            return Err(Error::Contract("general natural history required"));
        }
        let r: Typing = json::decode(input)?;
        let plan =
            self.plan_general_range_plain_text_guarded(observation, &r.selection, &r.text)?;
        let count = if r.text.is_empty() { 0 } else { plan.range().empty_blocks().len() };
        let empty =
            breditor_core::rich_content::allocate_general_range_paragraphs(&r.prefix, count)
                .map_err(|_| Error::Contract("general input namespace"))?;
        self.replace_general_range_typing_text_guarded(
            observation,
            &r.selection,
            &r.text,
            &empty,
            r.clock_ms,
        )
    }
    /// Apply explicit-target user input while preserving the actual previous selection.
    /// Empty input proves its target without deleting; an actual caret uses ordinary typing.
    /// # Errors
    /// Stale/read-only/disabled, malformed input/IDs or final limits reject atomically.
    pub fn replace_general_range_typing_text_guarded(
        &mut self,
        observation: &SharedObservation,
        target: &Selection,
        text: &str,
        empty: &[BlockId],
        clock_ms: u64,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.general_ranges_enabled() || !self.typing_history_enabled() {
            return Err(Error::Contract("general natural history required"));
        }
        let plan = self.plan_general_range_plain_text_guarded(observation, target, text)?;
        if text.is_empty() {
            return Ok(false);
        }
        if target.caret().is_some() && self.selection()?.as_ref() == Some(target) {
            if !empty.is_empty() {
                return Err(Error::Contract("caret typing requires no floor IDs"));
            }
            return self.insert_typing_text_guarded(observation, text, clock_ms);
        }
        let formats = serde_json::from_str(
            &RichFormatsJsonCodec::new(super::paragraphs::context(&self.codec))
                .encode(plan.formats())
                .map_err(|_| Error::Contract("general typing formats"))?,
        )?;
        self.replace_general_range_input(
            observation,
            plan.inserted(),
            empty,
            GeneralInput {
                target,
                typing: Some(Request {
                    join: false,
                    kind: Kind::Insert,
                    clock: clock_ms,
                    formats,
                    isolated: separator(text),
                }),
                pending: Some(plan.formats().clone()),
            },
        )
    }
}
