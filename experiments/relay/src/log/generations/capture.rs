//! Exact held-file capture into one backing buffer, retaining unpublished bytes without admission.
use super::{
    closure::{self, GenerationCut, MAX_GENERATION_BODY_BYTES, MAX_GENERATION_FILES},
    format,
    held_file::{FileIdentity, FileStamp},
    packed_wal,
    state::Generations,
};
use crate::{Error, Result, log::Log};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GenerationFileSection {
    pub name: String,
    pub offset: u64,
    pub bytes: u64,
    pub sha256: [u8; 32],
}
pub(crate) struct GenerationFiles {
    pub body: Vec<u8>,
    pub sections: Vec<GenerationFileSection>,
    pub cut: GenerationCut,
}
enum CaptureFile<'a> {
    Held(&'a File),
    Unpublished(File),
}
impl CaptureFile<'_> {
    fn file(&self) -> &File {
        match self {
            Self::Held(file) => file,
            Self::Unpublished(file) => file,
        }
    }
}

pub(super) struct CaptureEntry<'a> {
    handle: CaptureFile<'a>,
    path: PathBuf,
    identity: FileIdentity,
    stamp: FileStamp,
    length: u64,
    pub(super) bytes: u64,
}

impl CaptureEntry<'_> {
    pub(super) fn file(&self) -> &File {
        self.handle.file()
    }

    pub(super) fn guard(&self) -> Result<()> {
        let file = self.handle.file();
        self.identity.guard(file, &self.path)?;
        self.stamp.guard(file)?;
        if file.metadata()?.len() != self.length {
            return Err(Error::Contract("generation capture source length changed"));
        }
        Ok(())
    }
}

pub(super) fn backing_buffer(total: u64) -> Result<Vec<u8>> {
    if total > MAX_GENERATION_BODY_BYTES {
        return Err(Error::Contract("generation capture memory budget"));
    }
    let allocation = total
        .checked_add(format::MAX_CONTROL + 64)
        .ok_or(Error::Contract("generation capture memory"))?;
    let mut body = Vec::new();
    body.try_reserve_exact(
        usize::try_from(allocation).map_err(|_| Error::Contract("generation capture memory"))?,
    )
    .map_err(|_| Error::Contract("generation capture memory"))?;
    Ok(body)
}
impl Generations {
    pub(super) fn selected_file<'a>(&'a self, name: &str, active: &'a File) -> Option<&'a File> {
        if name == ".head.json" {
            Some(&self.head)
        } else if name == ".ready.json" {
            Some(&self.ready)
        } else if name == format::wal_name(&self.current().value.active.generation) {
            Some(active)
        } else {
            self.history
                .iter()
                .find(|held| name == format::manifest_name(&held.hash))
                .map(|held| &held.file)
        }
    }
    pub(super) fn capture_entry<'a>(
        &'a self,
        name: &str,
        active: &'a File,
        active_name: &str,
        active_prefix: Option<u64>,
    ) -> Result<CaptureEntry<'a>> {
        if let Some((wal, _)) = self.closed_wal(name) {
            self.guard_sealed_wal(wal)?;
            return Ok(CaptureEntry {
                handle: CaptureFile::Held(&wal.file),
                path: self.sealed_wal_path(wal)?,
                identity: wal.identity,
                stamp: wal.stamp,
                length: wal.physical_bytes,
                bytes: wal.bytes,
            });
        }
        let path = self.directory.path.join(name);
        let handle = if let Some(held) = self.selected_file(name, active) {
            CaptureFile::Held(held)
        } else if name.starts_with(".stage-") {
            CaptureFile::Unpublished(File::open(&path)?)
        } else {
            return Err(Error::Contract("generation capture not held"));
        };
        let file = handle.file();
        let identity = FileIdentity::of(file)?;
        identity.guard(file, &path)?;
        let length = file.metadata()?.len();
        let bytes = if name == active_name { active_prefix.unwrap_or(length) } else { length };
        if bytes > length {
            return Err(Error::Contract("generation capture prefix exceeds source file"));
        }
        let stamp = FileStamp::of(file)?;
        Ok(CaptureEntry { handle, path, identity, stamp, length, bytes })
    }

    fn capture_files(
        &self,
        active: &File,
        active_prefix: Option<u64>,
        pending: Option<&BTreeSet<String>>,
    ) -> Result<GenerationFiles> {
        if self.ready_name != ".ready.json" {
            return Err(Error::Contract("generation source is not published"));
        }
        self.verify_inventory()?;
        if pending.is_none() {
            self.directory.absent(".rotation.json")?;
        }
        self.verify_retained()?;
        let live_names = self.capture_live_names()?;
        let names = self.portable_names(&live_names, pending)?;
        let active_name = format::wal_name(&self.current().value.active.generation);
        let entries = names
            .into_iter()
            .map(|name| {
                let entry = self.capture_entry(&name, active, &active_name, active_prefix)?;
                Ok((name, entry))
            })
            .collect::<Result<Vec<_>>>()?;
        let total = entries.iter().try_fold(0_u64, |total, (_, entry)| {
            total.checked_add(entry.bytes).ok_or(Error::Contract("generation capture bytes"))
        })?;
        // Reserve one bounded envelope prefix so the room codec can insert its header in place.
        let mut body = backing_buffer(total)?;
        let mut sections = Vec::new();
        for (name, entry) in &entries {
            let mut file = entry.handle.file();
            let offset = body.len() as u64;
            let copied = if let Some((wal, metadata)) = self.closed_wal(name) {
                wal.read(metadata.sha256, |reader| Ok(reader.read_to_end(&mut body)?))?
            } else {
                file.seek(SeekFrom::Start(0))?;
                file.by_ref().take(entry.bytes).read_to_end(&mut body)?
            };
            if copied as u64 != entry.bytes {
                return Err(Error::Contract("generation capture incomplete file"));
            }
            entry.guard()?;
            sections.push(GenerationFileSection {
                name: name.clone(),
                offset,
                bytes: entry.bytes,
                sha256: format::sha(
                    &body[usize::try_from(offset)
                        .map_err(|_| Error::Contract("capture offset"))?..],
                ),
            });
        }
        let slices = sections
            .iter()
            .map(|part| {
                let start = usize::try_from(part.offset)
                    .map_err(|_| Error::Contract("generation capture range"))?;
                let end = usize::try_from(part.offset + part.bytes)
                    .map_err(|_| Error::Contract("generation capture range"))?;
                Ok((part.name.as_str(), &body[start..end]))
            })
            .collect::<Result<BTreeMap<_, _>>>()?;
        let cut = closure::verify_generation_files(&slices)?;
        for (_, entry) in &entries {
            entry.guard()?;
        }
        self.check_capture_names(live_names, pending)?;
        Ok(GenerationFiles { body, sections, cut })
    }
    pub(super) fn portable_names(
        &self,
        live_names: &BTreeSet<String>,
        pending: Option<&BTreeSet<String>>,
    ) -> Result<BTreeSet<String>> {
        let mut names = live_names.clone();
        names.retain(|name| {
            name != ".owner"
                && !self.is_archive_live_name(name)
                && !packed_wal::is_stage(name)
                && !pending.is_some_and(|names| names.contains(name))
        });
        names.extend(self.closed.iter().filter(|wal| wal.archived).map(packed_wal::selected_name));
        if names.len() > MAX_GENERATION_FILES {
            return Err(Error::Contract("generation capture count"));
        }
        Ok(names)
    }

    pub(super) fn capture_live_names(&self) -> Result<BTreeSet<String>> {
        fs::read_dir(&self.directory.path)?
            .map(|entry| {
                entry?
                    .file_name()
                    .into_string()
                    .map_err(|_| Error::Contract("generation capture filename"))
            })
            .collect()
    }

    pub(super) fn check_capture_names(
        &self,
        expected: BTreeSet<String>,
        pending: Option<&BTreeSet<String>>,
    ) -> Result<()> {
        let expected = expected.into_iter().chain(pending.into_iter().flatten().cloned()).collect();
        if self.capture_live_names()? != expected {
            return Err(Error::Contract("generation capture directory changed"));
        }
        self.verify_inventory()?;
        if pending.is_none() {
            self.directory.absent(".rotation.json")?;
        }
        Ok(())
    }
}
impl Log {
    pub(crate) fn capture_generation_files(&mut self) -> Result<GenerationFiles> {
        self.capture_generation_files_with_prefix(None)
    }

    pub(super) fn capture_generation_files_with_prefix(
        &mut self,
        active_prefix: Option<u64>,
    ) -> Result<GenerationFiles> {
        self.capture_selected_generation_files(active_prefix, None)
    }

    #[cfg(feature = "server")]
    pub(crate) fn recheck_pending_generation_rotation(&self, expected: [u8; 32]) -> Result<()> {
        self.ready()?;
        let observed = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no pending generation rotation"))?
            .inspect_pending_rotation(self)?;
        if observed.observation.evidence_sha256 != expected {
            return Err(Error::Contract("pending rotation changed during inspection"));
        }
        Ok(())
    }

    #[cfg(feature = "server")]
    pub(crate) fn capture_pending_generation_rotation(
        &mut self,
    ) -> Result<(GenerationFiles, super::PendingNativeLogRotation)> {
        self.ready()?;
        if self.has_incomplete_generation_tail()? {
            return Err(Error::Contract(
                "pending rotation inspection requires a complete active log",
            ));
        }
        let inspect = |log: &Self| {
            log.generations
                .as_ref()
                .ok_or(Error::Contract("original log has no pending generation rotation"))?
                .inspect_pending_rotation(log)
        };
        let before = inspect(self)?;
        let files = self.capture_selected_generation_files(None, Some(&before.excluded))?;
        if inspect(self)? != before {
            return Err(Error::Contract("pending rotation changed during inspection"));
        }
        Ok((files, before.observation))
    }

    fn capture_selected_generation_files(
        &mut self,
        active_prefix: Option<u64>,
        pending: Option<&BTreeSet<String>>,
    ) -> Result<GenerationFiles> {
        self.ready()?;
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no generation archive"))?;
        let result = state.capture_files(&self.file, active_prefix, pending).and_then(|files| {
            self.ready()?;
            if files.cut.records != self.next
                || files.cut.previous != self.previous
                || files.cut.manifest != state.current().hash
            {
                return Err(Error::Contract("generation capture held cut differs"));
            }
            Ok(files)
        });
        let reset = self.file.seek(SeekFrom::Start(self.bytes));
        match (result, reset) {
            (Ok(files), Ok(_)) => Ok(files),
            (Err(error), _) => {
                self.invalidate();
                Err(error)
            }
            (_, Err(error)) => {
                self.invalidate();
                Err(error.into())
            }
        }
    }
}
