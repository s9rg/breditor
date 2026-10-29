//! Private regular immutable files, exact inode and bounded streaming/readback checks.
use crate::{
    Error, Result,
    log::generations::{GenerationFileStamp, GenerationFileWitness},
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io::{Read, Seek, SeekFrom},
    path::Path,
};
pub(super) const MAX_INTENT: u64 = 128 * 1024;
pub(super) fn open(path: &Path) -> Result<File> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(Error::Contract("handover regular file required"));
    }
    let file = OpenOptions::new().read(true).write(true).open(path)?;
    file.try_lock().map_err(|e| match e {
        TryLockError::WouldBlock => Error::Locked,
        TryLockError::Error(e) => Error::Io(e),
    })?;
    GenerationFileWitness::of(&file)?.guard(&file, path)?;
    Ok(file)
}
pub(super) fn read(file: &File, path: &Path, limit: u64) -> Result<Vec<u8>> {
    let witness = GenerationFileWitness::of(file)?;
    let stamp = GenerationFileStamp::of(file)?;
    witness.guard(file, path)?;
    let length = file.metadata()?.len();
    if length == 0 || length > limit {
        return Err(Error::Contract("handover complete file byte budget"));
    }
    let mut input = file.try_clone()?;
    input.seek(SeekFrom::Start(0))?;
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(
            usize::try_from(length).map_err(|_| Error::Contract("handover file allocation"))?,
        )
        .map_err(|_| Error::Contract("handover file allocation"))?;
    input.take(length + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 != length {
        return Err(Error::Contract("handover complete file changed"));
    }
    stamp.guard(file)?;
    witness.guard(file, path)?;
    Ok(bytes)
}
pub(super) fn digest(file: &File, path: &Path, length: u64) -> Result<[u8; 32]> {
    let witness = GenerationFileWitness::of(file)?;
    let stamp = GenerationFileStamp::of(file)?;
    witness.guard(file, path)?;
    if file.metadata()?.len() != length {
        return Err(Error::Contract("handover immutable length changed"));
    }
    let mut input = file.try_clone()?;
    input.seek(SeekFrom::Start(0))?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 8192];
    let mut remaining = length;
    while remaining > 0 {
        let count = usize::try_from(remaining.min(buffer.len() as u64))
            .map_err(|_| Error::Contract("handover digest block"))?;
        input.read_exact(&mut buffer[..count])?;
        hash.update(&buffer[..count]);
        remaining -= count as u64;
    }
    if input.read(&mut buffer[..1])? != 0 {
        return Err(Error::Contract("handover immutable file grew"));
    }
    stamp.guard(file)?;
    witness.guard(file, path)?;
    Ok(hash.finalize().into())
}
