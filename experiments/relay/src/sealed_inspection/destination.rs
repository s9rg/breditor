//! Write and read back an exclusive evidence directory with a completion record published last.
use super::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, DirBuilder, File, OpenOptions},
    io::{ErrorKind, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

pub(super) struct Destination {
    path: PathBuf,
    parent: File,
}

pub(super) struct EvidenceDirectory {
    destination: Destination,
    directory: File,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct FilePin {
    file: String,
    pub(super) bytes: u64,
    pub(super) sha256: [u8; 32],
}

impl FilePin {
    pub(super) fn verify(&self, directory: &Path, name: &str, limit: u64) -> Result<PathBuf> {
        if self.file != name || self.bytes > limit {
            return Err("retained evidence name or byte budget differs".into());
        }
        let path = directory.join(name);
        let mut file = open_regular(&path)?;
        verify_bytes(&mut file, self.bytes, self.sha256)?;
        Ok(path)
    }
}

pub(super) fn open_regular(path: &Path) -> Result<File> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err("retained evidence must be a regular file".into());
    }
    let file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err("retained evidence file type changed".into());
    }
    Ok(file)
}

fn verify_bytes(file: &mut File, bytes: u64, sha256: [u8; 32]) -> Result {
    if file.metadata()?.len() != bytes {
        return Err("retained evidence length differs".into());
    }
    file.seek(SeekFrom::Start(0))?;
    let mut hash = Sha256::new();
    let mut remaining = bytes;
    let mut buffer = [0_u8; 8192];
    while remaining != 0 {
        let count = usize::try_from(remaining.min(buffer.len() as u64))?;
        file.read_exact(&mut buffer[..count])?;
        hash.update(&buffer[..count]);
        remaining -= count as u64;
    }
    if file.read(&mut buffer[..1])? != 0 || <[u8; 32]>::from(hash.finalize()) != sha256 {
        return Err("retained evidence readback differs".into());
    }
    Ok(())
}

fn guard_directory(file: &File, path: &Path) -> Result {
    let held = file.metadata()?;
    let named = fs::symlink_metadata(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if !held.is_dir()
            || !named.is_dir()
            || (held.dev(), held.ino()) != (named.dev(), named.ino())
        {
            return Err("sealed inspection destination directory changed".into());
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = (held, named);
        Err("sealed inspection requires Unix directory custody".into())
    }
}

impl Destination {
    pub(super) fn select(path: &Path, protected: &[&PathBuf]) -> Result<Self> {
        let name = path.file_name().ok_or("sealed inspection needs a new directory name")?;
        let parent = path
            .parent()
            .filter(|value| !value.as_os_str().is_empty())
            .unwrap_or(Path::new("."))
            .canonicalize()?;
        let path = parent.join(name);
        if protected.iter().any(|root| path.starts_with(root)) {
            return Err(
                "evidence destination must be outside the selected relay directories".into()
            );
        }
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Ok(_) => return Err("evidence destination already exists".into()),
            Err(error) => return Err(error.into()),
        }
        let handle = File::open(&parent)?;
        guard_directory(&handle, &parent)?;
        Ok(Self { path, parent: handle })
    }

    fn guard_parent(&self) -> Result {
        guard_directory(&self.parent, self.path.parent().ok_or("evidence destination parent")?)
    }

    pub(super) fn create(self) -> Result<EvidenceDirectory> {
        self.guard_parent()?;
        let mut builder = DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&self.path)?;
        let directory = File::open(&self.path)?;
        let output = EvidenceDirectory { destination: self, directory };
        output.guard()?;
        output.destination.parent.sync_all()?;
        Ok(output)
    }
}

impl EvidenceDirectory {
    fn guard(&self) -> Result {
        self.destination.guard_parent()?;
        guard_directory(&self.directory, &self.destination.path)
    }

    pub(super) fn write_bytes(&self, name: &'static str, bytes: &[u8]) -> Result<FilePin> {
        self.write(name, bytes.len() as u64, Sha256::digest(bytes).into(), |file| {
            file.write_all(bytes)?;
            Ok(())
        })
    }

    pub(super) fn write(
        &self,
        name: &'static str,
        bytes: u64,
        sha256: [u8; 32],
        write: impl FnOnce(&mut File) -> Result,
    ) -> Result<FilePin> {
        self.guard()?;
        let path = self.destination.path.join(name);
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path)?;
        write(&mut file)?;
        file.sync_all()?;
        verify_bytes(&mut file, bytes, sha256)?;
        self.guard()?;
        Ok(FilePin { file: name.into(), bytes, sha256 })
    }

    pub(super) fn finish(&self, selection: &[u8]) -> Result {
        self.write_bytes(".selection.pending", selection)?;
        self.directory.sync_all()?;
        self.guard()?;
        let staging = self.destination.path.join(".selection.pending");
        fs::hard_link(&staging, self.destination.path.join("selection.json"))?;
        self.directory.sync_all()?;
        fs::remove_file(staging)?;
        self.directory.sync_all()?;
        self.guard()
    }
}
