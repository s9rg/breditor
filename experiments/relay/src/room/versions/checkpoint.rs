//! Original version catalog entries and their literal packets.
use super::{StoredVersion, VersionsState};
use crate::{Error, Result, room::materialized_checkpoint::sequence};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct VersionCheckpoint {
    binding: String,
    enabled_at: u64,
    entries: BTreeMap<String, StoredVersion>,
}

impl VersionCheckpoint {
    pub(in crate::room) fn capture(state: &VersionsState) -> Self {
        Self {
            binding: state.binding.clone(),
            enabled_at: state.enabled_at,
            entries: state.entries.clone(),
        }
    }

    pub(in crate::room) fn restore(self, end: u64) -> Result<VersionsState> {
        crate::credentials::hash(&self.binding)?;
        if self.enabled_at == 0
            || self.enabled_at >= end
            || self.entries.len() > super::MAX_VERSIONS
        {
            return Err(Error::Contract("relay checkpoint version bounds"));
        }
        let mut order = BTreeMap::new();
        let mut bytes = 0;
        for (id, row) in &self.entries {
            let index = sequence(&row.entry.sequence, end)?;
            if row.entry.version.id != *id
                || index <= self.enabled_at
                || order.insert(index, id.clone()).is_some()
                || row.packet.len() > super::MAX_PACKET_BYTES
            {
                return Err(Error::Contract("relay checkpoint version entry"));
            }
            bytes += row.packet.len();
            if bytes > super::MAX_CATALOG_BYTES {
                return Err(Error::Contract("relay checkpoint version byte budget"));
            }
        }
        Ok(VersionsState {
            binding: self.binding,
            enabled_at: self.enabled_at,
            bytes,
            entries: self.entries,
            order,
        })
    }
}
