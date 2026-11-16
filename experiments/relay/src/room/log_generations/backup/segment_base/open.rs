//! Select the exact paired artifacts and replay a suffix only after proving its predecessor.
use super::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity, archive_retirement::ArchiveRetirement,
};
use crate::{
    Error, Result, Room,
    archive_input::{ArchiveInput, CheckpointInput},
    log::{
        Log,
        generations::{SegmentArchiveOrigin, SelectedFile},
    },
    room::{
        SegmentCheckpointEncoding,
        asset_references::PacketRecord,
        materialized_checkpoint::{Checkpoint, Header, MAX_CHECKPOINT_BYTES, SelectedHeader},
    },
};
use sha2::{Digest, Sha256};
use std::{fs::File, io::BufReader, path::Path, sync::Arc};

pub(in crate::room::log_generations) fn segment_history_digest(
    parent: Option<&RelaySegmentBaseFile>,
    identity: &crate::RelaySegmentBaseIdentity,
) -> Result<[u8; 32]> {
    let mut hash = Sha256::new();
    hash.update(b"breditor/relay-segment-base/");
    if let Some(parent) = parent {
        hash.update(b"2\0");
        hash.update(parent.binding());
    } else {
        hash.update(b"1\0");
    }
    hash.update(serde_json::to_vec(identity)?);
    Ok(hash.finalize().into())
}

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
        let archive = ArchiveInput::new(archive, crate::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)?;
        let checkpoint = ArchiveInput::new(checkpoint, MAX_CHECKPOINT_BYTES as u64)?;
        Self::open_inputs(archive, CheckpointInput::raw(checkpoint), expected, parent)
    }

    pub(crate) fn open_inputs(
        archive: ArchiveInput,
        checkpoint: CheckpointInput,
        expected: &RelaySegmentBaseIdentity,
        parent: Option<Arc<Self>>,
    ) -> Result<Self> {
        Self::open_selected(Some(archive), checkpoint, expected, parent)
    }

    /// Reopen certified version-three history using its independently retained original
    /// identity. Keep the checkpoint immutable while it is in use.
    ///
    /// # Errors
    /// Refuses older checkpoints, changed bytes, a different parent or invalid closure.
    pub fn open_compacted_checkpoint(
        checkpoint: File,
        expected: &RelaySegmentBaseIdentity,
        parent: Option<Arc<Self>>,
    ) -> Result<Self> {
        let checkpoint = ArchiveInput::new(checkpoint, MAX_CHECKPOINT_BYTES as u64)?;
        Self::open_selected(None, CheckpointInput::raw(checkpoint), expected, parent)
    }

    pub(crate) fn open_selected(
        archive: Option<ArchiveInput>,
        checkpoint: CheckpointInput,
        expected: &RelaySegmentBaseIdentity,
        parent: Option<Arc<Self>>,
    ) -> Result<Self> {
        Self::open_storage(archive, checkpoint, None, expected, parent)
    }

    /// Only the portable reader can supply a supplemental range after checking its
    /// independently selected packed-file digest.
    #[cfg(feature = "server")]
    pub(crate) fn open_retired(
        checkpoint: CheckpointInput,
        retirement: ArchiveInput,
        expected: &RelaySegmentBaseIdentity,
        parent: Option<Arc<Self>>,
    ) -> Result<Self> {
        Self::open_storage(None, checkpoint, Some(retirement), expected, parent)
    }

    fn open_storage(
        archive: Option<ArchiveInput>,
        checkpoint: CheckpointInput,
        retirement: Option<ArchiveInput>,
        expected: &RelaySegmentBaseIdentity,
        parent: Option<Arc<Self>>,
    ) -> Result<Self> {
        if archive
            .as_ref()
            .is_some_and(|input| input.all().len() > crate::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)
            || checkpoint.len() > MAX_CHECKPOINT_BYTES as u64
        {
            return Err(Error::Contract("relay segment base input budget"));
        }
        if expected.predecessor.source != expected.checkpoint.source
            || expected.predecessor.manifest != expected.checkpoint.manifest
        {
            return Err(Error::Contract("relay segment base selections differ"));
        }
        if let Some(prior) = &parent {
            prior.check()?;
        }
        if checkpoint.len() == 0 || checkpoint.digest()? != expected.checkpoint.sha256 {
            return Err(Error::Contract("relay segment base checkpoint digest differs"));
        }
        let first = parent.as_ref().map_or(0, |base| base.identity.predecessor.source.records);
        let SelectedHeader { encoding, closure, .. } =
            read_header(&checkpoint, &expected.checkpoint, first)?;
        let binding = segment_history_digest(parent.as_deref(), expected)?;
        let closure = if let Some(input) = &retirement {
            if closure.is_some() || archive.is_some() {
                return Err(Error::Contract(
                    "relay archive retirement has competing representations",
                ));
            }
            Some(ArchiveRetirement::read(input, expected, binding, parent.as_deref())?.closure)
        } else {
            closure
        };
        let projected = closure
            .map(|proof| proof.select(&expected.predecessor, parent.as_deref()))
            .transpose()?;
        let (sections, root_generation) = if let Some(input) = &archive {
            let origin = parent.as_deref().map(|base| SegmentArchiveOrigin { base });
            let (sections, root) = super::super::disk::admit_generation_file(
                input.all(),
                &expected.predecessor,
                origin.as_ref(),
            )?;
            if let Some((projected_sections, projected_root)) = projected {
                let pairs = sections.iter().zip(&projected_sections);
                if root != projected_root
                    || sections.len() != projected_sections.len()
                    || pairs.into_iter().any(|((name, part), (pinned_name, pinned))| {
                        name != pinned_name
                            || part.bytes != pinned.bytes
                            || part.sha256 != pinned.sha256
                    })
                {
                    return Err(Error::Contract(
                        "relay checkpoint physical closure differs from archive",
                    ));
                }
            }
            (sections, root)
        } else {
            projected.ok_or(Error::Contract("relay checkpoint does not certify retired archive"))?
        };
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
        let result = Self {
            identity: expected.clone(),
            binding,
            root_generation,
            parent,
            archive,
            retirement,
            checkpoint,
            checkpoint_encoding: encoding,
            sections,
        };
        result.check()?;
        Ok(result)
    }

    /// Exact host selection for cold recovery.
    #[must_use]
    pub fn identity(&self) -> &RelaySegmentBaseIdentity {
        &self.identity
    }

    pub(crate) fn check(&self) -> Result<()> {
        let mut checked = None;
        for input in self.lineage().flat_map(|base| {
            base.archive
                .iter()
                .chain(&base.retirement)
                .chain(std::iter::once(&base.checkpoint.input))
        }) {
            if checked.is_some_and(|previous| input.shares_handle(previous)) {
                continue;
            }
            input.check()?;
            checked = Some(input);
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

    pub(crate) fn root_generation(&self) -> &str {
        &self.root_generation
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

    pub(crate) fn checkpoint_encoding(&self) -> SegmentCheckpointEncoding {
        self.checkpoint_encoding
    }

    pub(in crate::room) fn visit_asset_packets(
        &self,
        mut visit: impl FnMut(PacketRecord) -> Result<()>,
    ) -> Result<()> {
        self.check()?;
        let lineage = self.lineage().collect::<Vec<_>>();
        for base in lineage.into_iter().rev() {
            if let Some(input) = &base.retirement {
                let proof =
                    ArchiveRetirement::read(input, &base.identity, base.binding, base.parent())?;
                for packet in proof.history.into_records() {
                    visit(packet)?;
                }
            } else if base.checkpoint_encoding.has_asset_history() {
                let first =
                    base.parent().map_or(0, |base| base.identity.predecessor.source.records);
                let history = read_header(&base.checkpoint, &base.identity.checkpoint, first)?
                    .history
                    .ok_or(Error::Contract("relay checkpoint asset packet history missing"))?;
                for packet in history.into_records() {
                    visit(packet)?;
                }
            } else {
                base.visit_original_records(|record| {
                    if let Some(packet) = PacketRecord::from_log(record) {
                        visit(packet)?;
                    }
                    Ok(())
                })?;
            }
        }
        self.check()
    }

    pub(super) fn visit_original_records(
        &self,
        visit: impl FnMut(crate::log::Record) -> Result<()>,
    ) -> Result<()> {
        let input = self.archive.as_ref().ok_or(Error::NeedsRecovery)?.all();
        let files = self
            .sections
            .iter()
            .map(|(name, entry)| Ok((name.as_str(), input.section(entry.offset, entry.bytes)?)))
            .collect::<Result<_>>()?;
        let origin = self.parent().map(|base| SegmentArchiveOrigin { base });
        let cut =
            crate::log::generations::visit_generation_sections(&files, origin.as_ref(), visit)?;
        let predecessor = &self.identity.predecessor;
        if cut.manifest != predecessor.manifest
            || cut.records != predecessor.source.records
            || cut.previous != predecessor.source.terminal_log_digest
        {
            return Err(Error::Contract("relay segment predecessor record cut differs"));
        }
        Ok(())
    }

    pub(in crate::room::log_generations) fn checkpoint_state(&self) -> Result<Checkpoint> {
        self.check()?;
        let state: Checkpoint =
            self.checkpoint.visit(|reader| Ok(serde_json::from_reader(BufReader::new(reader))?))?;
        state.check_selection(&self.identity.checkpoint)?;
        self.check()?;
        Ok(state)
    }
}

fn read_header(
    checkpoint: &CheckpointInput,
    identity: &crate::RelayCheckpointIdentity,
    first: u64,
) -> Result<SelectedHeader> {
    let header: Header =
        checkpoint.visit(|reader| Ok(serde_json::from_reader(BufReader::new(reader))?))?;
    header.select(identity, first)
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
