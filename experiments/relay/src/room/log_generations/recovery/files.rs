//! Private bounded controls and exact owned-prefix checks. Never replace an occupied target.
use crate::{
    Error, Result, credentials,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    fmt::Write,
    fs::{self, File, OpenOptions, TryLockError},
    io::{Read, Seek, SeekFrom},
    path::Path,
};
pub(super) const MAX_CONTROL: u64 = 128 * 1024;
pub(super) fn insert(directory: &GenerationDirectory, name: &str, bytes: &[u8]) -> Result<()> {
    directory.guard()?;
    directory.absent(name)?;
    let stage = format!(".meta-{}", credentials::issue()?);
    let file = directory.create_file(&stage, bytes)?;
    let witness = GenerationFileWitness::of(&file)?;
    witness.guard(&file, &directory.path.join(&stage))?;
    fs::hard_link(directory.path.join(&stage), directory.path.join(name))?;
    directory.sync()?;
    witness.guard(&file, &directory.path.join(&stage))?;
    fs::remove_file(directory.path.join(stage))?;
    directory.sync()
}
pub(super) fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.into()),
    }
}
pub(super) fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() as u64 > MAX_CONTROL {
        return Err(Error::Contract("generation recovery control budget"));
    }
    Ok(bytes)
}
pub(super) fn read<T: DeserializeOwned + Serialize>(path: &Path) -> Result<T> {
    let mut file = File::open(path)?;
    let witness = GenerationFileWitness::of(&file)?;
    witness.guard(&file, path)?;
    if file.metadata()?.len() > MAX_CONTROL {
        return Err(Error::Contract("generation recovery control budget"));
    }
    let mut bytes = Vec::new();
    file.by_ref().take(MAX_CONTROL + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CONTROL {
        return Err(Error::Contract("generation recovery control budget"));
    }
    let value = serde_json::from_slice(&bytes)?;
    if encode(&value)? != bytes {
        return Err(Error::Contract("generation recovery canonical control"));
    }
    witness.guard(&file, path)?;
    if file.metadata()?.len() != bytes.len() as u64 {
        return Err(Error::Contract("generation recovery control changed"));
    }
    Ok(value)
}
pub(super) fn open(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    let file = options.open(path)?;
    file.try_lock().map_err(|error| match error {
        TryLockError::WouldBlock => Error::Locked,
        TryLockError::Error(e) => Error::Io(e),
    })?;
    GenerationFileWitness::of(&file)?.guard(&file, path)?;
    Ok(file)
}
pub(super) fn compare(file: &mut File, expected: &[u8], partial: bool) -> Result<()> {
    let length = usize::try_from(file.metadata()?.len())
        .map_err(|_| Error::Contract("generation recovery file bytes"))?;
    if length > expected.len() || !partial && length != expected.len() {
        return Err(Error::Contract("generation recovery file length"));
    }
    file.seek(SeekFrom::Start(0))?;
    let mut buffer = [0_u8; 8192];
    let mut offset = 0;
    while offset < length {
        let count = (length - offset).min(buffer.len());
        file.read_exact(&mut buffer[..count])?;
        if buffer[..count] != expected[offset..offset + count] {
            return Err(Error::Contract("generation recovery file changed"));
        }
        offset += count;
    }
    if file.read(&mut buffer[..1])? != 0 {
        return Err(Error::Contract("generation recovery file grew"));
    }
    Ok(())
}
pub(super) fn key(name: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(b"breditor/generation-recovery-file/1\0");
    hash.update(name.as_bytes());
    let mut out = String::new();
    for byte in hash.finalize() {
        let _ = write!(out, "{byte:02x}");
    }
    out
}
pub(super) fn target(name: &str) -> &str {
    if name == ".ready.json" { ".prepared.json" } else { name }
}
pub(super) fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
