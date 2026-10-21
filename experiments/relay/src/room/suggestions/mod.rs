//! Opt-in proposal publication and one ordered durable decision paired with its native effect.
mod decide;
mod decide_owned;
mod enable;
mod grant;
mod prepare_effect;
mod prepare_publication;
mod publish;
mod read;
mod recovery_inventory;
mod replay;
mod retained_asset_references;
mod revisions;
#[cfg(test)]
mod tests;
mod types;
use super::Room;
use crate::{Error, Result};
use breditor_collab_feasibility::rich_replica::RichReplica;
pub use revisions::{
    DurableSuggestionRevision, StoredSuggestionRevision, SuggestionRevisionAdmission,
    SuggestionRevisionRequest, SuggestionRevisionsCursor, SuggestionRevisionsDescriptor,
    SuggestionRevisionsPage,
};
use std::collections::BTreeMap;
pub use types::*;

// Ordinary client allocations start at two and are bounded to 1024. This exclusive host writer
// never has a client lease and must not be confused with the immutable genesis writer one.
pub(super) const EFFECT_WRITER: &str = "18446744073709551614";
const MAX_PROPOSALS: usize = 1024;
const MAX_PACKET_BYTES: usize = 1024 * 1024;
const MAX_PACKETS_BYTES: usize = 32 * 1024 * 1024;
const MAX_PAGE_UPDATES: usize = 64;
// Native source anchors admit 1024 authored clocks, including genesis and this host author.
const MAX_DOCUMENT_AUTHORS: usize = 1022;
struct StoredProposal {
    publication: DocumentSuggestionPublication,
    packet: String,
    decision: Option<StoredSuggestionDecision>,
}
pub(super) struct SuggestionsState {
    binding: String,
    enabled_at: u64,
    bytes: usize,
    roles: BTreeMap<String, SuggestionRole>,
    proposals: BTreeMap<String, StoredProposal>,
    updates: BTreeMap<u64, SuggestionUpdate>,
    pub(in crate::room) effect_owner: RichReplica,
    revisions: Option<revisions::RevisionsState>,
}
impl Room {
    fn suggestions_state(&self) -> Result<&SuggestionsState> {
        self.log.ready()?;
        self.suggestions.as_ref().ok_or(Error::Contract("document suggestions V1 not enabled"))
    }
    pub(in crate::room) fn check_suggestion_author_budget(&self, extra: usize) -> Result<()> {
        if self.writers.values().filter(|writer| !writer.observer).count() + extra
            > MAX_DOCUMENT_AUTHORS
        {
            return Err(Error::Contract("suggestion source author clock budget"));
        }
        Ok(())
    }
}
fn check_id(value: &str) -> Result<()> {
    if value.len() != 71
        || !value.starts_with("sha256:")
        || !value.as_bytes()[7..].iter().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
    {
        return Err(Error::Contract("suggestion packet identity"));
    }
    Ok(())
}
