//! Bounded positive snapshots for replaying one already-admitted live owner's retained prefix.
//! Fresh JSON recovery never reads this cache. A staged candidate writes its own copy,
//! and the trusted reader is removed before any new action can reuse counter-shaped keys.
use breditor_core::rich_content::RichDocument;
use loro::{LoroDoc, VersionVector};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::Arc,
};

const MAX_ENTRIES: usize = 256;
const MAX_CHARGED_BYTES: usize = 2 * 1024 * 1024;
const MAX_CLOCK_ITEMS: usize = 4096;
const ENTRY_CHARGE: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Key {
    state: Vec<(u64, i32)>,
    oplog: Vec<(u64, i32)>,
}
impl Key {
    fn from_doc(doc: &LoroDoc) -> Option<Self> {
        fn ordered(value: &VersionVector) -> Vec<(u64, i32)> {
            let mut entries: Vec<_> =
                value.iter().map(|(peer, counter)| (*peer, *counter)).collect();
            entries.sort_unstable();
            entries
        }
        if doc.get_pending_txn_len() != 0 || doc.is_detached() {
            return None;
        }
        let state = doc.state_vv();
        let oplog = doc.oplog_vv();
        if state.len().saturating_add(oplog.len()) > MAX_CLOCK_ITEMS {
            return None;
        }
        Some(Self { state: ordered(&state), oplog: ordered(&oplog) })
    }
    fn bytes(&self) -> usize {
        (self.state.len() + self.oplog.len()) * size_of::<(u64, i32)>() + ENTRY_CHARGE
    }
}

#[derive(Clone)]
pub(super) struct Projection {
    pub document: RichDocument,
    pub canonical: Arc<str>,
}
#[derive(Clone, Default)]
struct Store {
    entries: BTreeMap<Key, Projection>,
    order: VecDeque<Key>,
    bytes: usize,
}
impl Store {
    fn record(&mut self, key: Key, projection: Projection) {
        let charge = key.bytes().saturating_add(projection.canonical.len());
        if charge > MAX_CHARGED_BYTES {
            return;
        }
        if let Some(old) = self.entries.remove(&key) {
            self.bytes -= key.bytes() + old.canonical.len();
            self.order.retain(|value| value != &key);
        }
        while self.entries.len() >= MAX_ENTRIES || self.bytes + charge > MAX_CHARGED_BYTES {
            let Some(old_key) = self.order.pop_front() else {
                break;
            };
            if let Some(old) = self.entries.remove(&old_key) {
                self.bytes -= old_key.bytes() + old.canonical.len();
            }
        }
        self.bytes += charge;
        self.order.push_back(key.clone());
        self.entries.insert(key, projection);
    }
}

#[derive(Default)]
pub(super) struct ReplayProjections {
    store: Arc<Store>,
    source: Option<Arc<Store>>,
    #[cfg(test)]
    hits: usize,
}
impl ReplayProjections {
    /// Only the live owner's unchanged internal journal may receive this read capability.
    pub fn fork_for_replay(&self) -> Self {
        Self {
            store: Arc::clone(&self.store),
            source: Some(Arc::clone(&self.store)),
            #[cfg(test)]
            hits: 0,
        }
    }
    /// End lookup before returning a staged owner to new-input planning/admission.
    pub fn finish_replay(&mut self) {
        self.source = None;
    }
    pub fn find(&mut self, doc: &LoroDoc) -> Option<Projection> {
        let found = self.source.as_ref()?.entries.get(&Key::from_doc(doc)?).cloned();
        #[cfg(test)]
        if found.is_some() {
            self.hits += 1;
        }
        found
    }
    pub fn record(&mut self, doc: &LoroDoc, document: &RichDocument, canonical: &str) {
        if let Some(key) = Key::from_doc(doc) {
            let charge = key.bytes().saturating_add(canonical.len());
            if charge <= MAX_CHARGED_BYTES {
                Arc::make_mut(&mut self.store).record(
                    key,
                    Projection { document: document.clone(), canonical: canonical.into() },
                );
            }
        }
    }
    #[cfg(test)]
    pub fn replay_hits(&self) -> usize {
        self.hits
    }
    #[cfg(test)]
    pub fn has_source(&self) -> bool {
        self.source.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rich_replica::SharedRichProfile;
    use serde_json::{Value, json};
    type Result = std::result::Result<(), Box<dyn std::error::Error>>;

    fn projection() -> std::result::Result<Projection, Box<dyn std::error::Error>> {
        let profile = SharedRichProfile::from_configuration_json(
            &json!({
                "format":"breditor/shared-rich-profile", "formatVersion":1,
                "schema":{"name":"example/replay-cache", "version":1}, "extensions":[]
            })
            .to_string(),
        )?;
        let root: Value = serde_json::from_str(include_str!(
            "../../../breditor-core/tests/fixtures/rich-local-root.json"
        ))?;
        let json = json!({"format":"breditor/document", "formatVersion":2,
            "schema":{"name":"example/replay-cache", "version":1},
            "schemaFingerprint":profile.schema().fingerprint().to_string(), "root":root
        })
        .to_string();
        let owner = profile.create(&json, "101".into())?;
        Ok(Projection { document: owner.document.clone(), canonical: owner.canonical.into() })
    }

    #[test]
    fn only_a_live_replay_reader_can_look_up_prior_versions() -> Result {
        let doc = LoroDoc::new();
        doc.set_peer_id(101)?;
        doc.get_text("p").insert(0, "A")?;
        doc.commit();
        let value = projection()?;
        let mut cache = ReplayProjections::default();
        cache.record(&doc, &value.document, &value.canonical);
        assert!(cache.find(&doc).is_none());
        let mut replay = cache.fork_for_replay();
        assert_eq!(replay.find(&doc).unwrap().canonical, value.canonical);
        assert_eq!(replay.replay_hits(), 1);
        replay.finish_replay();
        assert!(!replay.has_source());
        assert!(replay.find(&doc).is_none());
        // A different payload with the same peer/counter is not a global content identity.
        let other = LoroDoc::new();
        other.set_peer_id(101)?;
        other.get_text("p").insert(0, "B")?;
        other.commit();
        assert_eq!(Key::from_doc(&doc), Key::from_doc(&other));
        assert!(replay.find(&other).is_none());
        Ok(())
    }

    #[test]
    fn candidate_writes_cannot_mutate_a_live_owner_or_its_replay_source() -> Result {
        let doc = LoroDoc::new();
        doc.set_peer_id(101)?;
        let value = projection()?;
        let mut cache = ReplayProjections::default();
        cache.record(&doc, &value.document, &value.canonical);
        let original = Arc::clone(&cache.store);
        let mut replay = cache.fork_for_replay();
        doc.get_text("p").insert(0, "A")?;
        doc.commit();
        replay.record(&doc, &value.document, &value.canonical);
        assert!(Arc::ptr_eq(&original, &cache.store));
        assert!(!Arc::ptr_eq(&cache.store, &replay.store));
        assert_eq!(cache.store.entries.len(), 1);
        assert_eq!(replay.store.entries.len(), 2);
        assert!(replay.find(&doc).is_none());
        drop(replay);
        assert_eq!(cache.store.entries.len(), 1);
        Ok(())
    }

    #[test]
    fn retained_entries_and_charged_bytes_are_bounded_with_soft_oversize_misses() -> Result {
        let doc = LoroDoc::new();
        doc.set_peer_id(101)?;
        let value = projection()?;
        let mut cache = ReplayProjections::default();
        let first = Key::from_doc(&doc).unwrap();
        for index in 0..=MAX_ENTRIES {
            cache.record(&doc, &value.document, &value.canonical);
            doc.get_text("p").insert(index, "A")?;
            doc.commit();
        }
        assert_eq!(cache.store.entries.len(), MAX_ENTRIES);
        assert!(!cache.store.entries.contains_key(&first));
        let large = "x".repeat(MAX_CHARGED_BYTES / 2);
        cache.record(&doc, &value.document, &large);
        doc.get_text("p").insert(MAX_ENTRIES + 1, "A")?;
        doc.commit();
        cache.record(&doc, &value.document, &large);
        assert!(cache.store.bytes <= MAX_CHARGED_BYTES);
        assert_eq!(cache.store.entries.len(), 1);
        let before = Arc::clone(&cache.store);
        cache.record(&doc, &value.document, &"x".repeat(MAX_CHARGED_BYTES));
        assert!(Arc::ptr_eq(&before, &cache.store));
        assert_eq!(cache.store.entries.len(), 1);
        let key = Key::from_doc(&doc).unwrap();
        cache.record(&doc, &value.document, &value.canonical);
        assert_eq!(cache.store.entries.len(), 1);
        assert_eq!(cache.store.order.len(), 1);
        assert_eq!(cache.store.bytes, key.bytes() + value.canonical.len());
        Ok(())
    }

    #[test]
    fn pending_detached_and_overlong_clocks_are_soft_cache_misses() -> Result {
        let doc = LoroDoc::new();
        doc.set_peer_id(101)?;
        let empty = doc.state_frontiers();
        let value = projection()?;
        let mut cache = ReplayProjections::default();
        doc.get_text("p").insert(0, "A")?;
        cache.record(&doc, &value.document, &value.canonical);
        assert!(cache.store.entries.is_empty());
        doc.commit();
        cache.record(&doc, &value.document, &value.canonical);
        assert_eq!(cache.store.entries.len(), 1);
        doc.checkout(&empty)?;
        assert!(Key::from_doc(&doc).is_none());
        cache.record(&doc, &value.document, &value.canonical);
        assert_eq!(cache.store.entries.len(), 1);
        doc.attach();
        for peer in 1..=MAX_CLOCK_ITEMS / 2 {
            doc.set_peer_id(peer as u64 + 200)?;
            doc.get_text("p").insert(0, "A")?;
            doc.commit();
        }
        assert!(doc.state_vv().len() + doc.oplog_vv().len() > MAX_CLOCK_ITEMS);
        assert!(Key::from_doc(&doc).is_none());
        cache.record(&doc, &value.document, &value.canonical);
        assert_eq!(cache.store.entries.len(), 1);
        Ok(())
    }
}
