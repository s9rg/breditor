//! Rich V4 table-caption commands: strict records, Rust-owned actions.
//!
//! `addTableCaption {table, caption}` inserts one empty trailing caption paragraph with the
//! fresh identity `caption` and places the caret in it; `removeTableCaption {table}` removes
//! it. Both records reject unknown and missing fields; non-V4 owners refuse natively.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, TableId,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AddRecord {
    table: String,
    caption: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RemoveRecord {
    table: String,
}

pub(super) fn add(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: AddRecord = decode(input)?;
    let table = checked(TableId::try_new(record.table))?;
    let caption = checked(BlockId::try_new(record.caption))?;
    owner.add_table_caption(observation, &table, &caption).map_err(|value| error::session(&value))
}

pub(super) fn remove(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: RemoveRecord = decode(input)?;
    let table = checked(TableId::try_new(record.table))?;
    owner.remove_table_caption(observation, &table).map_err(|value| error::session(&value))
}
