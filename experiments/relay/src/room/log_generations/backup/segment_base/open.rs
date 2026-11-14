//! Select the exact paired artifacts and replay a suffix only after proving its predecessor.
use super::{RelaySegmentBaseFile, RelaySegmentBaseIdentity};
use crate::{
    Error, Result, Room,
    archive_input::ArchiveInput,
    log::{Log, generations::SelectedFile},
    room::materialized_checkpoint::{Checkpoint, Header, MAX_CHECKPOINT_BYTES},
};
use std::{fs::File, io::BufReader, path::Path};

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
        if expected.predecessor.source != expected.checkpoint.source
            || expected.predecessor.manifest != expected.checkpoint.manifest
        {
            return Err(Error::Contract("relay segment base selections differ"));
        }
        let archive = ArchiveInput::new(archive, crate::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)?;
        let sections = super::super::disk::admit_native_file(archive.all(), &expected.predecessor)?;
        let checkpoint = ArchiveInput::new(checkpoint, MAX_CHECKPOINT_BYTES as u64)?;
        let result = Self { identity: expected.clone(), archive, checkpoint, sections };
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

    fn check(&self) -> Result<()> {
        self.archive.check()?;
        self.checkpoint.check()
    }

    fn checkpoint_state(&self) -> Result<Checkpoint> {
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
        let sections = base
            .sections
            .iter()
            .map(|(name, entry)| {
                (name.as_str(), SelectedFile::Digest { bytes: entry.bytes, sha256: entry.sha256 })
            })
            .collect();
        if !log.verify_generation_archive(&sections, selected.manifest, true)? {
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
