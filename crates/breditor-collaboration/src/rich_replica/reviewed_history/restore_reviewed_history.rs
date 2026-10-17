//! Exact recovery of the separately selected family; no old factory silently admits new records.
use super::{FORMAT, checkpoint_reviewed_history::Replay};
use crate::{
    Error,
    rich_replica::{
        RichReplica, SharedRichProfile,
        session::{Journal, MAX_JOURNAL_BYTES},
        typing_checkpoint::{BoundedEntries, join_records},
    },
};
use serde::{Deserialize, Deserializer};
#[derive(Deserialize)]
struct Joins(#[serde(deserialize_with = "join_records")] Vec<u32>);
fn optional_joins<'de, D: Deserializer<'de>>(reader: D) -> Result<Option<Joins>, D::Error> {
    Option::<Joins>::deserialize(reader)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope {
    format: String,
    format_version: u32,
    model_version: u32,
    journal_version: u32,
    replay: Replay,
    journal: Journal<BoundedEntries>,
    #[serde(deserialize_with = "optional_joins")]
    joins: Option<Joins>,
}
impl SharedRichProfile {
    /// Recover the opt-in local reviewed history only after reacquiring the exact saved writer.
    /// Re-proves every original accepted effect and rebuilds ordered history plus once-only receipts.
    /// Recovery restores no authenticated role, writable permission, server connection or credential.
    /// # Errors
    /// Wrong family/room/model, unknown fields, missing activation, altered native replay or bounds reject.
    pub fn restore_reviewed(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        if input.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("reviewed checkpoint bytes"));
        }
        let value: Envelope = serde_json::from_str(input)?;
        let protocol = super::super::protocol::Protocol::from_codec(&self.codec)?;
        if value.format != FORMAT
            || value.format_version != 1
            || value.model_version != protocol.model()
            || value.journal_version != protocol.journal()
            || value.journal.document != room
        {
            return Err(Error::Contract("reviewed checkpoint binding"));
        }
        RichReplica::from_journal_contract_cached(
            self.codec.clone(),
            value.journal.map_entries(|entries| entries.0),
            value.joins.map(|joins| joins.0),
            false,
            value.replay.into(),
            true,
            None,
        )
    }
}
