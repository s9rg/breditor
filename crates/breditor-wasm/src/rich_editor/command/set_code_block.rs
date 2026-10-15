//! Explicit code conversion; formatting removal requires the caller's declared policy.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetCodeBlock},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Policy {
    RejectFormatted,
    RemoveFormats,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    block: String,
    #[serde(deserialize_with = "super::support::nullable")]
    language: Option<String>,
    format_policy: Policy,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let language = record
        .language
        .map(breditor_core::rich_content::CodeLanguage::try_new)
        .map(checked)
        .transpose()?;
    let policy = match record.format_policy {
        Policy::RejectFormatted => {
            breditor_core::rich_content::actions::CodeFormatPolicy::RejectFormatted
        }
        Policy::RemoveFormats => {
            breditor_core::rich_content::actions::CodeFormatPolicy::RemoveFormats
        }
    };
    let action = checked(SetCodeBlock::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.block))?,
        language.as_ref(),
        policy,
    ))?;
    dispatch(owner, observation, RichAction::SetCodeBlock(action))
}
