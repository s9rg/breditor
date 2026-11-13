//! Immutable native replay prefix plus one append-only active generation. No CRDT history is pruned.
use super::super::{
    RichReplica,
    general_history::ReplayCapabilities,
    session::{Entry, Journal, MAX_ENTRIES, publication},
    ui_state::UiState,
};
use super::{
    binding::Family,
    encoding::{
        CONTINUED_ARCHIVE_BYTES, CONTINUED_GENERATIONS, CONTINUED_UNDO_ITEMS, MAX_ARCHIVE_BYTES,
        MAX_GENERATIONS, digest, quoted_bytes,
    },
    segment::{FORMAT, Sealed, Segment},
};
use crate::Error;
use std::{collections::BTreeSet, sync::Arc};

pub(super) struct Root {
    pub generation: String,
    pub json: Arc<str>,
    pub sha256: String,
    pub quoted_bytes: usize,
    pub family: Family,
    pub journal: Journal,
    pub joins: Option<Vec<u32>>,
}
impl Root {
    pub fn capture(owner: &RichReplica, generation: String) -> Result<Self, Error> {
        crate::identity::validate_id(&generation)?;
        let family = Family::of(owner);
        let json: Arc<str> = family.checkpoint(owner)?.into();
        let sha256 = digest(&json);
        let quoted_bytes = quoted_bytes(&json)?;
        Ok(Self {
            generation,
            json,
            sha256,
            quoted_bytes,
            family,
            journal: owner.journal.clone(),
            joins: owner.typing.as_ref().map(|h| h.joins.clone()),
        })
    }
}

#[derive(Clone)]
pub(in crate::rich_replica) struct SegmentedHistory {
    pub(super) root: Arc<Root>,
    pub(super) sealed: Vec<Arc<Sealed>>,
    pub(super) active_generation: String,
    pub(in crate::rich_replica) continuation: Option<usize>,
}
impl SegmentedHistory {
    pub(super) fn new(root: Root, active_generation: String) -> Result<Self, Error> {
        crate::identity::validate_id(&active_generation)?;
        if root.generation == active_generation {
            return Err(Error::Contract("segmented generation identity reused"));
        }
        Ok(Self { root: Arc::new(root), sealed: Vec::new(), active_generation, continuation: None })
    }
    pub(super) fn max_generations(&self) -> usize {
        if self.continuation.is_some() { CONTINUED_GENERATIONS } else { MAX_GENERATIONS }
    }
    pub(super) fn max_archive_bytes(&self) -> usize {
        if self.continuation.is_some() { CONTINUED_ARCHIVE_BYTES } else { MAX_ARCHIVE_BYTES }
    }
    pub(in crate::rich_replica) fn undo_limit(&self) -> usize {
        if self.continuation.is_some() { CONTINUED_UNDO_ITEMS } else { MAX_ENTRIES }
    }
    pub(in crate::rich_replica) fn continuation_entry(&self) -> Option<usize> {
        self.continuation.map(|boundary| {
            self.root.journal.entries.len()
                + self.sealed[..boundary]
                    .iter()
                    .map(|file| file.record.entries.len())
                    .sum::<usize>()
        })
    }
    pub(super) fn check_legacy_checkpoint(&self, boundary: usize) -> Result<(), Error> {
        if boundary == 0 || boundary >= MAX_GENERATIONS || boundary > self.sealed.len() {
            return Err(Error::Contract("invalid native history continuation boundary"));
        }
        let (active, sealed) = self.sealed[..boundary].split_last().ok_or(Error::ReplayMismatch)?;
        let predecessor = Self {
            root: Arc::clone(&self.root),
            sealed: sealed.to_vec(),
            active_generation: active.record.generation.clone(),
            continuation: None,
        };
        super::archive::check_size(&predecessor, &active.json, MAX_ARCHIVE_BYTES)
    }
    pub(super) fn start(&self) -> usize {
        self.root.journal.entries.len()
            + self.sealed.iter().map(|s| s.record.entries.len()).sum::<usize>()
    }
    pub(super) fn parent(&self) -> (&str, &str) {
        self.sealed.last().map_or((&self.root.generation, &self.root.sha256), |s| {
            (&s.record.generation, &s.sha256)
        })
    }
    pub(in crate::rich_replica) fn boundary_ui(&self, entry: usize) -> Option<UiState> {
        let mut at = self.root.journal.entries.len();
        let mut boundary = (at == entry).then(|| self.root.journal.ui.clone());
        for segment in &self.sealed {
            at += segment.record.entries.len();
            if at == entry {
                boundary = Some(segment.record.ui.clone());
            }
        }
        boundary
    }
    pub(in crate::rich_replica) fn validate_journal(
        &self,
        journal: &Journal,
        joins: Option<&[u32]>,
        capabilities: ReplayCapabilities,
    ) -> Result<(), Error> {
        if Family::selected(capabilities, joins.is_some()) != self.root.family {
            return Err(Error::Contract("segmented replay family changed"));
        }
        let root = &self.root.journal;
        if journal.format != root.format
            || journal.version != root.version
            || journal.document != root.document
            || journal.writer() != root.writer()
            || serde_json::to_vec(&journal.origin)? != serde_json::to_vec(&root.origin)?
        {
            return Err(Error::Contract("segmented original native identity changed"));
        }
        if self.sealed.len() + 2 > self.max_generations()
            || self.continuation.is_some_and(|boundary| {
                boundary == 0 || boundary >= MAX_GENERATIONS || boundary > self.sealed.len()
            })
            || journal.entries.len() < self.start()
            || journal.entries.len() - self.start() > MAX_ENTRIES
        {
            return Err(Error::Limit("segmented history generations or active entries"));
        }
        let mut ids = BTreeSet::from([self.root.generation.as_str()]);
        let (mut at, mut parent, mut hash, mut prior_publication) = (
            root.entries.len(),
            self.root.generation.as_str(),
            self.root.sha256.as_str(),
            publication(&root.publication)?,
        );
        let mut retained_joins = self.root.joins.clone().unwrap_or_default();
        for (index, segment) in self.sealed.iter().enumerate() {
            let r = &segment.record;
            crate::identity::validate_id(&r.generation)?;
            if !ids.insert(&r.generation)
                || r.parent_generation != parent
                || r.parent_sha256 != hash
                || usize::try_from(r.start).ok() != Some(at)
                || r.entries.is_empty() && self.continuation != Some(index + 1)
                || r.entries.len() > MAX_ENTRIES
                || r.joins.len() > MAX_ENTRIES
                || r.joins.iter().any(|i| {
                    usize::try_from(*i).is_ok_and(|i| i <= at || i >= at + r.entries.len())
                })
                || publication(&r.publication)? <= prior_publication
            {
                return Err(Error::Contract("segmented sealed native prefix differs"));
            }
            at += r.entries.len();
            parent = &r.generation;
            hash = &segment.sha256;
            prior_publication = publication(&r.publication)?;
            retained_joins.extend_from_slice(&r.joins);
        }
        crate::identity::validate_id(&self.active_generation)?;
        if ids.contains(self.active_generation.as_str())
            || publication(&journal.publication)? <= prior_publication
        {
            return Err(Error::Contract("segmented active generation or publication differs"));
        }
        let prefix =
            root.entries.iter().chain(self.sealed.iter().flat_map(|s| s.record.entries.iter()));
        for (before, actual) in prefix.zip(&journal.entries) {
            if serde_json::to_vec(before)? != serde_json::to_vec(actual)? {
                return Err(Error::Contract("segmented retained native entry changed"));
            }
        }
        let actual_joins = joins.unwrap_or_default();
        let old =
            actual_joins.iter().copied().take_while(|i| usize::try_from(*i).is_ok_and(|i| i < at));
        if !old.eq(retained_joins)
            || actual_joins.iter().filter(|i| usize::try_from(**i).is_ok_and(|i| i >= at)).count()
                > MAX_ENTRIES
            || actual_joins.iter().any(|i| usize::try_from(*i).ok() == Some(at))
        {
            return Err(Error::Contract("segmented typing boundary or retained partition differs"));
        }
        Ok(())
    }
    pub(super) fn active_ref<'a>(
        &self,
        owner: &'a RichReplica,
    ) -> Result<Segment<&'a [Entry]>, Error> {
        self.validate_journal(
            &owner.journal,
            owner.typing.as_ref().map(|h| h.joins.as_slice()),
            owner.replay_capabilities(),
        )?;
        let start = self.start();
        let (parent, hash) = self.parent();
        Ok(Segment {
            format: FORMAT.into(),
            format_version: 1,
            generation: self.active_generation.clone(),
            parent_generation: parent.into(),
            parent_sha256: hash.into(),
            start: u32::try_from(start).map_err(|_| Error::Limit("segmented entry coordinate"))?,
            entries: &owner.journal.entries[start..],
            joins: owner.typing.as_ref().map_or_else(Vec::new, |h| {
                h.joins
                    .iter()
                    .copied()
                    .filter(|i| usize::try_from(*i).is_ok_and(|i| i >= start))
                    .collect()
            }),
            ui: owner.journal.ui.clone(),
            publication: owner.journal.publication.clone(),
        })
    }
    pub(super) fn active(&self, owner: &RichReplica) -> Result<Segment, Error> {
        let record = self.active_ref(owner)?;
        Ok(Segment {
            format: record.format,
            format_version: record.format_version,
            generation: record.generation,
            parent_generation: record.parent_generation,
            parent_sha256: record.parent_sha256,
            start: record.start,
            entries: record.entries.to_vec(),
            joins: record.joins,
            ui: record.ui,
            publication: record.publication,
        })
    }
    pub(super) fn seal(&self, owner: &RichReplica, next: String) -> Result<Self, Error> {
        self.seal_for(owner, next, self.continuation)
    }
    pub(super) fn seal_for(
        &self,
        owner: &RichReplica,
        next: String,
        continuation: Option<usize>,
    ) -> Result<Self, Error> {
        crate::identity::validate_id(&next)?;
        let mut next_state = self.clone();
        next_state.continuation = continuation;
        if self.sealed.len() + 3 > next_state.max_generations() {
            return Err(Error::Limit("segmented history generations"));
        }
        if next == self.root.generation
            || next == self.active_generation
            || self.sealed.iter().any(|s| s.record.generation == next)
        {
            return Err(Error::Contract("segmented generation identity reused"));
        }
        let record = self.active(owner)?;
        if record.entries.is_empty() && self.continuation == continuation {
            return Err(Error::Contract("cannot seal an empty history segment"));
        }
        next_state.sealed.push(Arc::new(Sealed::from_record(record)?));
        next_state.active_generation = next;
        Ok(next_state)
    }
}
