//! Hold sealed files in a separate namespace while preserving portable WAL identity.
use super::{
    directory::Directory,
    format,
    held_file::{self, FileStamp},
    manifest::ClosedFile,
    options::generation,
    packed_wal::{HeldWal, selected_name},
    state::Generations,
};
use crate::{Error, Result, log::Log};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::ErrorKind,
    path::{Path, PathBuf},
};

pub(super) const ARCHIVE_DIRECTORY: &str = ".sealed-wals";

#[cfg(test)]
#[derive(Clone, Copy, PartialEq)]
pub(crate) enum WalArchiveInterruption {
    Linked,
    Retired,
}

/// The live directory's exclusive lock covers this fixed child namespace.
pub(super) struct ArchiveDirectory {
    path: PathBuf,
    root: File,
}

impl ArchiveDirectory {
    pub(super) fn open(parent: &Directory) -> Result<Option<Self>> {
        parent.guard()?;
        let path = parent.path.join(ARCHIVE_DIRECTORY);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => return Err(Error::Contract("sealed WAL archive directory type")),
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        }
        let root = File::open(&path)?;
        let archive = Self { path, root };
        archive.guard()?;
        parent.guard()?;
        Ok(Some(archive))
    }

    fn create(parent: &Directory) -> Result<Self> {
        parent.guard()?;
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(parent.path.join(ARCHIVE_DIRECTORY))?;
        parent.sync()?;
        Self::open(parent)?.ok_or(Error::NeedsRecovery)
    }

    pub(super) fn guard(&self) -> Result<()> {
        let named = fs::symlink_metadata(&self.path)?;
        let held = self.root.metadata()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if named.is_dir()
                && held.is_dir()
                && (named.dev(), named.ino()) == (held.dev(), held.ino())
                && named.mode() & 0o077 == 0
            {
                return Ok(());
            }
        }
        #[cfg(not(unix))]
        let _ = (named, held);
        Err(Error::Contract("sealed WAL archive directory custody differs"))
    }
}

/// Physical placement of an immutable log generation after owner maintenance.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSealedWalArchive {
    /// Original generation identity.
    pub generation: String,
    /// Bytes moved out of the live WAL namespace, including any packing.
    pub stored_bytes: u64,
    /// True if the archive name already held the selected file when called.
    pub duplicate: bool,
}

pub(super) fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub(super) fn open_wal(
    directory: &Directory,
    archive: Option<&ArchiveDirectory>,
    item: &ClosedFile,
) -> Result<HeldWal> {
    let name = format::wal_name(&item.generation);
    let live = directory.path.join(&name);
    if let Some(path) = archive.map(|directory| directory.path.join(&name))
        && exists(&path)?
    {
        let mut wal = HeldWal::open(held_file::open(&path)?, item)?;
        if exists(&live)? {
            wal.identity.guard(&wal.file, &live)?;
        }
        wal.archived = true;
        return Ok(wal);
    }
    HeldWal::open(held_file::open(&live)?, item)
}

impl Generations {
    pub(super) fn sealed_wal_path(&self, wal: &HeldWal) -> Result<PathBuf> {
        let path = if wal.archived {
            &self.archive.as_ref().ok_or(Error::NeedsRecovery)?.path
        } else {
            &self.directory.path
        };
        Ok(path.join(selected_name(wal)))
    }

    pub(super) fn guard_sealed_wal(&self, wal: &HeldWal) -> Result<()> {
        wal.guard(&self.sealed_wal_path(wal)?)?;
        let name = selected_name(wal);
        if wal.archived {
            let live = self.directory.path.join(name);
            if exists(&live)? {
                wal.identity.guard(&wal.file, &live)?;
            }
        } else if let Some(archive) = &self.archive {
            if exists(&archive.path.join(name))? {
                return Err(Error::Contract("unselected WAL archive entry"));
            }
        }
        Ok(())
    }

    pub(super) fn verify_sealed_archive_inventory(&self) -> Result<()> {
        let Some(archive) = &self.archive else {
            return self.directory.absent(ARCHIVE_DIRECTORY);
        };
        archive.guard()?;
        let expected: std::collections::BTreeSet<_> =
            self.closed.iter().filter(|wal| wal.archived).map(selected_name).collect();
        let mut count = 0;
        for entry in fs::read_dir(&archive.path)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("sealed WAL archive file name"))?;
            if !expected.contains(&name) {
                return Err(Error::Contract("sealed WAL archive contains unknown work"));
            }
            count += 1;
        }
        if count != expected.len() {
            return Err(Error::Contract("sealed WAL archive closure differs"));
        }
        archive.guard()
    }

    fn archive_sealed_wal(
        &mut self,
        generation: &str,
        through: u64,
        #[cfg(test)] stop: Option<WalArchiveInterruption>,
    ) -> Result<ServerSealedWalArchive> {
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        if self.ready_name != ".ready.json" || self.opening_length.is_some() {
            return Err(Error::Contract("WAL archival requires a complete published log"));
        }
        let position = self
            .closed
            .iter()
            .position(|wal| wal.generation == generation)
            .ok_or(Error::Contract("archival requires a selected sealed WAL"))?;
        let (metadata, _) =
            self.current().value.closed_files().nth(position).ok_or(Error::NeedsRecovery)?;
        if metadata.next()? > through {
            return Err(Error::Contract("WAL archival exceeds its checkpoint"));
        }
        let digest = metadata.sha256;
        self.verify_retained()?;
        if self.archive.is_none() {
            self.archive = Some(ArchiveDirectory::create(&self.directory)?);
        }
        let archive = self.archive.as_ref().ok_or(Error::NeedsRecovery)?;
        let wal = &mut self.closed[position];
        let name = selected_name(wal);
        let live = self.directory.path.join(&name);
        let path = archive.path.join(&name);
        let duplicate = wal.archived;
        if let Err(error) = publish_archive_name(
            &self.directory,
            archive,
            wal,
            &live,
            &path,
            #[cfg(test)]
            stop,
        ) {
            self.fenced.store(true, std::sync::atomic::Ordering::Release);
            return Err(error);
        }
        wal.archived = true;
        wal.stamp = FileStamp::of(&wal.file)?;
        if let Err(error) = wal.read(digest, |reader| {
            std::io::copy(reader, &mut std::io::sink())?;
            Ok(())
        }) {
            self.fenced.store(true, std::sync::atomic::Ordering::Release);
            return Err(error);
        }
        Ok(ServerSealedWalArchive {
            generation: generation.into(),
            stored_bytes: wal.physical_bytes,
            duplicate,
        })
    }
}

fn publish_archive_name(
    directory: &Directory,
    archive: &ArchiveDirectory,
    wal: &HeldWal,
    live: &Path,
    path: &Path,
    #[cfg(test)] stop: Option<WalArchiveInterruption>,
) -> Result<()> {
    directory.guard()?;
    archive.guard()?;
    if !wal.archived {
        wal.guard(live)?;
        fs::hard_link(live, path)?;
    }
    archive.root.sync_all()?;
    #[cfg(test)]
    if stop == Some(WalArchiveInterruption::Linked) {
        return Err(Error::NeedsRecovery);
    }
    wal.identity.guard(&wal.file, path)?;
    directory.guard()?;
    archive.guard()?;
    if exists(live)? {
        wal.identity.guard(&wal.file, live)?;
        fs::remove_file(live)?;
    }
    directory.sync()?;
    #[cfg(test)]
    if stop == Some(WalArchiveInterruption::Retired) {
        return Err(Error::NeedsRecovery);
    }
    Ok(())
}

impl Log {
    pub(crate) fn archive_sealed_wal(
        &mut self,
        id: &str,
        through: u64,
    ) -> Result<ServerSealedWalArchive> {
        self.archive_selected_wal(
            id,
            through,
            #[cfg(test)]
            None,
        )
    }

    #[cfg(test)]
    pub(crate) fn interrupt_wal_archive(
        &mut self,
        id: &str,
        through: u64,
        stop: WalArchiveInterruption,
    ) -> Result<ServerSealedWalArchive> {
        self.archive_selected_wal(id, through, Some(stop))
    }

    fn archive_selected_wal(
        &mut self,
        id: &str,
        through: u64,
        #[cfg(test)] stop: Option<WalArchiveInterruption>,
    ) -> Result<ServerSealedWalArchive> {
        self.ready()?;
        generation(id)?;
        let state = self
            .generations
            .as_mut()
            .ok_or(Error::Contract("original log does not archive sealed WALs"))?;
        let result = state.archive_sealed_wal(
            id,
            through,
            #[cfg(test)]
            stop,
        );
        if matches!(&result, Err(Error::Io(_) | Error::NeedsRecovery)) || self.ready().is_err() {
            self.invalidate();
            return result.and(Err(Error::NeedsRecovery));
        }
        result
    }
}
