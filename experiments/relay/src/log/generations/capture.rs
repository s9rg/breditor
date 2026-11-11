//! Exact held-file capture into one backing buffer, retaining unpublished bytes without admission.
use super::{
    closure::{self, GenerationCut, MAX_GENERATION_BODY_BYTES, MAX_GENERATION_FILES},
    format,
    held_file::{FileIdentity, FileStamp},
    state::Generations,
};
use crate::{Error, Result, log::Log};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
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
                .or_else(|| {
                    self.closed
                        .iter()
                        .find(|held| name == format::wal_name(&held.generation))
                        .map(|held| &held.file)
                })
        }
    }
    fn capture_files(&self, active: &File, active_prefix: Option<u64>) -> Result<GenerationFiles> {
        if self.ready_name != ".ready.json" {
            return Err(Error::Contract("generation source is not published"));
        }
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        self.verify_retained()?;
        let active_name = format::wal_name(&self.current().value.active.generation);
        let mut entries = BTreeMap::new();
        let mut total = 0_u64;
        for entry in fs::read_dir(&self.directory.path)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("generation capture filename"))?;
            if name == ".owner" {
                continue;
            }
            if entries.len() >= MAX_GENERATION_FILES {
                return Err(Error::Contract("generation capture count"));
            }
            let handle = if let Some(held) = self.selected_file(&name, active) {
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
            let bytes = if name == active_name { active_prefix.unwrap_or(length) } else { length };
            if bytes > length {
                return Err(Error::Contract("generation capture prefix exceeds source file"));
            }
            total = total.checked_add(bytes).ok_or(Error::Contract("generation capture bytes"))?;
            if total > MAX_GENERATION_BODY_BYTES {
                return Err(Error::Contract("generation capture byte budget"));
            }
            let stamp = FileStamp::of(file)?;
            entries.insert(name, (handle, identity, stamp, length, bytes));
        }
        // Reserve one bounded envelope prefix so the room codec can insert its header in place.
        let mut body = backing_buffer(total)?;
        let mut sections = Vec::new();
        for (name, (handle, identity, stamp, _, bytes)) in &mut entries {
            let mut file = handle.file();
            let offset = body.len() as u64;
            file.seek(SeekFrom::Start(0))?;
            let copied = file.by_ref().take(*bytes).read_to_end(&mut body)?;
            if copied as u64 != *bytes {
                return Err(Error::Contract("generation capture incomplete file"));
            }
            identity.guard(file, &self.directory.path.join(name))?;
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
            identity.guard(file, &self.directory.path.join(name))?;
            stamp.guard(file)?;
            if file.metadata()?.len() != *length {
                return Err(Error::Contract("generation capture source length changed"));
            }
        }
        let current = fs::read_dir(&self.directory.path)?
            .map(|entry| {
                entry?
                    .file_name()
                    .into_string()
                    .map_err(|_| Error::Contract("generation capture filename"))
            })
            .collect::<Result<std::collections::BTreeSet<_>>>()?;
        let expected = entries.keys().cloned().chain(std::iter::once(".owner".into())).collect();
        if current != expected {
            return Err(Error::Contract("generation capture directory changed"));
        }
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        Ok(GenerationFiles { body, sections, cut })
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
        self.ready()?;
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no generation archive"))?;
        let result = state.capture_files(&self.file, active_prefix).and_then(|files| {
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
