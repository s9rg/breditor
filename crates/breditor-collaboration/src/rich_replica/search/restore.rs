//! Strict bounded replay of the explicitly requested search family, never format autodetection.
use super::super::{
    RichReplica, SharedRichProfile,
    general_history::ReplayCapabilities,
    session::{Journal, MAX_JOURNAL_BYTES},
    typing_checkpoint::{BoundedEntries, join_records},
};
use super::{FORMAT, checkpoint::Scope};
use crate::Error;
use serde::{Deserialize, Deserializer};

#[derive(Deserialize)]
struct Joins(#[serde(deserialize_with = "join_records")] Vec<u32>);
fn optional_joins<'de, D: Deserializer<'de>>(reader: D) -> Result<Option<Joins>, D::Error> {
    Option::<Joins>::deserialize(reader)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    format: String,
    format_version: u32,
    model_version: u32,
    journal_version: u32,
    scope: Scope,
    reviewed: bool,
    journal: Journal<BoundedEntries>,
    #[serde(deserialize_with = "optional_joins")]
    joins: Option<Joins>,
}
impl SharedRichProfile {
    /// Restore only the explicit search family after reacquiring its exact writer
    /// lease. Replays every semantic edit/effect; no saved query is re-evaluated.
    /// Permissions, credentials and live search-result handles are not restored.
    /// # Errors
    /// Wrong family/scope/room/model, unknown fields, divergent replay, bad typing
    /// or reviewed history and active resource limits reject before exposing an owner.
    pub fn restore_search(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        if input.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("search checkpoint bytes"));
        }
        let value: Envelope = serde_json::from_str(input)?;
        let protocol = super::super::protocol::Protocol::from_codec(&self.codec)?;
        if value.format != FORMAT
            || value.format_version != 1
            || value.model_version != protocol.model()
            || value.journal_version != protocol.journal()
            || value.journal.document != room
        {
            return Err(Error::Contract("search checkpoint binding"));
        }
        RichReplica::from_journal_capabilities_cached(
            self.codec.clone(),
            value.journal.map_entries(|entries| entries.0),
            value.joins.map(|joins| joins.0),
            false,
            ReplayCapabilities {
                scope: value.scope.into(),
                reviewed: value.reviewed,
                search: true,
            },
            None,
        )
    }
}
