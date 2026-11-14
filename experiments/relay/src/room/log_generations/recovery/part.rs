//! Per-file durable inode intents precede data writes and insert-only final hard links.
use super::super::recovery_part::RecoveryPart;
use super::{
    ServerLogGenerationRecovery, files,
    types::{Component, Part},
};
use crate::{
    Error, Result, credentials,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{fs, path::PathBuf};
pub(super) fn ledger(name: &str) -> String {
    format!(".part-{}.json", files::key(name))
}
impl ServerLogGenerationRecovery {
    pub(super) fn part(
        &self,
        component: &Component,
        name: &str,
        bytes: RecoveryPart<'_>,
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
            || value.bytes != bytes.len()
            || value.sha256 != bytes.sha256
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
        expected: RecoveryPart<'_>,
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
        expected.compare(&mut file, !published)?;
        Ok(published)
    }
    fn new_part(
        &self,
        component: &Component,
        inner: &GenerationDirectory,
        name: &str,
        expected: RecoveryPart<'_>,
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
            bytes: expected.len(),
            sha256: expected.sha256,
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
        expected: RecoveryPart<'_>,
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
        let length = expected.compare(&mut file, !published)?;
        if !published {
            #[cfg(test)]
            if self.stop_after == Some(super::interruption::RestorePoint::DataPrefix) {
                expected.append(&mut file, length, (expected.len() - length).min(1))?;
                file.sync_all()?;
                self.interrupt(super::interruption::RestorePoint::DataPrefix)?;
            }
            expected.append(&mut file, length, expected.len() - length)?;
            file.sync_all()?;
            expected.compare(&mut file, false)?;
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
