//! Exact held-file capture into one backing buffer, retaining unpublished bytes without admission.
use super::{
    archive_sealed_wal::ARCHIVE_DIRECTORY,
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
        let active_name = format::wal_name(&self.current().value.active.generation);
        let mut entries = BTreeMap::new();
        let mut live_names = BTreeSet::new();
        let mut total = 0_u64;
        for entry in fs::read_dir(&self.directory.path)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("generation capture filename"))?;
            live_names.insert(name.clone());
            if name == ".owner"
                || name == ARCHIVE_DIRECTORY
                || pending.is_some_and(|names| names.contains(&name))
            {
                continue;
            }
            if packed_wal::is_stage(&name) {
                continue;
            }
            if entries.len() >= MAX_GENERATION_FILES {
                return Err(Error::Contract("generation capture count"));
            }
            let closed = self.closed_wal(&name);
            let handle = if let Some((held, _)) = closed {
                CaptureFile::Held(&held.file)
            } else if let Some(held) = self.selected_file(&name, active) {
                CaptureFile::Held(held)
            } else if name.starts_with(".stage-") {
                CaptureFile::Unpublished(File::open(entry.path())?)
            } else {
                return Err(Error::Contract("generation capture not held"));
            };
            let file = handle.file();
            let identity = FileIdentity::of(file)?;
            identity.guard(file, &entry.path())?;
            let length = file.metadata()?.len();
            let bytes = if let Some((_, metadata)) = closed {
                metadata.bytes
            } else if name == active_name {
                active_prefix.unwrap_or(length)
            } else {
                length
            };
            if closed.is_none() && bytes > length {
                return Err(Error::Contract("generation capture prefix exceeds source file"));
            }
            total = total.checked_add(bytes).ok_or(Error::Contract("generation capture bytes"))?;
            if total > MAX_GENERATION_BODY_BYTES {
                return Err(Error::Contract("generation capture byte budget"));
            }
            let stamp = FileStamp::of(file)?;
            entries.insert(name, (handle, identity, stamp, length, bytes));
        }
        for wal in self.closed.iter().filter(|wal| wal.archived) {
            let name = packed_wal::selected_name(wal);
            if entries.contains_key(&name) {
                continue;
            }
            self.guard_sealed_wal(wal)?;
            total =
                total.checked_add(wal.bytes).ok_or(Error::Contract("generation capture bytes"))?;
            entries.insert(
                name,
                (
                    CaptureFile::Held(&wal.file),
                    wal.identity,
                    wal.stamp,
                    wal.physical_bytes,
                    wal.bytes,
                ),
            );
        }
        if entries.len() > MAX_GENERATION_FILES {
            return Err(Error::Contract("generation capture count"));
        }
        // Reserve one bounded envelope prefix so the room codec can insert its header in place.
        let mut body = backing_buffer(total)?;
        let mut sections = Vec::new();
        for (name, (handle, identity, stamp, _, bytes)) in &mut entries {
            let mut file = handle.file();
            let offset = body.len() as u64;
            let copied = if let Some((wal, metadata)) = self.closed_wal(name) {
                wal.read(metadata.sha256, |reader| Ok(reader.read_to_end(&mut body)?))?
            } else {
                file.seek(SeekFrom::Start(0))?;
                file.by_ref().take(*bytes).read_to_end(&mut body)?
            };
            if copied as u64 != *bytes {
                return Err(Error::Contract("generation capture incomplete file"));
            }
            let path = match self.closed_wal(name) {
                Some((wal, _)) => self.sealed_wal_path(wal)?,
                None => self.directory.path.join(name),
            };
            identity.guard(file, &path)?;
            stamp.guard(file)?;
            sections.push(GenerationFileSection {
                name: name.clone(),
                offset,
                bytes: *bytes,
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
        for (name, (handle, identity, stamp, length, _)) in &entries {
            let file = handle.file();
            let path = match self.closed_wal(name) {
                Some((wal, _)) => self.sealed_wal_path(wal)?,
                None => self.directory.path.join(name),
            };
            identity.guard(file, &path)?;
            stamp.guard(file)?;
            if file.metadata()?.len() != *length {
                return Err(Error::Contract("generation capture source length changed"));
            }
        }
        self.check_capture_names(live_names, pending)?;
        Ok(GenerationFiles { body, sections, cut })
    }
    fn check_capture_names(
        &self,
        expected: BTreeSet<String>,
        pending: Option<&BTreeSet<String>>,
    ) -> Result<()> {
        let expected = expected.into_iter().chain(pending.into_iter().flatten().cloned()).collect();
        let current = fs::read_dir(&self.directory.path)?
            .map(|entry| {
                entry?
                    .file_name()
                    .into_string()
                    .map_err(|_| Error::Contract("generation capture filename"))
            })
            .collect::<Result<BTreeSet<_>>>()?;
        if current != expected {
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
