//! A separately selected, checkpoint-backed writable WAL segment.
use super::{
    directory::{Directory, DirectoryWitness},
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{ActiveFile, Manifest, Ready, SEGMENT_ROOT_VERSION, SegmentOrigin},
    options::generation,
    publication,
    state::Generations,
};
use crate::{Error, RelaySegmentBaseFile, Result, log::Log};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::Arc,
};

pub(super) const SUCCESSOR: &str = ".segment-successor.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    format_version: u32,
    source: DirectoryWitness,
    target: DirectoryWitness,
    manifest: [u8; 32],
    base: [u8; 32],
}

pub(crate) struct SegmentCustody {
    path: PathBuf,
    file: File,
    identity: FileIdentity,
    stamp: FileStamp,
    selection: Selection,
    pub(super) base: Arc<RelaySegmentBaseFile>,
}

impl SegmentCustody {
    fn hold(path: PathBuf, file: File, base: Arc<RelaySegmentBaseFile>) -> Result<Self> {
        let identity = FileIdentity::of(&file)?;
        let stamp = FileStamp::of(&file)?;
        let selection: Selection = format::decode(&held_file::read(&file, format::MAX_CONTROL)?)?;
        let custody = Self { path, file, identity, stamp, selection, base };
        if custody.selection.format_version != 1
            || custody.selection.base != custody.base.binding()?
        {
            return Err(Error::Contract("relay segment predecessor selection differs"));
        }
        custody.check()?;
        Ok(custody)
    }

    pub(super) fn check(&self) -> Result<()> {
        self.identity.guard(&self.file, &self.path)?;
        self.stamp.guard(&self.file)?;
        self.base.check()
    }

    pub(super) fn verify(
        &self,
        directory: &Directory,
        initial: &Manifest,
        hash: [u8; 32],
    ) -> Result<()> {
        self.check()?;
        directory.guard_witness(&self.selection.target)?;
        let origin =
            initial.origin.as_ref().ok_or(Error::Contract("relay segment origin missing"))?;
        let source = &self.base.identity().predecessor.source;
        if self.selection.manifest != hash
            || origin.base != self.selection.base
            || origin.first != source.records
            || origin.previous != source.terminal_log_digest
        {
            return Err(Error::Contract("relay segment manifest differs from durable selection"));
        }
        Ok(())
    }
}

impl Generations {
    pub(super) fn root_id(&self) -> &str {
        let manifest = &self.current().value;
        manifest.origin.as_ref().map_or_else(
            || &manifest.root.as_ref().expect("admitted generation root").generation,
            |origin| &origin.root,
        )
    }

    pub(in crate::log) fn segment_first(&self) -> u64 {
        self.current().value.origin.as_ref().map_or(0, |origin| origin.first)
    }

    pub(super) fn contains_generation(&self, name: &str) -> bool {
        self.current().value.contains(name)
            || self
                .segment
                .as_ref()
                .is_some_and(|segment| segment.base.contains_section(&format::wal_name(name)))
    }
}

impl Log {
    pub(super) fn check_legacy_generation_archive(&self) -> Result<()> {
        match &self.generations {
            Some(state) if state.segment.is_none() => Ok(()),
            Some(_) => Err(Error::Contract("writable relay segment needs a linked backup")),
            None => Err(Error::Contract("original log has no generation archive")),
        }
    }

    pub(crate) fn segment_base(&self) -> Option<&RelaySegmentBaseFile> {
        self.generations.as_ref()?.segment.as_ref().map(|value| value.base.as_ref())
    }

    pub(crate) fn prepare_segment(
        &self,
        path: &Path,
        base: &RelaySegmentBaseFile,
        generation_id: &str,
    ) -> Result<(Directory, [u8; 32])> {
        self.ready()?;
        self.check_legacy_generation_archive()?;
        generation(generation_id)?;
        base.check()?;
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        if state.contains_generation(generation_id) {
            return Err(Error::Contract("relay segment generation identity already used"));
        }
        let base = base.binding()?;
        let manifest = Manifest {
            format: "breditor/relay-log-generations".into(),
            format_version: SEGMENT_ROOT_VERSION,
            parent: None,
            root: None,
            origin: Some(SegmentOrigin {
                root: state.root_id().to_owned(),
                first: self.next,
                previous: self.previous,
                base,
            }),
            sealed: Vec::new(),
            active: ActiveFile {
                generation: generation_id.to_owned(),
                first: self.next,
                previous: self.previous,
            },
        };
        manifest.validate()?;
        let bytes = format::encode(&manifest)?;
        let hash = format::sha(&bytes);
        let directory = Directory::create(path)?;
        directory.create_file(&format::wal_name(generation_id), &[])?;
        directory.immutable(&format::manifest_name(&hash), &bytes)?;
        directory.create_file(".head.json", &Generations::head_bytes(hash)?)?;
        directory.create_file(".ready.json", &format::encode(&Ready::new(hash))?)?;
        directory.guard()?;
        Ok((directory, hash))
    }

    pub(crate) fn commit_segment(
        &mut self,
        target: &Directory,
        manifest: [u8; 32],
        base: Arc<RelaySegmentBaseFile>,
    ) -> Result<SegmentCustody> {
        self.ready()?;
        self.check_legacy_generation_archive()?;
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        state.directory.absent(SUCCESSOR)?;
        state.directory.absent(".rotation.json")?;
        base.check()?;
        let selection = Selection {
            format_version: 1,
            source: state.directory.witness()?,
            target: target.witness()?,
            manifest,
            base: base.binding()?,
        };
        let bytes = format::encode(&selection)?;
        self.poisoned = true;
        let marker = publication::insert(&state.directory, SUCCESSOR, &bytes)?;
        SegmentCustody::hold(state.directory.path.join(SUCCESSOR), marker, base)
    }

    pub(crate) fn open_selected_segment(
        predecessor: &Path,
        path: &Path,
        base: Arc<RelaySegmentBaseFile>,
    ) -> Result<(Self, crate::Recovery)> {
        // Hold the old directory lease while selecting its durable marker and the child.
        // Release it after the successor is anchored to the actual marker inode.
        let predecessor = Directory::open(predecessor)?;
        let marker_path = predecessor.path.join(SUCCESSOR);
        let metadata = std::fs::symlink_metadata(&marker_path)?;
        if !metadata.is_file() {
            return Err(Error::Contract("relay segment handoff marker type"));
        }
        let marker = File::open(&marker_path)?;
        let custody = SegmentCustody::hold(marker_path, marker, base)?;
        predecessor.guard_witness(&custody.selection.source)?;
        let directory = Directory::open(path)?;
        let result = Self::open_segment_directory(directory, custody)?;
        predecessor.guard()?;
        predecessor.sync()?;
        Ok(result)
    }
}
