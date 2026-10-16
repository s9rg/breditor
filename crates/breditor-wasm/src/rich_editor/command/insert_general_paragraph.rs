//! Closed general paragraph command; all topology choices and identities are native.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::selection::SelectionRecord};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    selection: SelectionRecord,
    prefix: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let r: Record = decode(input)?;
    checked(owner.insert_general_paragraph(observation, &r.selection.into_kind()?, &r.prefix))
}
