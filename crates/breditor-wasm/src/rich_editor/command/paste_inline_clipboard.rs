//! Paste canonical inline clipboard content over a supported current text selection.
use super::support::decode;
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    clipboard_json: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let fragment = super::support::checked(
        RichClipboardJsonCodec::new(owner.context().clone()).decode(&record.clipboard_json),
    )?;
    let text = super::support::checked(fragment.text_fragment(owner.context()))?;
    owner.replace_selection_text(observation, &text).map_err(|value| error::session(&value))
}
