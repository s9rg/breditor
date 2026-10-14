//! Replace an explicit browser input target without overwriting the saved pre-edit caret.
use super::support::decode;
use crate::{
    BreditorError,
    rich_editor::{error, selection::SelectionRecord},
};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    selection: SelectionRecord,
    text: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    owner
        .replace_range_plain_text(observation, &record.selection.into_kind()?, &record.text)
        .map_err(|value| error::session(&value))
}
