//! Ephemeral actual-control witness. Never serialized, restored from metadata or used as authority.
use crate::{
    Error, Result,
    log::generations::{GenerationDirectory, GenerationFileStamp, GenerationFileWitness},
};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::Read,
    path::Path,
};

struct Control {
    identity: GenerationFileWitness,
    stamp: GenerationFileStamp,
    bytes: u64,
    sha256: [u8; 32],
}
pub(super) struct RecoveryControlSeal {
    names: BTreeSet<String>,
    files: BTreeMap<String, Control>,
    directories: BTreeMap<String, (u64, u64)>,
    orphans: BTreeMap<String, BTreeSet<String>>,
}
fn names(root: &Path) -> Result<BTreeSet<String>> {
    let mut output = BTreeSet::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if output.len() >= crate::assets::MAX_ASSETS * 2 + 256 {
            return Err(Error::Contract("recovery control seal entry budget"));
        }
        output.insert(
            entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("recovery control seal filename"))?,
        );
    }
    Ok(output)
}
fn directory(path: &Path) -> Result<(u64, u64)> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() {
        return Err(Error::Contract("recovery control seal directory type"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0 {
            return Err(Error::Contract("recovery control seal directory privacy"));
        }
        Ok((metadata.dev(), metadata.ino()))
    }
    #[cfg(not(unix))]
    {
        Err(Error::Contract("recovery control seal requires Unix"))
    }
}
fn control(path: &Path) -> Result<Control> {
    let mut file = File::open(path)?;
    let identity = GenerationFileWitness::of(&file)?;
    let stamp = GenerationFileStamp::of(&file)?;
    identity.guard(&file, path)?;
    let length = file.metadata()?.len();
    if length > 128 * 1024 {
        return Err(Error::Contract("recovery control seal file budget"));
    }
    let mut hash = Sha256::new();
    let mut bytes = 0;
    let mut buffer = [0_u8; 8192];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        bytes += count as u64;
        if bytes > length {
            return Err(Error::Contract("recovery control grew during seal"));
        }
        hash.update(&buffer[..count]);
    }
    if bytes != length {
        return Err(Error::Contract("recovery control incomplete seal"));
    }
    identity.guard(&file, path)?;
    stamp.guard(&file)?;
    Ok(Control { identity, stamp, bytes, sha256: hash.finalize().into() })
}
impl RecoveryControlSeal {
    pub(super) fn capture(
        root: &GenerationDirectory,
        expected: Option<&BTreeSet<String>>,
        mutable: &BTreeSet<String>,
    ) -> Result<Self> {
        Self::capture_excluding(root, expected, &BTreeSet::new(), mutable)
    }
    pub(super) fn capture_excluding(
        root: &GenerationDirectory,
        expected: Option<&BTreeSet<String>>,
        extra: &BTreeSet<String>,
        mutable: &BTreeSet<String>,
    ) -> Result<Self> {
        root.guard()?;
        let names = names(&root.path)?.difference(extra).cloned().collect();
        if expected.is_some_and(|expected| expected != &names) {
            return Err(Error::Contract("recovery control namespace changed before seal"));
        }
        let mut files = BTreeMap::new();
        let mut directories = BTreeMap::new();
        let mut orphans = BTreeMap::new();
        let mut orphan_bytes = 0;
        for name in &names {
            let path = root.path.join(name);
            if fs::symlink_metadata(&path)?.is_dir() {
                directories.insert(name.clone(), directory(&path)?);
                if !mutable.contains(name) {
                    let children = self::names(&path)?;
                    if children.len() > 2 || orphans.len() >= 64 {
                        return Err(Error::Contract("recovery orphan control entry budget"));
                    }
                    for child in &children {
                        let value = control(&path.join(child))?;
                        orphan_bytes += value.bytes;
                        if orphan_bytes > 128 * 1024 * 64 {
                            return Err(Error::Contract("recovery orphan control byte budget"));
                        }
                        files.insert(format!("{name}/{child}"), value);
                    }
                    orphans.insert(name.clone(), children);
                }
            } else {
                files.insert(name.clone(), control(&path)?);
            }
        }
        let value = Self { names, files, directories, orphans };
        value.check_with_extras(root, extra)?;
        Ok(value)
    }
    /// Local durable phase pin, not portable native validity or deployment authority.
    /// Names, immutable bytes and actual inode identities are framed independently of stamps.
    pub(super) fn fingerprint(&self) -> Result<[u8; 32]> {
        let mut hash = Sha256::new();
        hash.update(b"breditor/recovery-control-custody/1\0");
        for (name, file) in &self.files {
            hash.update(b"file\0");
            hash.update((name.len() as u64).to_le_bytes());
            hash.update(name.as_bytes());
            let identity = serde_json::to_vec(&file.identity)?;
            hash.update((identity.len() as u64).to_le_bytes());
            hash.update(identity);
            hash.update(file.bytes.to_le_bytes());
            hash.update(file.sha256);
        }
        for (name, (device, inode)) in &self.directories {
            hash.update(b"directory\0");
            hash.update((name.len() as u64).to_le_bytes());
            hash.update(name.as_bytes());
            hash.update(device.to_le_bytes());
            hash.update(inode.to_le_bytes());
        }
        Ok(hash.finalize().into())
    }
    pub(super) fn check(&self, root: &GenerationDirectory) -> Result<()> {
        self.check_with_extras(root, &BTreeSet::new())
    }
    pub(super) fn check_with_extras(
        &self,
        root: &GenerationDirectory,
        extra: &BTreeSet<String>,
    ) -> Result<()> {
        root.guard()?;
        let actual: BTreeSet<_> = names(&root.path)?.difference(extra).cloned().collect();
        if actual != self.names {
            return Err(Error::Contract(
                "recovery control namespace changed after native completion",
            ));
        }
        for (name, children) in &self.orphans {
            if names(&root.path.join(name))? != *children {
                return Err(Error::Contract("unselected recovery component work changed"));
            }
        }
        for (name, expected) in &self.files {
            let actual = control(&root.path.join(name))?;
            if actual.identity != expected.identity
                || actual.stamp != expected.stamp
                || actual.bytes != expected.bytes
                || actual.sha256 != expected.sha256
            {
                return Err(Error::Contract("recovery control changed after native completion"));
            }
        }
        for (name, expected) in &self.directories {
            if directory(&root.path.join(name))? != *expected {
                return Err(Error::Contract("recovery component replaced after native completion"));
            }
        }
        root.guard()
    }
}
