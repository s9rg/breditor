//! Candidate rich V4 page-break commands: strict records, Rust-owned actions.
//!
//! `insertPageBreak {position, block}` inserts one atomic page break with the fresh
//! identity `block` at a document-root position; `deletePageBreak {block, paragraph}`
//! removes one, using `paragraph` only as a fresh floor when nothing else would remain.
//! Both records reject unknown and missing fields; non-V4 owners refuse natively.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InsertRecord {
    position: super::drafts::PositionRecord,
    block: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DeleteRecord {
    block: String,
    paragraph: String,
}

pub(super) fn insert(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: InsertRecord = decode(input)?;
    let position = record.position.position()?;
    let block = checked(BlockId::try_new(record.block))?;
    owner.insert_page_break(observation, &position, &block).map_err(|value| error::session(&value))
}

pub(super) fn delete(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: DeleteRecord = decode(input)?;
    let block = checked(BlockId::try_new(record.block))?;
    let paragraph = checked(BlockId::try_new(record.paragraph))?;
    owner.delete_page_break(observation, &block, &paragraph).map_err(|value| error::session(&value))
}
