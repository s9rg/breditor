//! Committed revisions and their ordered indexes. Orphan prepares stay in the WAL.
use super::{RetainedRevision, RevisionsState};
use crate::{Error, Result, room::materialized_checkpoint::sequence};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room::suggestions) struct RevisionCheckpoint {
    binding: String,
    enabled_at: u64,
    bytes: usize,
    retained: BTreeMap<String, RetainedRevision>,
    by_parent: BTreeMap<String, String>,
    roots: BTreeMap<String, String>,
    updates: BTreeMap<u64, String>,
}

impl RevisionCheckpoint {
    pub fn capture(state: &RevisionsState) -> Result<Self> {
        if state.pending.is_some() {
            return Err(Error::Contract("relay checkpoint has an unsettled revision"));
        }
        Ok(Self {
            binding: state.binding.clone(),
            enabled_at: state.enabled_at,
            bytes: state.bytes,
            retained: state.retained.clone(),
            by_parent: state.by_parent.clone(),
            roots: state.roots.clone(),
            updates: state.updates.clone(),
        })
    }

    pub fn restore(self, end: u64) -> Result<RevisionsState> {
        crate::credentials::hash(&self.binding)?;
        let bytes = self.retained.values().map(|row| row.packet.len()).sum::<usize>();
        if self.enabled_at == 0
            || self.enabled_at >= end
            || self.retained.len() != self.updates.len()
            || self.retained.len() != self.by_parent.len()
            || self.retained.len() != self.roots.len()
            || self.bytes != bytes
            || bytes > super::super::MAX_PACKETS_BYTES
        {
            return Err(Error::Contract("relay checkpoint suggestion revision bounds"));
        }
        for (id, row) in &self.retained {
            let receipt = &row.receipt;
            let at = sequence(&receipt.publication.sequence, end)?;
            if receipt.revision.id != *id
                || at <= self.enabled_at
                || self.updates.get(&at) != Some(id)
                || self.by_parent.get(&receipt.previous_decision.suggestion_id) != Some(id)
                || self.roots.get(&receipt.publication.suggestion.id)
                    != Some(&receipt.root_suggestion_id)
            {
                return Err(Error::Contract("relay checkpoint suggestion revision entry"));
            }
        }
        Ok(RevisionsState {
            binding: self.binding,
            enabled_at: self.enabled_at,
            bytes: self.bytes,
            retained: self.retained,
            by_parent: self.by_parent,
            roots: self.roots,
            updates: self.updates,
            pending: None,
        })
    }
}
