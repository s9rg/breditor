//! Inactive private recovery directory, exact streaming checks and owned-prefix publication.
use crate::{Error, Result};
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};
pub(super) fn options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}
pub(super) fn sync(root: &Path) -> Result<()> {
    File::open(root)?.sync_all()?;
    Ok(())
}
pub(super) fn lock(file: &File) -> Result<()> {
    file.try_lock().map_err(|e| match e {
        TryLockError::WouldBlock => Error::Locked,
        TryLockError::Error(e) => Error::Io(e),
    })
}
pub(super) fn guard_lock(root: &Path, held: &File) -> Result<()> {
    let path = fs::symlink_metadata(root.join(".lock"))?;
    if !path.is_file() {
        return Err(Error::Contract("server recovery lock file"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let owner = held.metadata()?;
        if path.dev() != owner.dev() || path.ino() != owner.ino() {
            return Err(Error::Contract("server recovery lock source"));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = held.metadata()?;
    }
    Ok(())
}
pub(super) fn anchor(root: &Path) -> Result<PathBuf> {
    let encoded = root.as_os_str().as_encoded_bytes();
    if !matches!(root.components().next_back(), Some(Component::Normal(_)))
        || encoded.ends_with(b"/")
        || encoded.ends_with(b"/.")
        || cfg!(windows) && (encoded.ends_with(b"\\") || encoded.ends_with(b"\\."))
    {
        return Err(Error::Contract("server recovery destination name"));
    }
    let root =
        if root.is_absolute() { root.to_path_buf() } else { std::env::current_dir()?.join(root) };
    let parent = root
        .parent()
        .ok_or(Error::Contract("server recovery destination parent"))?
        .canonicalize()?;
    Ok(parent.join(root.file_name().ok_or(Error::Contract("server recovery destination name"))?))
}
pub(super) fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.into()),
    }
}
pub(super) fn read_marker(path: &Path) -> Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 {
        return Err(Error::Contract("server recovery marker bytes/type"));
    }
    let mut bytes = Vec::new();
    File::open(path)?.take(128 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 128 * 1024 {
        return Err(Error::Contract("server recovery marker bytes"));
    }
    Ok(bytes)
}
pub(super) fn compare(path: &Path, expected: &[u8], partial: bool) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file()
        || metadata.len() > expected.len() as u64
        || !partial && metadata.len() != expected.len() as u64
    {
        return Err(Error::Contract("server recovery file type/bytes"));
    }
    let length = usize::try_from(metadata.len())
        .map_err(|_| Error::Contract("server recovery file bytes"))?;
    let mut file = File::open(path)?;
    let mut buffer = [0_u8; 8 * 1024];
    let mut at = 0;
    while at < length {
        let end = (length - at).min(buffer.len());
        file.read_exact(&mut buffer[..end])?;
        if buffer[..end] != expected[at..at + end] {
            return Err(Error::Contract("server recovery divergent bytes"));
        }
        at += end;
    }
    if file.read(&mut buffer[..1])? != 0 {
        return Err(Error::Contract("server recovery changed bytes"));
    }
    Ok(())
}
pub(super) fn prepare(path: &Path, expected: &[u8]) -> Result<()> {
    let mut file = if exists(path)? {
        compare(path, expected, true)?;
        OpenOptions::new().append(true).open(path)?
    } else {
        options().create_new(true).open(path)?
    };
    let length = usize::try_from(file.metadata()?.len())
        .map_err(|_| Error::Contract("server recovery staging bytes"))?;
    file.write_all(
        expected.get(length..).ok_or(Error::Contract("server recovery staging bytes"))?,
    )?;
    file.sync_all()?;
    drop(file);
    compare(path, expected, false)
}
pub(super) fn publish(root: &Path, stage: &Path, target: &Path, expected: &[u8]) -> Result<()> {
    if exists(target)? {
        compare(target, expected, false)?;
    } else {
        match fs::hard_link(stage, target) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                compare(target, expected, false)?;
            }
            Err(e) => return Err(e.into()),
        }
    }
    compare(target, expected, false)?;
    File::open(target)?.sync_all()?;
    sync(root)
}
pub(super) fn retire(root: &Path, stage: &Path, expected: &[u8]) -> Result<()> {
    if exists(stage)? {
        compare(stage, expected, false)?;
        fs::remove_file(stage)?;
        sync(root)?;
    }
    Ok(())
}
