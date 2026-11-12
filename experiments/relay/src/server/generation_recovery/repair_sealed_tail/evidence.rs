//! Actual independently retained files remain locked and checked through the repair.
use super::super::repair_evidence_file::RetainedRepairFile;
use super::SealedNativeTailRepairFiles;
use crate::{
    Error, Result, ServerLogGenerationRoomBackupInfo, log::MAX_GENERATION_INCOMPLETE_FRAME_BYTES,
};
use sha2::{Digest, Sha256};
use std::path::Path;

const OUTSIDE: &str = "native tail evidence must be outside the operating directory";

pub(super) struct RetainedEvidence {
    archive: RetainedRepairFile,
    tail: RetainedRepairFile,
    pub(super) suffix: Vec<u8>,
}

impl RetainedEvidence {
    pub(super) fn open(
        input: &SealedNativeTailRepairFiles,
        operating_directory: &Path,
    ) -> Result<Self> {
        if !(1..=MAX_GENERATION_INCOMPLETE_FRAME_BYTES).contains(&input.incomplete_bytes) {
            return Err(Error::Contract("native tail evidence byte budget"));
        }
        let operating_directory = operating_directory.canonicalize()?;
        let archive = RetainedRepairFile::open(&input.archive, &operating_directory, OUTSIDE)?;
        let tail = RetainedRepairFile::open(&input.suffix, &operating_directory, OUTSIDE)?;
        let suffix = tail.read(input.incomplete_bytes)?;
        if suffix.len() as u64 != input.incomplete_bytes
            || <[u8; 32]>::from(Sha256::digest(&suffix)) != input.incomplete_sha256
        {
            return Err(Error::Contract(
                "native tail evidence differs from the retained suffix pin",
            ));
        }
        Ok(Self { archive, tail, suffix })
    }

    pub(super) fn verify_and_sync(
        &self,
        complete: &ServerLogGenerationRoomBackupInfo,
    ) -> Result<()> {
        self.guard()?;
        if self.archive.digest(complete.bytes)? != complete.identity.archive_sha256 {
            return Err(Error::Contract(
                "native tail evidence archive differs from the inspected cut",
            ));
        }
        self.archive.sync()?;
        self.tail.sync()?;
        self.guard()
    }

    pub(super) fn guard(&self) -> Result<()> {
        self.archive.guard()?;
        self.tail.guard()
    }
}
