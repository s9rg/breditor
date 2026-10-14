//! Create one fresh non-destructive merge intent over the admitted grid selection.
use super::support::{checked, decode, dispatch};
use crate::{BreditorError, rich_editor::selection::decimal};
use breditor_core::rich_content::{
    CausalStamp, ChangeId, MergeId, ReplicaId, RichLocalOutcome, RichLocalSession,
    RichLocalSnapshot,
    actions::{MergeTableCells, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    merge: String,
    #[serde(deserialize_with = "decimal")]
    replica: u64,
    #[serde(deserialize_with = "decimal")]
    counter: u64,
    #[serde(deserialize_with = "decimal")]
    lamport: u64,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let stamp = CausalStamp::new(
        record.lamport,
        ChangeId::new(checked(ReplicaId::try_new(record.replica))?, record.counter),
    );
    let action = checked(MergeTableCells::capture(
        owner.state().document(),
        owner.state().selection().ok_or(super::invalid())?,
        checked(MergeId::try_new(record.merge))?,
        stamp,
    ))?;
    dispatch(owner, observation, RichAction::MergeTableCells(action))
}
