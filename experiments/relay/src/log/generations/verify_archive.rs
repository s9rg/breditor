//! Stream a selected archive against actual held files, without another full source allocation.
use super::{
    format,
    held_file::{FileIdentity, FileStamp},
    state::Generations,
};
use crate::{Error, Result, log::Log};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
};

fn compare(mut file: &File, expected: &[u8], prefix: bool) -> Result<bool> {
    let length = file.metadata()?.len();
    if length < expected.len() as u64 || !prefix && length != expected.len() as u64 {
        return Ok(false);
    }
    file.seek(SeekFrom::Start(0))?;
    let mut buffer = [0_u8; 8192];
    for block in expected.chunks(buffer.len()) {
        file.read_exact(&mut buffer[..block.len()])?;
        if &buffer[..block.len()] != block {
            return Ok(false);
        }
    }
    Ok(true)
}
fn names(state: &Generations) -> Result<BTreeSet<String>> {
    let values = fs::read_dir(&state.directory.path)?
        .map(|entry| {
            entry?.file_name().into_string().map_err(|_| Error::Contract("archive source filename"))
        })
        .collect::<Result<BTreeSet<_>>>()?;
    if values.len() > super::closure::MAX_GENERATION_FILES + 1 {
        return Err(Error::Contract("archive source file count"));
    }
    Ok(values)
}
impl Generations {
    fn compare_archive(
        &self,
        active: &File,
        expected: &BTreeMap<&str, &[u8]>,
        manifest: [u8; 32],
        retained: bool,
    ) -> Result<bool> {
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        self.verify_retained()?;
        let Some(selected) = self.history.iter().find(|held| held.hash == manifest) else {
            return Ok(false);
        };
        if !retained && self.current().hash != manifest {
            return Ok(false);
        }
        let original_active = format::wal_name(&selected.value.active.generation);
        let inventory = names(self)?;
        let exact_names = expected
            .keys()
            .map(|name| (*name).to_owned())
            .chain(std::iter::once(".owner".into()))
            .collect::<BTreeSet<_>>();
        let mut matches = retained || inventory == exact_names;
        let mut witnesses = Vec::new();
        for (name, bytes) in expected {
            if retained && *name == ".head.json" {
                continue;
            }
            if !inventory.contains(*name) {
                matches = false;
                continue;
            }
            let owned;
            let file = if let Some(file) = self.selected_file(name, active) {
                file
            } else {
                if !name.starts_with(".stage-") {
                    return Err(Error::Contract("archive source not held"));
                }
                owned = File::open(self.directory.path.join(name))?;
                &owned
            };
            let identity = FileIdentity::of(file)?;
            let stamp = FileStamp::of(file)?;
            identity.guard(file, &self.directory.path.join(name))?;
            matches &= compare(file, bytes, retained && *name == original_active)?;
            stamp.guard(file)?;
            identity.guard(file, &self.directory.path.join(name))?;
            witnesses.push((name, identity, stamp, file.metadata()?.len()));
        }
        for (name, identity, stamp, length) in witnesses {
            let owned;
            let file = if let Some(file) = self.selected_file(name, active) {
                file
            } else {
                owned = File::open(self.directory.path.join(name))?;
                &owned
            };
            identity.guard(file, &self.directory.path.join(name))?;
            stamp.guard(file)?;
            if file.metadata()?.len() != length {
                return Err(Error::Contract("archive source changed during read"));
            }
        }
        if names(self)? != inventory {
            return Err(Error::Contract("archive source inventory changed during read"));
        }
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        Ok(matches)
    }
}
impl Log {
    pub(crate) fn verify_generation_archive(
        &mut self,
        expected: &BTreeMap<&str, &[u8]>,
        manifest: [u8; 32],
        retained: bool,
    ) -> Result<bool> {
        self.ready()?;
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no physical archive selection"))?;
        let result =
            state.compare_archive(&self.file, expected, manifest, retained).and_then(|matches| {
                self.ready()?;
                Ok(matches)
            });
        let reset = self.file.seek(SeekFrom::Start(self.bytes));
        match (result, reset) {
            (Ok(matches), Ok(_)) => Ok(matches),
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
