//! Resolve only the selected actual marker inode and its exact owned prefix.
use super::{
    super::{files, selection::Marker as RecoveryMarker},
    marker::{Intent, Marker},
};
use crate::{
    Error, Result, credentials,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{collections::BTreeSet, fs};

pub(super) struct Context {
    pub intent: Intent,
    pub marker: Marker,
    pub bytes: Vec<u8>,
    pub extra: BTreeSet<String>,
    pub committed: bool,
}
impl Context {
    pub fn read(directory: &GenerationDirectory, recovery: &RecoveryMarker) -> Result<Self> {
        directory.guard()?;
        let path = directory.path.join(".operation-intent.json");
        let file = fs::File::open(&path)?;
        let identity = GenerationFileWitness::of(&file)?;
        identity.guard(&file, &path)?;
        let intent: Intent = files::read(&path)?;
        identity.guard(&file, &path)?;
        credentials::hash(
            intent
                .stage
                .strip_prefix(".operation-data-")
                .ok_or(Error::Contract("operational generation stage name"))?,
        )?;
        if intent.format != "breditor/joined-generation-operation-intent"
            || intent.format_version != 1
            || intent.selection.recovery != recovery.id
            || intent.selection.source != recovery.identity
        {
            return Err(Error::Contract("operational generation intent selection differs"));
        }
        directory.guard_witness(&intent.selection.root)?;
        let marker = Marker {
            format: "breditor/joined-generation-operation".into(),
            format_version: 1,
            selection: intent.selection.clone(),
            intent: identity,
        };
        let bytes = files::encode(&marker)?;
        let mut extra = BTreeSet::from([
            ".operation-intent.json".into(),
            ".operational.json".into(),
            intent.stage.clone(),
        ]);
        let mut aliases = 0;
        for (count, entry) in fs::read_dir(&directory.path)?.enumerate() {
            if count >= crate::assets::MAX_ASSETS * 2 + 256 {
                return Err(Error::Contract("operational generation entry budget"));
            }
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("operational generation filename"))?;
            if let Some(nonce) = name.strip_prefix(".meta-") {
                credentials::hash(nonce)?;
                let alias = fs::File::open(entry.path())?;
                if GenerationFileWitness::of(&alias)? == identity {
                    identity.guard(&alias, &entry.path())?;
                    aliases += 1;
                    if aliases > 64 {
                        return Err(Error::Contract("operational intent alias budget"));
                    }
                    extra.insert(name);
                }
            }
        }
        let mut value = Self { intent, marker, bytes, extra, committed: false };
        value.committed = value.guard(directory)?;
        Ok(value)
    }
    /// All phase exclusions are validated actual owned files, never a generic name exemption.
    pub fn guard(&self, directory: &GenerationDirectory) -> Result<bool> {
        directory.guard_witness(&self.intent.selection.root)?;
        let path = directory.path.join(".operation-intent.json");
        let file = fs::File::open(&path)?;
        self.marker.intent.guard(&file, &path)?;
        let actual: Intent = files::read(&path)?;
        if files::encode(&actual)? != files::encode(&self.intent)? {
            return Err(Error::Contract("operational generation intent changed"));
        }
        self.marker.intent.guard(&file, &path)?;
        for name in self.extra.iter().filter(|name| name.starts_with(".meta-")) {
            let path = directory.path.join(name);
            self.marker.intent.guard(&fs::File::open(&path)?, &path)?;
        }
        let stage = directory.path.join(&self.intent.stage);
        let target = directory.path.join(".operational.json");
        let staged = files::exists(&stage)?;
        let published = files::exists(&target)?;
        let source = if staged {
            &stage
        } else if published {
            &target
        } else {
            return Err(Error::Contract("operational generation owned marker absent"));
        };
        let mut file = files::open(source)?;
        self.intent.witness.guard(&file, source)?;
        if published {
            self.intent.witness.guard(&file, &target)?;
        }
        files::compare(&mut file, &self.bytes, !published)?;
        directory.guard()?;
        Ok(published)
    }
}
