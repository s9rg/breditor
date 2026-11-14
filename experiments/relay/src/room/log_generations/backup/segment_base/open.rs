//! Select the exact paired artifacts and replay a suffix only after proving its predecessor.
use super::{RelaySegmentBaseFile, RelaySegmentBaseIdentity};
use crate::{
    Error, Result, Room,
    archive_input::ArchiveInput,
    log::{
        Log,
        generations::{SegmentArchiveOrigin, SelectedFile},
    },
    room::materialized_checkpoint::{Checkpoint, Header, MAX_CHECKPOINT_BYTES},
};
use sha2::{Digest, Sha256};
use std::{fs::File, io::BufReader, path::Path, sync::Arc};

impl RelaySegmentBaseFile {
    /// Verify the complete predecessor archive and checkpoint bytes against an independently
    /// selected identity. Keep both held inodes immutable for as long as the base is in use.
    ///
    /// # Errors
    /// Rejects mismatched cuts, changed or invalid files and unavailable input.
    pub fn open(
        archive: File,
        checkpoint: File,
        expected: &RelaySegmentBaseIdentity,
    ) -> Result<Self> {
        Self::open_archive(archive, checkpoint, expected, None)
    }

    /// Admit a bounded suffix archive and its checkpoint over an independently held parent.
    /// Keep every part of the chain and its trusted identity available for cold recovery.
    ///
    /// # Errors
    /// Refuses substituted bytes, skipped parents, duplicate WAL IDs and incompatible room cuts.
    pub fn open_linked(
        archive: File,
        checkpoint: File,
        expected: &RelaySegmentBaseIdentity,
        parent: Arc<Self>,
    ) -> Result<Self> {
        Self::open_archive(archive, checkpoint, expected, Some(parent))
    }

    fn open_archive(
        archive: File,
        checkpoint: File,
        expected: &RelaySegmentBaseIdentity,
        parent: Option<Arc<Self>>,
    ) -> Result<Self> {
        if expected.predecessor.source != expected.checkpoint.source
            || expected.predecessor.manifest != expected.checkpoint.manifest
        {
            return Err(Error::Contract("relay segment base selections differ"));
        }
        if let Some(prior) = &parent {
            prior.check()?;
        }
        let archive = ArchiveInput::new(archive, crate::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)?;
        let origin = parent.as_deref().map(|base| SegmentArchiveOrigin { base });
        let sections = super::super::disk::admit_generation_file(
            archive.all(),
            &expected.predecessor,
            origin.as_ref(),
        )?;
        if let Some(prior) = &parent {
            let old = &prior.identity.predecessor.source;
            let mut ancestor = expected.predecessor.source.clone();
            ancestor.records = old.records;
            ancestor.terminal_log_digest = old.terminal_log_digest;
            if &ancestor != old || expected.predecessor.source.records < old.records {
                return Err(Error::Contract("relay segment archive parent room differs"));
            }
            for name in sections.keys().filter(|name| name.starts_with("g-")) {
                if prior.contains_section(name) {
                    return Err(Error::Contract("relay segment reuses a predecessor generation"));
                }
            }
        }
        let checkpoint = ArchiveInput::new(checkpoint, MAX_CHECKPOINT_BYTES as u64)?;
        let mut hash = Sha256::new();
        // The first handoff keeps its original binding bytes.
        if let Some(prior) = &parent {
            hash.update(b"breditor/relay-segment-base/2\0");
            hash.update(prior.binding());
        } else {
            hash.update(b"breditor/relay-segment-base/1\0");
        }
        hash.update(serde_json::to_vec(expected)?);
        let result = Self {
            identity: expected.clone(),
            binding: hash.finalize().into(),
            parent,
            archive,
            checkpoint,
            sections,
        };
        let input = result.checkpoint.all();
        if input.len() == 0 || input.digest()? != expected.checkpoint.sha256 {
            return Err(Error::Contract("relay segment base checkpoint digest differs"));
        }
        let header: Header = serde_json::from_reader(BufReader::new(input.reader()))?;
        header.check_selection(&expected.checkpoint)?;
        result.check()?;
        Ok(result)
    }

    /// Exact host selection for cold recovery.
    #[must_use]
    pub fn identity(&self) -> &RelaySegmentBaseIdentity {
        &self.identity
    }

    pub(crate) fn check(&self) -> Result<()> {
        for base in self.lineage() {
            base.archive.check()?;
            base.checkpoint.check()?;
        }
        Ok(())
    }

    fn lineage(&self) -> impl Iterator<Item = &Self> {
        std::iter::successors(Some(self), |base| base.parent())
    }

    pub(crate) fn parent(&self) -> Option<&Self> {
        self.parent.as_deref()
    }

    pub(crate) fn contains_section(&self, name: &str) -> bool {
        self.lineage().any(|base| base.sections.contains_key(name))
    }

    pub(crate) fn binding(&self) -> [u8; 32] {
        self.binding
    }

    pub(super) fn selections(&self) -> std::collections::BTreeMap<&str, SelectedFile<'_>> {
        self.sections
            .iter()
            .map(|(name, entry)| {
                (name.as_str(), SelectedFile::Digest { bytes: entry.bytes, sha256: entry.sha256 })
            })
            .collect()
    }

    pub(crate) fn visit_records(
        &self,
        mut visit: impl FnMut(crate::log::Record) -> Result<()>,
    ) -> Result<()> {
        self.check()?;
        let lineage = self.lineage().collect::<Vec<_>>();
        for base in lineage.into_iter().rev() {
            let input = base.archive.all();
            let files = base
                .sections
                .iter()
                .map(|(name, entry)| Ok((name.as_str(), input.section(entry.offset, entry.bytes)?)))
                .collect::<Result<_>>()?;
            let origin = base.parent().map(|base| SegmentArchiveOrigin { base });
            let cut = crate::log::generations::visit_generation_sections(
                &files,
                origin.as_ref(),
                &mut visit,
            )?;
            let predecessor = &base.identity.predecessor;
            if cut.manifest != predecessor.manifest
                || cut.records != predecessor.source.records
                || cut.previous != predecessor.source.terminal_log_digest
            {
                return Err(Error::Contract("relay segment predecessor record cut differs"));
            }
        }
        self.check()
    }

    pub(super) fn checkpoint_state(&self) -> Result<Checkpoint> {
        self.check()?;
        let input = self.checkpoint.all();
        let state: Checkpoint = serde_json::from_reader(BufReader::new(input.reader()))?;
        state.check_selection(&self.identity.checkpoint)?;
        self.check()?;
        Ok(state)
    }
}

impl Room {
    /// Recover a complete selected generation room from a verified base, then replay later
    /// records in their original absolute order. The base can end inside a WAL that was
    /// subsequently sealed or appended to. Clients authenticate again using their old credentials.
    ///
    /// # Errors
    /// Refuses missing or changed predecessors, pending rotation, incomplete tail and native
    /// replay errors. Leave an incomplete tail for the explicit recovery path.
    pub fn open_log_generations_with_segment_base(
        path: &Path,
        base: &RelaySegmentBaseFile,
    ) -> Result<Self> {
        let state = base.checkpoint_state()?;
        let (mut log, recovery) = Log::open_generations(path)?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("relay segment base requires a complete suffix"));
        }
        let selected = &base.identity.checkpoint;
        if !log.verify_generation_archive(&base.selections(), selected.manifest, true)? {
            return Err(Error::Contract("relay segment base is outside the selected WAL lineage"));
        }
        let replay = log.open_generation_replay()?;
        let mut room = state.restore(log, selected)?;
        replay
            .visit_after_verified_prefix(selected.source.records, |record| room.replay(record))?;
        room.log.check_generation_replay()?;
        base.check()?;
        room.abandon_suggestion_revision_preparation();
        Ok(room.finish_replay(recovery, false)?.0)
    }
}
