//! Exact inactive-prefix inventory. Unknown work is preserved and refused, never scavenged.
use super::super::ServerLogGenerationBackup;
use super::{
    ServerLogGenerationRecovery, ServerLogGenerationRecoveryProgress, files, part,
    types::{Component, Marker},
};
use crate::{
    Error, Result, credentials,
    log::generations::{GenerationDirectory, GenerationFileWitness, MAX_GENERATION_FILES},
};
use std::{collections::BTreeSet, fs};
impl ServerLogGenerationRecovery {
    pub(super) fn completion(&self) -> Marker {
        Marker {
            format: "breditor/relay-log-generation-recovery-complete".into(),
            format_version: 1,
            id: self.marker.id.clone(),
            identity: self.marker.identity.clone(),
        }
    }
    fn marker_guard(&self, backup: &ServerLogGenerationBackup) -> Result<()> {
        self.directory.guard()?;
        if backup.info().identity != self.marker.identity {
            return Err(Error::Contract("generation recovery selected source changed"));
        }
        let actual: Marker = files::read(&self.directory.path.join(".recovery.json"))?;
        if files::encode(&actual)? != files::encode(&self.marker)? {
            return Err(Error::Contract("generation recovery marker changed"));
        }
        Ok(())
    }
    fn unselected_component(path: &std::path::Path) -> Result<()> {
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.is_dir() {
            return Err(Error::Contract("unselected recovery component type"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.mode() & 0o077 != 0 {
                return Err(Error::Contract("unselected recovery component privacy"));
            }
        }
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let metadata = fs::symlink_metadata(entry.path())?;
            if entry.file_name() != ".owner" || !metadata.is_file() || metadata.len() > 256 {
                return Err(Error::Contract("unselected recovery component has unknown work"));
            }
            let file = fs::File::open(entry.path())?;
            GenerationFileWitness::of(&file)?.guard(&file, &entry.path())?;
        }
        Ok(())
    }
    fn outer_inventory(
        &self,
        component: Option<&Component>,
        known: &BTreeSet<String>,
    ) -> Result<()> {
        let mut count = 0;
        let mut orphans = 0;
        let mut bytes = 0_u64;
        for entry in fs::read_dir(&self.directory.path)? {
            count += 1;
            if count > MAX_GENERATION_FILES * 3 + 136 {
                return Err(Error::Contract("generation recovery entry budget"));
            }
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("generation recovery filename"))?;
            if component.is_some_and(|value| value.directory == name) {
                continue;
            }
            if let Some(nonce) = name.strip_prefix(".room-") {
                credentials::hash(nonce)?;
                orphans += 1;
                Self::unselected_component(&entry.path())?;
                continue;
            }
            let metadata = fs::symlink_metadata(entry.path())?;
            if !metadata.is_file() {
                return Err(Error::Contract("generation recovery entry type"));
            }
            let file = fs::File::open(entry.path())?;
            GenerationFileWitness::of(&file)?.guard(&file, &entry.path())?;
            if known.contains(&name) {
                continue;
            }
            if let Some(nonce) = name.strip_prefix(".data-") {
                credentials::hash(nonce)?;
                if metadata.len() != 0 {
                    return Err(Error::Contract("unselected recovery data is not empty"));
                }
            } else if let Some(nonce) = name.strip_prefix(".meta-") {
                credentials::hash(nonce)?;
                if metadata.len() > files::MAX_CONTROL {
                    return Err(Error::Contract("unselected recovery metadata bytes"));
                }
            } else {
                return Err(Error::Contract("generation recovery unknown work"));
            }
            orphans += 1;
            bytes += metadata.len();
        }
        if orphans > 64 || bytes > files::MAX_CONTROL * 64 {
            return Err(Error::Contract("generation recovery orphan budget"));
        }
        self.directory.guard()
    }
    fn inner_inventory(inner: &GenerationDirectory, names: &BTreeSet<String>) -> Result<()> {
        for entry in fs::read_dir(&inner.path)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("generation recovery component filename"))?;
            if !names.contains(&name) || !fs::symlink_metadata(entry.path())?.is_file() {
                return Err(Error::Contract("generation recovery component has unknown work"));
            }
        }
        inner.guard()
    }
    /// Inspect exact owned prefixes without changing, replaying or publishing native history.
    /// # Errors
    /// Wrong source, custody, unknown work, divergent/occupied files and premature completion refuse.
    pub fn progress(
        &self,
        backup: &ServerLogGenerationBackup,
    ) -> Result<ServerLogGenerationRecoveryProgress> {
        self.marker_guard(backup)?;
        let selected = backup.selected_files()?;
        let component = self.component()?;
        let mut known = BTreeSet::from([
            ".owner".into(),
            ".recovery.json".into(),
            ".component.json".into(),
            ".complete.json".into(),
        ]);
        let mut published = 0;
        let mut ready = false;
        if let Some(value) = &component {
            let inner = self.open_component(value)?;
            let mut inner_names = BTreeSet::from([".owner".into(), ".ready.json".into()]);
            for (name, bytes) in &selected {
                known.insert(part::ledger(name));
                inner_names.insert(files::target(name).into());
                if let Some(part) = self.part(value, name, bytes)? {
                    known.insert(part.stage.clone());
                    if self.part_progress(&inner, &part, bytes)? {
                        published += 1;
                    }
                } else if files::exists(&inner.path.join(files::target(name)))?
                    || *name == ".ready.json" && files::exists(&inner.path.join(".ready.json"))?
                {
                    return Err(Error::Contract("generation recovery unowned occupied file"));
                }
            }
            Self::inner_inventory(&inner, &inner_names)?;
            ready = files::exists(&inner.path.join(".ready.json"))?;
        }
        self.outer_inventory(component.as_ref(), &known)?;
        let complete = files::exists(&self.directory.path.join(".complete.json"))?;
        if complete {
            let mark: Marker = files::read(&self.directory.path.join(".complete.json"))?;
            if files::encode(&mark)? != files::encode(&self.completion())?
                || !ready
                || published != selected.len()
            {
                return Err(Error::Contract("generation recovery incomplete completion"));
            }
        }
        Ok(ServerLogGenerationRecoveryProgress {
            component_selected: component.is_some(),
            files_published: published,
            files_total: selected.len(),
            native_ready: ready,
            completion_record: complete,
        })
    }
}
