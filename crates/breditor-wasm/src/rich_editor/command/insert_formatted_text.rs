//! Replace the current supported text range with explicitly admitted inline formatting.
use super::{
    drafts::fragment,
    support::{checked, decode},
};
use crate::BreditorError;
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    text: String,
    formats_json: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let inserted = fragment(owner.context(), &record.text, &record.formats_json)?;
    checked(owner.replace_selection_text(observation, &inserted))
}
