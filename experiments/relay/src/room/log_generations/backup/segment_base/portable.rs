//! Reuse exact admitted ancestor bytes when producing an independent portable copy.
use super::RelaySegmentBaseFile;
use crate::{
    Error, Result, Room, archive_input::ArchiveInput, log::generations::GenerationFileWitness,
};
use std::{
    io::{self, Write},
    path::Path,
    sync::Arc,
};

impl Room {
    pub(crate) fn hold_relay_segment_parent(&self) -> Option<Arc<RelaySegmentBaseFile>> {
        self.log.hold_segment_base()
    }
}

impl RelaySegmentBaseFile {
    pub(crate) const PACKED_PAIR_LIMIT: u64 = crate::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES
        + crate::room::materialized_checkpoint::MAX_CHECKPOINT_BYTES as u64;

    pub(crate) fn write_framed_pair(&self, output: &mut impl Write) -> Result<()> {
        output.write_all(&self.archive.all().len().to_be_bytes())?;
        output.write_all(&self.checkpoint.all().len().to_be_bytes())?;
        write_original(&self.archive, output)?;
        write_original(&self.checkpoint, output)
    }

    pub(crate) fn write_original_pair(
        &self,
        archive: &mut impl Write,
        checkpoint: &mut impl Write,
    ) -> Result<()> {
        write_original(&self.archive, archive)?;
        write_original(&self.checkpoint, checkpoint)
    }

    pub(crate) fn check_named_pair(
        &self,
        archive: (&GenerationFileWitness, &Path),
        checkpoint: (&GenerationFileWitness, &Path),
    ) -> Result<()> {
        self.archive.check_named(archive.0, archive.1)?;
        self.checkpoint.check_named(checkpoint.0, checkpoint.1)
    }
}

fn write_original(input: &ArchiveInput, output: &mut impl Write) -> Result<()> {
    input.check()?;
    let source = input.all();
    if io::copy(&mut source.reader(), output)? != source.len() {
        return Err(Error::Contract("relay segment predecessor copy was truncated"));
    }
    input.check()
}
