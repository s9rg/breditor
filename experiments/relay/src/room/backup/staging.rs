//! Exclusive private staging and atomic non-overwriting publication on the target filesystem.
use crate::{Error, Result, credentials};
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

pub(super) struct StagedLog {
    pub path: PathBuf,
    parent: PathBuf,
    destination: PathBuf,
}

impl StagedLog {
    pub fn write(destination: &Path, bytes: &[u8]) -> Result<Self> {
        let encoded = destination.as_os_str().as_encoded_bytes();
        if !matches!(destination.components().next_back(), Some(Component::Normal(_)))
            || encoded.ends_with(b"/")
            || encoded.ends_with(b"/.")
            || cfg!(windows) && (encoded.ends_with(b"\\") || encoded.ends_with(b"\\."))
        {
            return Err(Error::Contract("room backup destination name"));
        }
        let parent =
            destination.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
        let parent = parent.canonicalize()?;
        let destination = parent
            .join(destination.file_name().ok_or(Error::Contract("room backup destination name"))?);
        // Never follow a destination symlink, including a dangling one, or claim an occupied key.
        match std::fs::symlink_metadata(&destination) {
            Ok(_) => return Err(Error::Contract("room backup destination exists")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        let path = parent.join(format!(".breditor-room-restore-{}", credentials::issue()?));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&path)?;
        let staged = Self { path, parent, destination };
        {
            // Close the writer before cleanup on failure, including platforms that refuse unlink
            // while a handle is open. Ownership starts only after create_new actually succeeds.
            let mut file = file;
            file.write_all(bytes)?;
            file.sync_all()?;
        }
        Ok(staged)
    }

    pub fn publish(&self) -> Result<()> {
        // The already-replayed staging inode stays locked by Room across publication.
        // A racing file/symlink/directory wins without being overwritten or truncated.
        std::fs::hard_link(&self.path, &self.destination)?;
        File::open(&self.parent)?.sync_all()?;
        Ok(())
    }
}

impl Drop for StagedLog {
    fn drop(&mut self) {
        // Only the unique file created by this attempt; never remove a published destination.
        let _ = std::fs::remove_file(&self.path);
    }
}
