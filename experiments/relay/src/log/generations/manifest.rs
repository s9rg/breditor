//! Canonical immutable layout lineage. Logical event cuts remain absolute across physical files.
use super::{format, options::generation};
use crate::{Error, Result, log::frame};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub(super) const SEEDED_ROOT_VERSION: u32 = 1;
pub(super) const ORIGINAL_ROOT_VERSION: u32 = 2;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ClosedFile {
    pub generation: String,
    pub first: u64,
    pub records: u64,
    pub previous: [u8; 32],
    pub terminal: [u8; 32],
    pub bytes: u64,
    pub sha256: [u8; 32],
}
impl ClosedFile {
    pub fn next(&self) -> Result<u64> {
        self.first.checked_add(self.records).ok_or(Error::Contract("log global sequence"))
    }
    fn validate(&self) -> Result<()> {
        generation(&self.generation)?;
        if self.records == 0
            || self.records > super::super::MAX_RECORDS
            || self.bytes < self.records * super::super::HEADER
            || self.bytes > super::super::MAX_LOG
        {
            return Err(Error::Contract("closed log file bounds"));
        }
        self.next()?;
        Ok(())
    }
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ActiveFile {
    pub generation: String,
    pub first: u64,
    pub previous: [u8; 32],
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub parent: Option<[u8; 32]>,
    pub root: ClosedFile,
    pub sealed: Vec<ClosedFile>,
    pub active: ActiveFile,
}
impl Manifest {
    pub fn validate(&self) -> Result<()> {
        if self.format != "breditor/relay-log-generations"
            || !matches!(self.format_version, SEEDED_ROOT_VERSION | ORIGINAL_ROOT_VERSION)
            || self.sealed.len() + 2 > format::MAX_GENERATIONS
            || self.parent.is_some() == self.sealed.is_empty()
            || self.root.first != 0
            || self.root.previous != [0; 32]
        {
            return Err(Error::Contract("log generation manifest family"));
        }
        let mut ids = BTreeSet::new();
        let mut next = 0;
        let mut previous = [0; 32];
        let mut bytes = 0_u64;
        for file in std::iter::once(&self.root).chain(&self.sealed) {
            file.validate()?;
            if !ids.insert(&file.generation) || file.first != next || file.previous != previous {
                return Err(Error::Contract("log generation manifest lineage"));
            }
            bytes = bytes.checked_add(file.bytes).ok_or(Error::Contract("log generation bytes"))?;
            next = file.next()?;
            previous = file.terminal;
        }
        generation(&self.active.generation)?;
        if !ids.insert(&self.active.generation)
            || self.active.first != next
            || self.active.previous != previous
            || bytes > format::MAX_WAL_BYTES
        {
            return Err(Error::Contract("log generation active lineage"));
        }
        Ok(())
    }
    pub fn follows(&self, parent: &Self, hash: [u8; 32]) -> Result<()> {
        self.validate()?;
        if self.parent != Some(hash)
            || self.format_version != parent.format_version
            || self.root != parent.root
            || self.sealed.len() != parent.sealed.len() + 1
            || !self.sealed.starts_with(&parent.sealed)
        {
            return Err(Error::Contract("log physical manifest ancestry"));
        }
        let sealed = self.sealed.last().ok_or(Error::Contract("log seal absent"))?;
        if sealed.generation != parent.active.generation
            || sealed.first != parent.active.first
            || sealed.previous != parent.active.previous
        {
            return Err(Error::Contract("log physical seal differs from parent"));
        }
        Ok(())
    }
    /// Only the imported root uses original framing. Every later WAL remains a continuation.
    pub(super) fn closed_files(&self) -> impl Iterator<Item = (&ClosedFile, frame::Family)> {
        let root = if self.format_version == ORIGINAL_ROOT_VERSION {
            frame::Family::Original
        } else {
            frame::Family::Continuation
        };
        std::iter::once((&self.root, root))
            .chain(self.sealed.iter().map(|file| (file, frame::Family::Continuation)))
    }
    pub fn closed_bytes(&self) -> u64 {
        self.root.bytes + self.sealed.iter().map(|file| file.bytes).sum::<u64>()
    }
    pub fn contains(&self, id: &str) -> bool {
        self.root.generation == id
            || self.active.generation == id
            || self.sealed.iter().any(|file| file.generation == id)
    }
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Head {
    pub format: String,
    pub format_version: u32,
    pub manifest: [u8; 32],
}
impl Head {
    pub fn new(manifest: [u8; 32]) -> Self {
        Self { format: "breditor/relay-log-head".into(), format_version: 1, manifest }
    }
    pub fn validate(&self) -> Result<()> {
        if self.format != "breditor/relay-log-head" || self.format_version != 1 {
            return Err(Error::Contract("log physical head family"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Ready {
    pub format: String,
    pub format_version: u32,
    pub root_manifest: [u8; 32],
}
impl Ready {
    pub fn new(root_manifest: [u8; 32]) -> Self {
        Self {
            format: "breditor/relay-log-generation-ready".into(),
            format_version: 1,
            root_manifest,
        }
    }
    pub fn validate(&self, root_manifest: [u8; 32]) -> Result<()> {
        if self.format != "breditor/relay-log-generation-ready"
            || self.format_version != 1
            || self.root_manifest != root_manifest
        {
            return Err(Error::Contract("physical log readiness differs"));
        }
        Ok(())
    }
}
