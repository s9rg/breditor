//! Retain proposal and decision provenance, exact packets and the private effect writer.
use super::{
    StoredProposal, SuggestionRole, SuggestionUpdate, SuggestionsState,
    revisions::RevisionCheckpoint,
};
use crate::{
    Error, Result, Room,
    room::materialized_checkpoint::{ReplicaCheckpoint, sequence},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct SuggestionCheckpoint {
    binding: String,
    enabled_at: u64,
    bytes: usize,
    roles: BTreeMap<String, SuggestionRole>,
    proposals: BTreeMap<String, StoredProposal>,
    updates: BTreeMap<u64, SuggestionUpdate>,
    effect: ReplicaCheckpoint,
    revisions: Option<RevisionCheckpoint>,
}

impl SuggestionCheckpoint {
    pub(in crate::room) fn capture(state: &SuggestionsState) -> Result<Self> {
        Ok(Self {
            binding: state.binding.clone(),
            enabled_at: state.enabled_at,
            bytes: state.bytes,
            roles: state.roles.clone(),
            proposals: state.proposals.clone(),
            updates: state.updates.clone(),
            effect: ReplicaCheckpoint::capture(&state.effect_owner)?,
            revisions: state.revisions.as_ref().map(RevisionCheckpoint::capture).transpose()?,
        })
    }

    pub(in crate::room) fn restore(self, room: &Room, end: u64) -> Result<SuggestionsState> {
        crate::credentials::hash(&self.binding)?;
        if !room.atomic_transport_v2
            || self.enabled_at == 0
            || self.enabled_at >= end
            || self.proposals.len() > super::MAX_PROPOSALS
            || self.bytes > super::MAX_PACKETS_BYTES
        {
            return Err(Error::Contract("relay checkpoint suggestion bounds"));
        }
        if self.bytes != self.proposals.values().map(|row| row.packet.len()).sum::<usize>() {
            return Err(Error::Contract("relay checkpoint suggestion byte count differs"));
        }
        for (id, proposal) in &self.proposals {
            let at = sequence(&proposal.publication.sequence, end)?;
            if proposal.publication.suggestion.id != *id
                || at <= self.enabled_at
                || proposal.packet.len() > super::MAX_PACKET_BYTES
            {
                return Err(Error::Contract("relay checkpoint suggestion entry"));
            }
        }
        let effect_owner =
            self.effect.restore(&room.profile, room.replica.document_id(), super::EFFECT_WRITER)?;
        Ok(SuggestionsState {
            binding: self.binding,
            enabled_at: self.enabled_at,
            bytes: self.bytes,
            roles: self.roles,
            proposals: self.proposals,
            updates: self.updates,
            effect_owner,
            revisions: self.revisions.map(|value| value.restore(end)).transpose()?,
        })
    }
}
