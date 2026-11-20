//! Strict candidate-V4 mention insertion replacing one explicit text range (the typed trigger).
use super::support::decode;
use crate::{
    BreditorError,
    rich_editor::{error, selection::SelectionRecord},
};
use breditor_core::{
    codec::decode_rich_mention,
    rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot},
};
use serde::Deserialize;
use serde_json::value::RawValue;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record<'a> {
    selection: SelectionRecord,
    #[serde(borrow)]
    mention: &'a RawValue,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record<'_> = decode(input)?;
    let mention = decode_rich_mention(owner.context(), record.mention.get())
        .map_err(|_| error::rejected("breditor_rich.mention_intent"))?;
    owner
        .insert_mention(observation, &record.selection.into_kind()?, &mention)
        .map_err(|value| error::session(&value))
}
