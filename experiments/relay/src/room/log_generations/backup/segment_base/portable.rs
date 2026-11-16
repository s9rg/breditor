//! Reuse exact admitted ancestor bytes when producing an independent portable copy.
use super::RelaySegmentBaseFile;
use crate::{
    Error, Result, Room,
    archive_input::{ArchiveInput, CheckpointInput},
    log::generations::GenerationFileWitness,
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
    pub(crate) const CHECKPOINT_LIMIT: u64 =
        crate::room::materialized_checkpoint::MAX_CHECKPOINT_BYTES as u64;
    pub(crate) fn stored_inputs(&self) -> Result<(Option<&ArchiveInput>, &CheckpointInput)> {
        Ok((self.archive.as_ref(), &self.stored_checkpoint()?.input))
    }

    pub(crate) fn write_original_pair(
        &self,
        archive: &mut impl Write,
        checkpoint: &mut impl Write,
    ) -> Result<()> {
        write_original(self.original_archive()?, archive)?;
        self.stored_checkpoint()?.input.write_to(checkpoint)
    }

    pub(crate) fn check_named_pair(
        &self,
        archive: (&GenerationFileWitness, &Path),
        checkpoint: (&GenerationFileWitness, &Path),
    ) -> Result<()> {
        self.original_archive()?.check_named(archive.0, archive.1)?;
        self.stored_checkpoint()?.input.input.check_named(checkpoint.0, checkpoint.1)
    }

    fn original_archive(&self) -> Result<&ArchiveInput> {
        self.archive.as_ref().ok_or(Error::Contract("relay predecessor archive has been compacted"))
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
