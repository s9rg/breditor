//! Exclusive private directory custody, anchored once before any child publication.
use super::{
    format,
    held_file::{self, FileIdentity},
};
use crate::{Error, Result, credentials};
use std::{
    fs::{self, File},
    io::Write,
    path::{Component, Path, PathBuf},
};

pub(super) struct Directory {
    pub path: PathBuf,
    root: File,
    owner: File,
    owner_id: FileIdentity,
    owner_bytes: Vec<u8>,
    #[cfg(unix)]
    root_id: (u64, u64),
}
fn anchored(path: &Path) -> Result<PathBuf> {
    let encoded = path.as_os_str().as_encoded_bytes();
    if !matches!(path.components().next_back(), Some(Component::Normal(_)))
        || encoded.ends_with(b"/")
        || encoded.ends_with(b"/.")
        || cfg!(windows) && (encoded.ends_with(b"\\") || encoded.ends_with(b"\\."))
    {
        return Err(Error::Contract("log generation directory name"));
    }
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    Ok(parent.canonicalize()?.join(path.file_name().ok_or(Error::Contract("directory name"))?))
}
impl Directory {
    pub fn create(path: &Path) -> Result<Self> {
        let path = anchored(path)?;
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&path)?;
        let mut owner = super::super::options().create_new(true).open(path.join(".owner"))?;
        super::super::lock(&owner)?;
        let bytes = format!("BREDITOR-LOG-GENERATIONS1\n{}\n", credentials::issue()?).into_bytes();
        owner.write_all(&bytes)?;
        owner.sync_all()?;
        let result = Self::held(path, owner, bytes)?;
        File::open(result.path.parent().ok_or(Error::Contract("log directory parent"))?)?
            .sync_all()?;
        Ok(result)
    }
    pub fn open(path: &Path) -> Result<Self> {
        let path = anchored(path)?;
        let owner = held_file::open(&path.join(".owner"))?;
        let bytes = held_file::read(&owner, 256)?;
        let text = std::str::from_utf8(&bytes).map_err(|_| Error::Contract("log owner marker"))?;
        let nonce = text
            .strip_prefix("BREDITOR-LOG-GENERATIONS1\n")
            .and_then(|s| s.strip_suffix('\n'))
            .ok_or(Error::Contract("log owner marker"))?;
        credentials::hash(nonce)?;
        Self::held(path, owner, bytes)
    }
    fn held(path: PathBuf, owner: File, owner_bytes: Vec<u8>) -> Result<Self> {
        let named = fs::symlink_metadata(&path)?;
        if !named.is_dir() {
            return Err(Error::Contract("log generation directory type"));
        }
        let root = File::open(&path)?;
        #[cfg(unix)]
        let root_id = {
            use std::os::unix::fs::MetadataExt;
            if named.mode() & 0o077 != 0
                || named.dev() != root.metadata()?.dev()
                || named.ino() != root.metadata()?.ino()
            {
                return Err(Error::Contract("log generation directory custody"));
            }
            (named.dev(), named.ino())
        };
        let owner_id = FileIdentity::of(&owner)?;
        let result = Self {
            path,
            root,
            owner,
            owner_id,
            owner_bytes,
            #[cfg(unix)]
            root_id,
        };
        result.guard()?;
        result.sync()?;
        Ok(result)
    }
    pub fn guard(&self) -> Result<()> {
        let named = fs::symlink_metadata(&self.path)?;
        if !named.is_dir() {
            return Err(Error::Contract("log generation directory type"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let held = self.root.metadata()?;
            if (named.dev(), named.ino()) != self.root_id
                || (held.dev(), held.ino()) != self.root_id
                || named.mode() & 0o077 != 0
                || held.mode() & 0o077 != 0
            {
                return Err(Error::Contract("log generation directory owner differs"));
            }
        }
        self.owner_id.guard(&self.owner, &self.path.join(".owner"))?;
        if held_file::read(&self.owner, 256)? != self.owner_bytes {
            return Err(Error::Contract("log generation owner marker differs"));
        }
        Ok(())
    }
    pub fn sync(&self) -> Result<()> {
        self.root.sync_all().map_err(Into::into)
    }
    pub fn absent(&self, name: &str) -> Result<()> {
        match fs::symlink_metadata(self.path.join(name)) {
            Ok(_) => Err(Error::Contract("log generation destination occupied")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
    pub fn create_file(&self, name: &str, bytes: &[u8]) -> Result<File> {
        self.guard()?;
        let mut file = super::super::options().create_new(true).open(self.path.join(name))?;
        super::super::lock(&file)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        self.sync()?;
        Ok(file)
    }
    pub fn immutable(&self, name: &str, bytes: &[u8]) -> Result<File> {
        self.guard()?;
        if fs::symlink_metadata(self.path.join(name)).is_ok() {
            let file = held_file::open(&self.path.join(name))?;
            if held_file::read(&file, format::MAX_CONTROL)? != bytes {
                return Err(Error::Contract("immutable log control differs"));
            }
            return Ok(file);
        }
        let stage = format!(".stage-{}", credentials::issue()?);
        let file = self.create_file(&stage, bytes)?;
        FileIdentity::of(&file)?.guard(&file, &self.path.join(&stage))?;
        fs::hard_link(self.path.join(&stage), self.path.join(name))?;
        self.sync()?;
        fs::remove_file(self.path.join(stage))?;
        self.sync()?;
        Ok(file)
    }
}
