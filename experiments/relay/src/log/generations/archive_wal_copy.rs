//! Cross-volume custody for a selected sealed WAL. The source stays intact until
//! its exact, verified representation has a synced archive name.
use super::{
    archive_sealed_wal::ArchiveDirectory,
    directory::Directory,
    held_file::{self, FileIdentity, FileStamp},
    manifest::ClosedFile,
    packed_wal::HeldWal,
};
use crate::{Error, Result, credentials, log};
use std::{
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom},
    path::Path,
};

pub(super) struct ArchiveSource {
    file: File,
    identity: FileIdentity,
    stamp: FileStamp,
    length: u64,
}

impl ArchiveSource {
    pub(super) fn new(wal: HeldWal) -> Self {
        Self {
            file: wal.file,
            identity: wal.identity,
            stamp: wal.stamp,
            length: wal.physical_bytes,
        }
    }

    pub(super) fn guard(&self, path: &Path) -> Result<()> {
        self.stamp.guard(&self.file)?;
        self.identity.guard(&self.file, path)?;
        if self.file.metadata()?.len() != self.length {
            return Err(Error::Contract("original WAL copy changed length"));
        }
        Ok(())
    }

    pub(super) fn guard_unaliased(&self, path: &Path) -> Result<()> {
        self.guard(path)?;
        require_links(&self.file, 1)
    }
}

fn require_links(file: &File, expected: u64) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if file.metadata()?.nlink() == expected {
            return Ok(());
        }
    }
    #[cfg(not(unix))]
    let _ = (file, expected);
    Err(Error::Contract("cross-volume WAL copy has unexpected links"))
}

pub(super) fn hold_original(
    copied: &HeldWal,
    live: &Path,
    item: &ClosedFile,
) -> Result<ArchiveSource> {
    let original = HeldWal::open(held_file::open(live)?, item)?;
    if original.identity.same_device(copied.identity) {
        return Err(Error::Contract("sealed WAL archive has a second same-volume inode"));
    }
    require_links(&original.file, 1)?;
    verify(&original, item)?;
    verify(copied, item)?;
    if !same_representation(&original, copied)? {
        return Err(Error::Contract("cross-volume WAL copies differ in physical bytes"));
    }
    original.guard(live)?;
    Ok(ArchiveSource::new(original))
}

fn same_representation(a: &HeldWal, b: &HeldWal) -> Result<bool> {
    if a.physical_bytes != b.physical_bytes {
        return Ok(false);
    }
    a.stamp.guard(&a.file)?;
    b.stamp.guard(&b.file)?;
    let mut a_file = &a.file;
    let mut b_file = &b.file;
    a_file.seek(SeekFrom::Start(0))?;
    b_file.seek(SeekFrom::Start(0))?;
    let mut a_buffer = [0; 8192];
    let mut b_buffer = [0; 8192];
    let mut remaining = a.physical_bytes;
    while remaining > 0 {
        let length = usize::try_from(remaining.min(a_buffer.len() as u64))
            .map_err(|_| Error::Contract("cross-volume WAL comparison length"))?;
        a_file.read_exact(&mut a_buffer[..length])?;
        b_file.read_exact(&mut b_buffer[..length])?;
        if a_buffer[..length] != b_buffer[..length] {
            return Ok(false);
        }
        remaining -= length as u64;
    }
    a.stamp.guard(&a.file)?;
    b.stamp.guard(&b.file)?;
    Ok(true)
}

fn verify(wal: &HeldWal, item: &ClosedFile) -> Result<()> {
    wal.read(item.sha256, |reader| {
        io::copy(reader, &mut io::sink())?;
        Ok(())
    })
}

pub(super) const STAGE_PREFIX: &str = ".offload-";
pub(super) const MAX_STAGES: usize = 8;
const MAX_STAGE_BYTES: u64 = log::MAX_LOG * 2;

fn copy_to_stage(
    original: &HeldWal,
    live: &Path,
    stage: &Path,
    item: &ClosedFile,
) -> Result<HeldWal> {
    original.guard(live)?;
    require_links(&original.file, 1)?;
    let mut file = log::options().create_new(true).open(stage)?;
    log::lock(&file)?;
    let identity = FileIdentity::of(&file)?;
    let mut input = &original.file;
    input.seek(SeekFrom::Start(0))?;
    if io::copy(&mut input.take(original.physical_bytes + 1), &mut file)? != original.physical_bytes
    {
        return Err(Error::Contract("cross-volume WAL copy length differs"));
    }
    file.sync_all()?;
    original.guard(live)?;
    let copied = HeldWal::open(file, item)?;
    identity.guard(&copied.file, stage)?;
    verify(&copied, item)?;
    Ok(copied)
}

pub(super) fn copy_and_publish(
    directory: &Directory,
    archive: &ArchiveDirectory,
    original: &HeldWal,
    name: &str,
    item: &ClosedFile,
    #[cfg(test)] stop: Option<super::archive_sealed_wal::WalArchiveInterruption>,
) -> Result<HeldWal> {
    let live = directory.path.join(name);
    let target = archive.path.join(name);
    let stage = archive.path.join(format!("{STAGE_PREFIX}{}", credentials::issue()?));
    archive.guard()?;
    let (stages, stage_bytes) = stages(archive)?;
    if stages >= MAX_STAGES || stage_bytes + original.physical_bytes > MAX_STAGE_BYTES {
        return Err(Error::Contract("cross-volume WAL staging capacity is exhausted"));
    }
    let copied = copy_to_stage(original, &live, &stage, item)?;
    archive.sync()?;
    #[cfg(test)]
    if stop == Some(super::archive_sealed_wal::WalArchiveInterruption::CopySynced) {
        return Err(Error::NeedsRecovery);
    }
    directory.guard()?;
    archive.guard()?;
    original.guard(&live)?;
    copied.guard(&stage)?;
    fs::hard_link(&stage, &target)?;
    archive.sync()?;
    #[cfg(test)]
    if stop == Some(super::archive_sealed_wal::WalArchiveInterruption::Linked) {
        return Err(Error::NeedsRecovery);
    }
    let mut copied = HeldWal::open(copied.file, item)?;
    copied.archived = true;
    copied.identity.guard(&copied.file, &target)?;
    verify(&copied, item)?;
    if !same_representation(original, &copied)? {
        return Err(Error::Contract("cross-volume WAL copy read-back differs"));
    }
    retire_stage(archive, &mut copied)?;
    Ok(copied)
}

pub(super) fn retire_stage(archive: &ArchiveDirectory, wal: &mut HeldWal) -> Result<()> {
    let name = super::packed_wal::selected_name(wal);
    for entry in fs::read_dir(&archive.path)? {
        let entry = entry?;
        let stage = entry.path();
        if !entry.file_name().to_string_lossy().starts_with(STAGE_PREFIX) {
            continue;
        }
        let witness = File::open(&stage)?;
        if FileIdentity::of(&witness)? != wal.identity {
            continue;
        }
        archive.guard()?;
        let target = archive.path.join(&name);
        wal.guard(&target)?;
        wal.identity.guard(&wal.file, &stage)?;
        require_links(&wal.file, 2)?;
        fs::remove_file(stage)?;
        archive.sync()?;
        wal.stamp = held_file::FileStamp::of(&wal.file)?;
        wal.guard(&target)?;
        return Ok(());
    }
    Ok(())
}

pub(super) fn stages(archive: &ArchiveDirectory) -> Result<(usize, u64)> {
    let mut count = 0;
    let mut bytes = 0;
    for entry in fs::read_dir(&archive.path)? {
        let entry = entry?;
        let name = entry.file_name();
        if let Some(nonce) = name.to_str().and_then(|name| name.strip_prefix(STAGE_PREFIX)) {
            credentials::hash(nonce)?;
            count += 1;
            if count > MAX_STAGES {
                return Err(Error::Contract("cross-volume WAL stage count"));
            }
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            if !metadata.is_file() || metadata.len() > log::MAX_LOG {
                return Err(Error::Contract("cross-volume WAL stage type or length differs"));
            }
            bytes += metadata.len();
            if bytes > MAX_STAGE_BYTES {
                return Err(Error::Contract("cross-volume WAL stage byte budget"));
            }
            let file = File::open(&path)?;
            FileIdentity::of(&file)?.guard(&file, &path)?;
        }
    }
    Ok((count, bytes))
}
