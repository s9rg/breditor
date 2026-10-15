//! Apply one typed semantic format across explicit text intervals as one undo unit.
//!
//! The caller chooses intervals in its observed displayed selection; Rust checks
//! every scalar boundary, format and target. A block may occur at most once.
use super::support::{checked, decode};
use crate::{
    BreditorError,
    rich_editor::{error, selection::decimal},
};
use breditor_core::{
    codec::RichFormatsJsonCodec,
    identity::QualifiedName,
    position::TextOffset,
    rich_content::{
        BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelectionUpdate,
        actions::{RichAction, RichFormatChange, SetInlineFormat},
    },
};
use serde::Deserialize;
use std::collections::BTreeSet;
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Change {
    Set {
        #[serde(rename = "formatsJson")]
        formats_json: String,
    },
    Remove {
        format: String,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Target {
    pub(super) block: String,
    #[serde(deserialize_with = "decimal")]
    pub(super) start: u64,
    #[serde(deserialize_with = "decimal")]
    pub(super) end: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    change: Change,
    targets: Vec<Target>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let change = admit_change(owner, record.change)?;
    if record.targets.is_empty() {
        return Err(super::invalid());
    }
    let mut seen = BTreeSet::new();
    let actions = record
        .targets
        .into_iter()
        .map(|target| {
            let block = checked(BlockId::try_new(target.block))?;
            if !seen.insert(block.clone()) {
                return Err(super::invalid());
            }
            Ok(RichAction::SetInlineFormat(checked(SetInlineFormat::capture(
                owner.state().document(),
                &block,
                checked(TextOffset::try_new(target.start))?,
                checked(TextOffset::try_new(target.end))?,
                &change,
            ))?))
        })
        .collect::<Result<Vec<_>, BreditorError>>()?;
    owner
        .dispatch(observation, &actions, RichSelectionUpdate::Map)
        .map_err(|value| error::session(&value))
}

pub(super) fn admit_change(
    owner: &RichLocalSession,
    change: Change,
) -> Result<RichFormatChange, BreditorError> {
    Ok(match change {
        Change::Remove { format } => {
            RichFormatChange::Remove(checked(QualifiedName::try_new(format))?)
        }
        Change::Set { formats_json } => {
            let formats =
                checked(RichFormatsJsonCodec::new(owner.context().clone()).decode(&formats_json))?;
            if formats.len() != 1 {
                return Err(super::invalid());
            }
            RichFormatChange::Set(formats.iter().next().ok_or(super::invalid())?.clone())
        }
    })
}
