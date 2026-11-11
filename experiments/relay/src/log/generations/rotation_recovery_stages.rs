//! A single resumable control stage reserved by an already durable rotation intent.
use super::{
    directory::Directory,
    format,
    held_file::{self, FileIdentity},
    publication,
    state::Generations,
};
use crate::{Error, Result, log};
use std::{
    fs::{self, File},
    io::{Seek, SeekFrom, Write},
    path::Path,
};

pub(super) const PREFIX: &str = ".rotation-recovery-";

pub(super) struct RecoveryStages {
    pub(super) manifest: String,
    pub(super) head: String,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum Control {
    Manifest,
    Head,
}

fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn check_links(file: &File, expected: u64) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if file.metadata()?.nlink() != expected {
            return Err(Error::Contract("rotation recovery stage has unrelated links"));
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = (file, expected);
        Err(Error::Contract("rotation recovery requires Unix inode custody"))
    }
}

impl RecoveryStages {
    pub(super) fn new(nonce: &str) -> Self {
        Self {
            manifest: format!("{PREFIX}manifest-{nonce}"),
            head: format!("{PREFIX}head-{nonce}"),
        }
    }

    pub(super) fn existing(&self, directory: &Directory) -> Result<Option<Control>> {
        match (
            exists(&directory.path.join(&self.manifest))?,
            exists(&directory.path.join(&self.head))?,
        ) {
            (false, false) => Ok(None),
            (true, false) => Ok(Some(Control::Manifest)),
            (false, true) => Ok(Some(Control::Head)),
            (true, true) => Err(Error::Contract("multiple rotation recovery stages")),
        }
    }

    fn complete_stage(&self, state: &Generations, control: Control, bytes: &[u8]) -> Result<File> {
        let directory = &state.directory;
        directory.guard()?;
        let name = match control {
            Control::Manifest => &self.manifest,
            Control::Head => &self.head,
        };
        let path = directory.path.join(name);
        let mut file = if exists(&path)? {
            held_file::open(&path)?
        } else {
            let file = log::options().create_new(true).open(&path)?;
            log::lock(&file)?;
            file
        };
        let identity = FileIdentity::of(&file)?;
        identity.guard(&file, &path)?;
        check_links(&file, 1)?;
        let prefix = held_file::read(&file, format::MAX_CONTROL)?;
        let remaining = bytes
            .strip_prefix(prefix.as_slice())
            .ok_or(Error::Contract("rotation recovery stage differs from expected prefix"))?;
        file.seek(SeekFrom::Start(prefix.len() as u64))?;
        #[cfg(test)]
        {
            let point = match control {
                Control::Manifest => super::RotationPoint::RecoveryManifestPrefix,
                Control::Head => super::RotationPoint::RecoveryHeadPrefix,
            };
            if state.stop_after == Some(point) && remaining.len() > 1 {
                file.write_all(&remaining[..remaining.len() / 2])?;
                file.sync_all()?;
                directory.sync()?;
                state.interrupt(point)?;
            }
        }
        file.write_all(remaining)?;
        file.sync_all()?;
        directory.sync()?;
        identity.guard(&file, &path)?;
        check_links(&file, 1)?;
        if held_file::read(&file, format::MAX_CONTROL)? != bytes {
            return Err(Error::Contract("completed rotation recovery stage differs"));
        }
        Ok(file)
    }

    pub(super) fn publish_manifest(
        &self,
        state: &Generations,
        after: &[u8; 32],
        bytes: &[u8],
        existing: Option<Control>,
    ) -> Result<File> {
        let directory = &state.directory;
        let path = directory.path.join(format::manifest_name(after));
        let temporary = directory.path.join(&self.manifest);
        let file = if exists(&path)? {
            let file = held_file::open(&path)?;
            if held_file::read(&file, format::MAX_CONTROL)? != bytes {
                return Err(Error::Contract("immutable log control differs"));
            }
            if existing != Some(Control::Manifest) {
                return Ok(file);
            }
            file
        } else {
            if existing == Some(Control::Head) {
                return Err(Error::Contract(
                    "rotation recovery head stage without published manifest",
                ));
            }
            let file = self.complete_stage(state, Control::Manifest, bytes)?;
            fs::hard_link(&temporary, &path)?;
            file
        };
        directory.sync()?;
        #[cfg(test)]
        state.interrupt(super::RotationPoint::RecoveryManifestLinked)?;
        let identity = FileIdentity::of(&file)?;
        directory.guard()?;
        identity.guard(&file, &path)?;
        identity.guard(&file, &temporary)?;
        check_links(&file, 2)?;
        fs::remove_file(temporary)?;
        directory.sync()?;
        Ok(file)
    }

    pub(super) fn publish_head(&self, state: &Generations, bytes: &[u8]) -> Result<File> {
        let directory = &state.directory;
        publication::guard_head(
            directory,
            &state.head,
            &state.head_bytes,
            "physical log head differs before publication",
        )?;
        let next = self.complete_stage(state, Control::Head, bytes)?;
        publication::guard_head(
            directory,
            &state.head,
            &state.head_bytes,
            "physical log head changed during staging",
        )?;
        let temporary = directory.path.join(&self.head);
        FileIdentity::of(&next)?.guard(&next, &temporary)?;
        check_links(&next, 1)?;
        fs::rename(temporary, directory.path.join(".head.json"))?;
        directory.sync()?;
        Ok(next)
    }
}
