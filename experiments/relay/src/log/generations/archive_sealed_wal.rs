//! Hold sealed files in a separate namespace while preserving portable WAL identity.
use super::{
    archive_wal_copy,
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
    sync::Arc,
};

pub(super) const ARCHIVE_DIRECTORY: &str = ".sealed-wals";
const MOUNT_DIRECTORY: &str = ".sealed-wal-volume";

#[cfg(test)]
#[derive(Clone, Copy, PartialEq)]
pub(crate) enum WalArchiveInterruption {
    CopySynced,
    Linked,
    Retired,
}

/// The live directory's exclusive lock covers this fixed child namespace.
pub(super) struct ArchiveDirectory {
    pub(super) path: PathBuf,
    root: File,
    mount: Option<(PathBuf, File)>,
}

impl ArchiveDirectory {
    pub(super) fn open(parent: &Directory) -> Result<Option<Self>> {
        parent.guard()?;
        let mount_path = parent.path.join(MOUNT_DIRECTORY);
        let (path, mount) = if let Some(mount) = Self::open_directory(&mount_path)? {
            if parent.device_matches(&mount)? {
                return Err(Error::Contract("sealed WAL archive volume is not mounted"));
            }
            parent.absent(ARCHIVE_DIRECTORY)?;
            (mount_path.join("archive"), Some((mount_path, mount)))
        } else {
            (parent.path.join(ARCHIVE_DIRECTORY), None)
        };
        let Some(root) = Self::open_directory(&path)? else {
            if mount.is_some() {
                return Err(Error::Contract("private sealed WAL archive on the volume is absent"));
            }
            return Ok(None);
        };
        let archive = Self { path, root, mount };
        archive.guard()?;
        archive.check_device(parent)?;
        parent.guard()?;
        Ok(Some(archive))
    }

    fn check_device(&self, parent: &Directory) -> Result<()> {
        if let Some((_, mount)) = &self.mount {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if self.root.metadata()?.dev() != mount.metadata()?.dev() {
                    return Err(Error::Contract(
                        "private WAL archive is outside its mounted volume",
                    ));
                }
            }
            #[cfg(not(unix))]
            let _ = mount;
        } else if !self.shares_device(parent)? {
            return Err(Error::Contract(
                "use the configured mount for a separate WAL archive volume",
            ));
        }
        Ok(())
    }

    fn open_directory(path: &Path) -> Result<Option<File>> {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => return Err(Error::Contract("sealed WAL archive directory type")),
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        }
        Ok(Some(File::open(path)?))
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
        if let Some((path, file)) = &self.mount {
            Self::guard_directory(path, file, false)?;
        }
        Self::guard_directory(&self.path, &self.root, true)
    }

    fn guard_directory(path: &Path, file: &File, private: bool) -> Result<()> {
        let named = fs::symlink_metadata(path)?;
        let held = file.metadata()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if named.is_dir()
                && held.is_dir()
                && (named.dev(), named.ino()) == (held.dev(), held.ino())
                && (!private || named.mode().trailing_zeros() >= 6)
            {
                return Ok(());
            }
        }
        #[cfg(not(unix))]
        let _ = (named, held, private);
        Err(Error::Contract("sealed WAL archive directory custody differs"))
    }

    pub(super) fn sync(&self) -> Result<()> {
        self.root.sync_all()?;
        if let Some((_, mount)) = &self.mount {
            mount.sync_all()?;
        }
        Ok(())
    }

    fn shares_device(&self, directory: &Directory) -> Result<bool> {
        directory.device_matches(&self.root)
    }

    pub(super) fn live_name(&self) -> &'static str {
        if self.mount.is_some() { MOUNT_DIRECTORY } else { ARCHIVE_DIRECTORY }
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
    let Some(archive) = archive else {
        return HeldWal::open(held_file::open(&live)?, item);
    };
    let path = archive.path.join(&name);
    if !exists(&path)? {
        return HeldWal::open(held_file::open(&live)?, item);
    }
    let mut wal = HeldWal::open(held_file::open(&path)?, item)?;
    if exists(&live)? {
        if archive.shares_device(directory)? {
            wal.identity.guard(&wal.file, &live)?;
        } else {
            wal.archive_source = Some(archive_wal_copy::hold_original(&wal, &live, item)?);
        }
    }
    wal.archived = true;
    Ok(wal)
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
            if let Some(original) = &wal.archive_source {
                original.guard(&live)?;
            } else if exists(&live)? {
                wal.identity.guard(&wal.file, &live)?;
            }
        } else if let Some(archive) = &self.archive
            && exists(&archive.path.join(name))?
        {
            return Err(Error::Contract("unselected WAL archive entry"));
        }
        Ok(())
    }

    pub(super) fn verify_sealed_archive_inventory(&self) -> Result<()> {
        let Some(archive) = &self.archive else {
            self.directory.absent(ARCHIVE_DIRECTORY)?;
            return self.directory.absent(MOUNT_DIRECTORY);
        };
        archive.guard()?;
        let (stages, _) = archive_wal_copy::stages(archive)?;
        if stages != 0 && archive.shares_device(&self.directory)? {
            return Err(Error::Contract("cross-volume WAL stages require a separate volume"));
        }
        let expected: std::collections::BTreeSet<_> =
            self.closed.iter().filter(|wal| wal.archived).map(|wal| selected_name(wal)).collect();
        let mut count = 0;
        for entry in fs::read_dir(&archive.path)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("sealed WAL archive file name"))?;
            if name.starts_with(archive_wal_copy::STAGE_PREFIX) {
                continue;
            }
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
        let metadata = metadata.clone();
        self.verify_retained()?;
        let wal = Arc::get_mut(&mut self.closed[position])
            .ok_or(Error::Contract("sealed WAL is held for replay"))?;
        if self.archive.is_none() {
            self.archive = Some(ArchiveDirectory::create(&self.directory)?);
        }
        let archive = self.archive.as_ref().ok_or(Error::NeedsRecovery)?;
        let duplicate = wal.archived;
        self.directory.sync()?;
        if !archive.shares_device(&self.directory)? {
            if let Err(error) = move_across_volumes(
                &self.directory,
                archive,
                wal,
                &metadata,
                #[cfg(test)]
                stop,
            ) {
                self.fenced.store(true, std::sync::atomic::Ordering::Release);
                return Err(error);
            }
            return Ok(ServerSealedWalArchive {
                generation: generation.into(),
                stored_bytes: wal.physical_bytes,
                duplicate,
            });
        }
        let name = selected_name(wal);
        let live = self.directory.path.join(&name);
        let path = archive.path.join(&name);
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
        if let Err(error) = wal.read(metadata.sha256, |reader| {
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

impl Generations {
    pub(super) fn is_archive_live_name(&self, name: &str) -> bool {
        self.archive.as_ref().is_some_and(|archive| name == archive.live_name())
    }
}

fn move_across_volumes(
    directory: &Directory,
    archive: &ArchiveDirectory,
    wal: &mut HeldWal,
    item: &ClosedFile,
    #[cfg(test)] stop: Option<WalArchiveInterruption>,
) -> Result<()> {
    let name = selected_name(wal);
    let live = directory.path.join(&name);
    let target = archive.path.join(&name);
    if wal.archived {
        archive_wal_copy::retire_stage(archive, wal)?;
    } else {
        let copied = archive_wal_copy::copy_and_publish(
            directory,
            archive,
            wal,
            &name,
            item,
            #[cfg(test)]
            stop,
        )?;
        let original = std::mem::replace(wal, copied);
        wal.archive_source = Some(archive_wal_copy::ArchiveSource::new(original));
    }
    directory.guard()?;
    archive.guard()?;
    wal.guard(&target)?;
    archive.sync()?;
    if let Some(original) = &wal.archive_source {
        original.guard_unaliased(&live)?;
        fs::remove_file(&live)?;
    }
    directory.sync()?;
    #[cfg(test)]
    if stop == Some(WalArchiveInterruption::Retired) {
        return Err(Error::NeedsRecovery);
    }
    wal.archive_source = None;
    Ok(())
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
    archive.sync()?;
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
