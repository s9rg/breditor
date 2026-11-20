//! Candidate rich V4 collapsible-section commands: strict records, Rust-owned actions.
//!
//! `wrapDetails {first,last,wrapper,summary,open}`, `unwrapDetails {wrapper}`,
//! `setDetailsOpen {block,open}` and `enterDetailsBody {paragraph}`. Every record
//! rejects unknown and missing fields; non-V4 owners refuse each action natively.
use super::support::{checked, decode, dispatch};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, UnwrapDetails, WrapDetails},
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WrapRecord {
    first: String,
    last: String,
    wrapper: String,
    summary: String,
    open: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UnwrapRecord {
    wrapper: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenRecord {
    block: String,
    open: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EnterRecord {
    paragraph: String,
}

pub(super) fn wrap(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: WrapRecord = decode(input)?;
    let action = checked(WrapDetails::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        &checked(BlockId::try_new(record.wrapper))?,
        &checked(BlockId::try_new(record.summary))?,
        record.open,
    ))?;
    dispatch(owner, observation, RichAction::WrapDetails(action))
}

pub(super) fn unwrap(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: UnwrapRecord = decode(input)?;
    let action = checked(UnwrapDetails::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.wrapper))?,
    ))?;
    dispatch(owner, observation, RichAction::UnwrapDetails(action))
}

pub(super) fn set_open(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: OpenRecord = decode(input)?;
    let block = checked(BlockId::try_new(record.block))?;
    owner.set_details_open(observation, &block, record.open).map_err(|value| error::session(&value))
}

pub(super) fn enter_body(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: EnterRecord = decode(input)?;
    let paragraph = checked(BlockId::try_new(record.paragraph))?;
    owner.enter_details_body(observation, &paragraph).map_err(|value| error::session(&value))
}
