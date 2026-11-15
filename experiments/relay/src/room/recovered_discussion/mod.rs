//! Immutable recovery attachments associated with exact, accepted native review births.
mod record;
use super::Room;
#[cfg(feature = "server")]
use crate::log::Event;
use crate::{Error, Result};
use breditor_collab_feasibility::review::ReviewThreadId;
pub(super) use record::DiscussionLink;
pub(crate) use record::DiscussionRecord;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fmt::Write as _};

pub(crate) const MAX_DISCUSSION_BYTES: usize = 8 * 1024 * 1024;
const MAX_CATALOG_BYTES: usize = 64 * 1024 * 1024;
const MAX_DISCUSSIONS: usize = 4096;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiscussionEntry {
    link: DiscussionLink,
    sequence: String,
    sha256: String,
    bytes: usize,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StoredDiscussion {
    entry: DiscussionEntry,
    archive: [u8; 32],
    packet: String,
}

#[derive(Default)]
pub(super) struct Discussions {
    entries: BTreeMap<ReviewThreadId, StoredDiscussion>,
    bytes: usize,
}

impl Discussions {
    pub(super) fn checkpoint(&self) -> Vec<StoredDiscussion> {
        self.entries.values().cloned().collect()
    }

    fn check_capacity(&self, bytes: usize) -> Result<()> {
        if self.entries.len() >= MAX_DISCUSSIONS || bytes > MAX_CATALOG_BYTES - self.bytes {
            return Err(Error::Contract("recovered discussion catalog budget"));
        }
        Ok(())
    }

    fn insert(&mut self, stored: StoredDiscussion) {
        self.bytes += stored.packet.len();
        self.entries.insert(stored.entry.link.id.clone(), stored);
    }
}

impl DiscussionEntry {
    fn new(link: DiscussionLink, sequence: u64, packet: &str) -> Self {
        let mut sha256 = String::with_capacity(64);
        for byte in Sha256::digest(packet.as_bytes()) {
            let _ = write!(sha256, "{byte:02x}");
        }
        Self { link, sequence: sequence.to_string(), sha256, bytes: packet.len() }
    }
}

impl Room {
    fn validate_discussion_link(&self, packet: &DiscussionRecord<'_>) -> Result<u64> {
        if !self.atomic_transport_v2
            || packet.room.room != self.replica.document_id()
            || packet.room.binding != self.review_descriptor(&self.owner)?.binding
        {
            return Err(Error::Contract("recovered discussion room differs"));
        }
        let seed = self.replica.writer_clock_v2("1")?;
        if seed.writer != packet.seed.writer
            || seed.through != packet.seed.through
            || seed.prefix_digest != packet.seed.prefix_digest
            || packet.link.principal.as_str() != self.owner
        {
            return Err(Error::Contract("recovered discussion seed or author differs"));
        }
        self.check_recovered_discussion_birth(&packet.link)
    }

    /// Replay a previously admitted file. Its source was verified under the serving epoch
    /// before append. The accepted review birth must already exist at this replay cut.
    pub(super) fn replay_recovered_discussion(
        &mut self,
        sequence: u64,
        principal: &str,
        archive: [u8; 32],
        packet: String,
    ) -> Result<()> {
        self.recovery_inventory_owner(principal)?;
        let parsed = DiscussionRecord::read(&packet)?;
        self.discussions.check_capacity(packet.len())?;
        if self.validate_discussion_link(&parsed)? >= sequence
            || self.discussions.entries.contains_key(&parsed.link.id)
        {
            return Err(Error::Contract("recovered discussion replay order differs"));
        }
        let entry = DiscussionEntry::new(parsed.link, sequence, &packet);
        self.discussions.insert(StoredDiscussion { entry, archive, packet });
        Ok(())
    }

    pub(super) fn restore_recovered_discussions(
        &mut self,
        discussions: Vec<StoredDiscussion>,
        records: u64,
    ) -> Result<()> {
        let mut sequences = std::collections::BTreeSet::new();
        for stored in discussions {
            let sequence =
                super::materialized_checkpoint::sequence(&stored.entry.sequence, records)?;
            let parsed = DiscussionRecord::read(&stored.packet)?;
            let expected = DiscussionEntry::new(parsed.link.clone(), sequence, &stored.packet);
            self.discussions.check_capacity(stored.packet.len())?;
            if expected.link != stored.entry.link
                || expected.sha256 != stored.entry.sha256
                || expected.bytes != stored.entry.bytes
                || self.validate_discussion_link(&parsed)? >= sequence
                || !sequences.insert(sequence)
                || self.discussions.entries.contains_key(&expected.link.id)
            {
                return Err(Error::Contract("recovered discussion checkpoint differs"));
            }
            self.discussions.insert(stored);
        }
        Ok(())
    }
}

#[cfg(feature = "server")]
impl Room {
    /// Verify full provenance before publishing. An exact retry returns the original entry,
    /// even when an earlier process committed it and disconnected before acknowledging it.
    pub(crate) fn publish_recovered_discussion(
        &mut self,
        principal: &str,
        thread: &ReviewThreadId,
        archive: [u8; 32],
        packet: String,
        verify: impl FnOnce(&Self) -> Result<()>,
    ) -> Result<DiscussionEntry> {
        if let Some(entry) =
            self.check_recovered_discussion_publication(principal, thread, archive, &packet)?
        {
            return Ok(entry);
        }
        let parsed = DiscussionRecord::read(&packet)?;
        if thread != &parsed.link.id {
            return Err(Error::Contract("recovered discussion route differs"));
        }
        self.validate_discussion_link(&parsed)?;
        verify(self)?;
        let link = parsed.link;
        let sequence = self.log.append(Event::PublishRecoveredDiscussionV1 {
            principal: principal.into(),
            archive,
            packet: packet.clone(),
        })?;
        let entry = DiscussionEntry::new(link, sequence, &packet);
        self.discussions.insert(StoredDiscussion { entry: entry.clone(), archive, packet });
        Ok(entry)
    }

    pub(crate) fn check_recovered_discussion_publication(
        &self,
        principal: &str,
        thread: &ReviewThreadId,
        archive: [u8; 32],
        packet: &str,
    ) -> Result<Option<DiscussionEntry>> {
        self.recovery_inventory_owner(principal)?;
        if let Some(stored) = self.discussions.entries.get(thread) {
            if stored.archive != archive || stored.packet != packet {
                return Err(Error::Contract("recovered discussion attachment already exists"));
            }
            return Ok(Some(stored.entry.clone()));
        }
        self.discussions.check_capacity(packet.len())?;
        Ok(None)
    }

    pub(crate) fn recovered_discussion(
        &self,
        principal: &str,
        binding: &str,
        thread: &ReviewThreadId,
    ) -> Result<Option<DiscussionEntry>> {
        self.check_discussion_catalog(principal, binding)?;
        Ok(self.discussions.entries.get(thread).map(|stored| stored.entry.clone()))
    }

    pub(crate) fn recovered_discussion_packet(
        &self,
        principal: &str,
        binding: &str,
        thread: &ReviewThreadId,
    ) -> Result<Option<String>> {
        self.check_discussion_catalog(principal, binding)?;
        Ok(self.discussions.entries.get(thread).map(|stored| stored.packet.clone()))
    }

    pub(crate) fn check_discussion_catalog(&self, principal: &str, binding: &str) -> Result<()> {
        if self.review_descriptor(principal)?.binding != binding {
            return Err(Error::Contract("recovered discussion binding differs"));
        }
        Ok(())
    }
}
