//! Per-file durable inode intents precede data writes and insert-only final hard links.
use super::{
    ServerLogGenerationRecovery, files,
    types::{Component, Part},
};
use crate::{
    Error, Result, credentials,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{
    fs,
    io::{Seek, SeekFrom, Write},
    path::PathBuf,
};
pub(super) fn ledger(name: &str) -> String {
    format!(".part-{}.json", files::key(name))
}
impl ServerLogGenerationRecovery {
    pub(super) fn part(
        &self,
        component: &Component,
        name: &str,
        bytes: &[u8],
    ) -> Result<Option<Part>> {
        let path = self.directory.path.join(ledger(name));
        if !files::exists(&path)? {
            return Ok(None);
        }
        let value: Part = files::read(&path)?;
        let nonce = value
            .stage
            .strip_prefix(".data-")
            .ok_or(Error::Contract("generation recovery stage name"))?;
        credentials::hash(nonce)?;
        if value.format != "breditor/relay-generation-recovery-part"
            || value.format_version != 1
            || value.recovery != self.marker.id
            || value.directory != component.directory
            || value.name != name
            || value.target != files::target(name)
            || value.bytes != bytes.len() as u64
            || value.sha256 != files::sha(bytes)
        {
            return Err(Error::Contract("generation recovery part selection"));
        }
        Ok(Some(value))
    }
    fn part_target(inner: &GenerationDirectory, part: &Part) -> Result<PathBuf> {
        let target = inner.path.join(&part.target);
        if part.name == ".ready.json"
            && !files::exists(&target)?
            && files::exists(&inner.path.join(".ready.json"))?
        {
            return Ok(inner.path.join(".ready.json"));
        }
        Ok(target)
    }
    pub(super) fn part_progress(
        &self,
        inner: &GenerationDirectory,
        part: &Part,
        expected: &[u8],
    ) -> Result<bool> {
        let target = Self::part_target(inner, part)?;
        let stage = self.directory.path.join(&part.stage);
        let published = files::exists(&target)?;
        let source = if files::exists(&stage)? {
            &stage
        } else if published {
            &target
        } else {
            return Err(Error::Contract("generation recovery owned part missing"));
        };
        let mut file = files::open(source)?;
        part.witness.guard(&file, source)?;
        if published {
            part.witness.guard(&file, &target)?;
        }
        if part.name == ".ready.json" && files::exists(&inner.path.join(".ready.json"))? {
            part.witness.guard(&file, &inner.path.join(".ready.json"))?;
        }
        files::compare(&mut file, expected, !published)?;
        Ok(published)
    }
    fn new_part(
        &self,
        component: &Component,
        inner: &GenerationDirectory,
        name: &str,
        expected: &[u8],
    ) -> Result<Part> {
        inner.absent(files::target(name))?;
        if name == ".ready.json" {
            inner.absent(".ready.json")?;
        }
        let stage = format!(".data-{}", credentials::issue()?);
        let file = self.directory.create_file(&stage, &[])?;
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::StageCreated)?;
        let part = Part {
            format: "breditor/relay-generation-recovery-part".into(),
            format_version: 1,
            recovery: self.marker.id.clone(),
            directory: component.directory.clone(),
            name: name.into(),
            target: files::target(name).into(),
            bytes: expected.len() as u64,
            sha256: files::sha(expected),
            stage,
            witness: GenerationFileWitness::of(&file)?,
        };
        files::insert(&self.directory, &ledger(name), &files::encode(&part)?)?;
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::PartSelected)?;
        Ok(part)
    }
    pub(super) fn restore_part(
        &self,
        component: &Component,
        inner: &GenerationDirectory,
        name: &str,
        expected: &[u8],
    ) -> Result<()> {
        self.directory.guard()?;
        inner.guard_witness(&component.witness)?;
        let part = if let Some(part) = self.part(component, name, expected)? {
            part
        } else {
            self.new_part(component, inner, name, expected)?
        };
        let target = Self::part_target(inner, &part)?;
        let stage = self.directory.path.join(&part.stage);
        let stage_exists = files::exists(&stage)?;
        let published = files::exists(&target)?;
        let source = if stage_exists {
            &stage
        } else if published {
            &target
        } else {
            return Err(Error::Contract("generation recovery owned part missing"));
        };
        let mut file = files::open(source)?;
        part.witness.guard(&file, source)?;
        if published {
            part.witness.guard(&file, &target)?;
        }
        files::compare(&mut file, expected, !published)?;
        if !published {
            let length = usize::try_from(file.metadata()?.len())
                .map_err(|_| Error::Contract("generation recovery part length"))?;
            file.seek(SeekFrom::End(0))?;
            #[cfg(test)]
            if self.stop_after == Some(super::interruption::RestorePoint::DataPrefix) {
                file.write_all(&expected[length..(length + 1).min(expected.len())])?;
                file.sync_all()?;
                self.interrupt(super::interruption::RestorePoint::DataPrefix)?;
            }
            file.write_all(
                expected.get(length..).ok_or(Error::Contract("generation recovery part length"))?,
            )?;
            file.sync_all()?;
            files::compare(&mut file, expected, false)?;
            #[cfg(test)]
            self.interrupt(super::interruption::RestorePoint::DataSynced)?;
            self.directory.guard()?;
            inner.guard_witness(&component.witness)?;
            part.witness.guard(&file, &stage)?;
            fs::hard_link(&stage, &target)?;
            inner.sync()?;
            #[cfg(test)]
            self.interrupt(super::interruption::RestorePoint::FilePublished)?;
        }
        part.witness.guard(&file, &target)?;
        if stage_exists {
            part.witness.guard(&file, &stage)?;
            fs::remove_file(stage)?;
            self.directory.sync()?;
            #[cfg(test)]
            self.interrupt(super::interruption::RestorePoint::StageRetired)?;
        }
        Ok(())
    }
}
