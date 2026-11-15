//! Frozen bounded metadata paging and authenticated immutable packet retrieval.
use super::{DocumentVersionCatalogPage, DocumentVersionsCursor, MAX_PAGE_ENTRIES, Room};
use crate::{Error, Result};
impl Room {
    fn version_sequence(&self, value: &str) -> Result<u64> {
        let state = self.versions_state()?;
        let sequence =
            value.parse::<u64>().map_err(|_| Error::Contract("version catalog cursor"))?;
        if sequence.to_string() != value
            || sequence != state.enabled_at && !state.order.contains_key(&sequence)
        {
            return Err(Error::Contract("version catalog unaccepted cursor sequence"));
        }
        Ok(sequence)
    }
    #[cfg(feature = "server")]
    pub(in crate::room) fn recovery_version_entry(
        &self,
        id: &str,
    ) -> Result<Option<serde_json::Value>> {
        self.versions_state()?
            .entries
            .get(id)
            .map(|row| serde_json::to_value(&row.entry))
            .transpose()
            .map_err(Into::into)
    }

    #[cfg(feature = "server")]
    pub(in crate::room) fn check_recovery_version_catalog(
        &self,
        through: &str,
        entries: &[serde_json::Value],
    ) -> Result<()> {
        let through = self.version_sequence(through)?;
        let state = self.versions_state()?;
        let mut rows = state.order.range(..=through).map(|(_, id)| id);
        for expected in entries {
            let id = rows
                .next()
                .ok_or(Error::Contract("client delivery catalog snapshot extent differs"))?;
            let actual = state.entries.get(id).ok_or(Error::NeedsRecovery)?;
            if serde_json::to_value(&actual.entry)? != *expected {
                return Err(Error::Contract("client delivery catalog snapshot differs"));
            }
        }
        if rows.next().is_some() {
            return Err(Error::Contract("client delivery catalog snapshot extent differs"));
        }
        Ok(())
    }

    /// List at most 64 metadata entries under a frozen terminal acceptance. New later publications
    /// appear only on the next refresh, not unexpectedly inside a partially consumed interval.
    /// # Errors
    /// Rejects denied readers, disabled catalogs, wrong log bindings and noncanonical/invalid cuts.
    pub fn document_versions_page(
        &self,
        principal: &str,
        cursor: Option<&DocumentVersionsCursor>,
    ) -> Result<DocumentVersionCatalogPage> {
        let descriptor = self.document_versions_descriptor(principal)?;
        let state = self.versions_state()?;
        let (after, through) = if let Some(cursor) = cursor {
            if cursor.binding != state.binding {
                return Err(Error::Contract("version catalog cursor binding"));
            }
            (self.version_sequence(&cursor.after)?, self.version_sequence(&cursor.through)?)
        } else {
            (state.enabled_at, state.order.keys().next_back().copied().unwrap_or(state.enabled_at))
        };
        if after > through {
            return Err(Error::Contract("version catalog inverted cursor interval"));
        }
        let mut page = DocumentVersionCatalogPage {
            descriptor,
            entries: vec![],
            cursor: DocumentVersionsCursor {
                binding: state.binding.clone(),
                after: after.to_string(),
                through: through.to_string(),
            },
            more: false,
        };
        for (sequence, id) in state
            .order
            .range((std::ops::Bound::Excluded(after), std::ops::Bound::Included(through)))
        {
            if page.entries.len() == MAX_PAGE_ENTRIES {
                page.more = true;
                break;
            }
            let entry = &state.entries.get(id).ok_or(Error::NeedsRecovery)?.entry;
            page.entries.push(entry.clone());
            page.cursor.after = sequence.to_string();
        }
        Ok(page)
    }
    /// Return the first accepted exact packet for a content-addressed ID. A digest is not a read
    /// capability; current account read permission is checked even when the packet is already known.
    /// # Errors
    /// Rejects denied readers, wrong ID spelling, disabled catalogs and unavailable storage.
    pub fn document_version_packet(&self, principal: &str, id: &str) -> Result<Option<String>> {
        self.reader(principal)?;
        let state = self.versions_state()?;
        if id.len() != 71
            || !id.starts_with("sha256:")
            || !id.as_bytes()[7..].iter().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
        {
            return Err(Error::Contract("version packet identity"));
        }
        Ok(state.entries.get(id).map(|saved| saved.packet.clone()))
    }
}
