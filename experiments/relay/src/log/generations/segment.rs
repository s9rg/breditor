//! A separately selected, checkpoint-backed writable WAL segment.
mod restore;
use super::{
    directory::{Directory, DirectoryWitness},
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{Manifest, SegmentOrigin},
    publication,
    state::Generations,
};
use crate::{Error, RelaySegmentBaseFile, Result, log::Log};
use restore::{initial_segment, write_segment_root};
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    restore_floor: Option<[u8; 32]>,
    source: DirectoryWitness,
    target: DirectoryWitness,
    manifest: [u8; 32],
    base: [u8; 32],
}

#[derive(Clone)]
struct Handoff {
    path: PathBuf,
    file: Arc<File>,
    identity: FileIdentity,
    stamp: FileStamp,
    selection: Arc<Selection>,
}

impl Handoff {
    fn hold(path: PathBuf, file: File, base: &RelaySegmentBaseFile) -> Result<Self> {
        let identity = FileIdentity::of(&file)?;
        let stamp = FileStamp::of(&file)?;
        let selection: Selection = format::decode(&held_file::read(&file, format::MAX_CONTROL)?)?;
        if !matches!((selection.format_version, selection.restore_floor), (1, None) | (2, Some(_)))
            || selection.base != base.binding()
        {
            return Err(Error::Contract("relay segment predecessor selection differs"));
        }
        let marker =
            Self { path, file: Arc::new(file), identity, stamp, selection: Arc::new(selection) };
        marker.check()?;
        Ok(marker)
    }

    fn check(&self) -> Result<()> {
        self.identity.guard(&self.file, &self.path)?;
        self.stamp.guard(&self.file)
    }

    fn open(directory: &Directory, base: &RelaySegmentBaseFile) -> Result<Self> {
        let path = directory.path.join(SUCCESSOR);
        if !std::fs::symlink_metadata(&path)?.is_file() {
            return Err(Error::Contract("relay segment handoff marker type"));
        }
        let file = File::open(&path)?;
        let marker = Self::hold(path, file, base)?;
        directory.guard_witness(&marker.selection.source)?;
        directory.sync()?;
        Ok(marker)
    }
}

enum SegmentSelection {
    Handoff { ancestry: Vec<Handoff>, marker: Handoff },
    Restored { directory: DirectoryWitness, manifest: [u8; 32] },
}

pub(crate) struct SegmentCustody {
    selection: SegmentSelection,
    pub(super) base: Arc<RelaySegmentBaseFile>,
}

impl SegmentCustody {
    pub(super) fn check(&self) -> Result<()> {
        if let SegmentSelection::Handoff { ancestry, marker } = &self.selection {
            for ancestor in ancestry {
                ancestor.check()?;
            }
            marker.check()?;
        }
        self.base.check()
    }

    pub(super) fn verify(
        &self,
        directory: &Directory,
        initial: &Manifest,
        hash: [u8; 32],
    ) -> Result<()> {
        self.check()?;
        let (target, manifest) = match &self.selection {
            SegmentSelection::Handoff { marker, .. } => {
                (&marker.selection.target, marker.selection.manifest)
            }
            SegmentSelection::Restored { directory, manifest } => (directory, *manifest),
        };
        directory.guard_witness(target)?;
        if manifest != hash {
            return Err(Error::Contract("relay segment manifest differs from durable selection"));
        }
        let origin =
            initial.origin.as_ref().ok_or(Error::Contract("relay segment origin missing"))?;
        SegmentArchiveOrigin { base: &self.base }.verify(origin)
    }
}

/// The separately admitted predecessor of a raw suffix archive.
pub(crate) struct SegmentArchiveOrigin<'a> {
    pub(crate) base: &'a RelaySegmentBaseFile,
}

impl SegmentArchiveOrigin<'_> {
    pub(super) fn verify(&self, origin: &SegmentOrigin) -> Result<()> {
        let head = &self.base.identity().predecessor.source;
        if origin.root != self.base.root_generation()
            || origin.base != self.base.binding()
            || origin.first != head.records
            || origin.previous != head.terminal_log_digest
        {
            return Err(Error::Contract("generation archive predecessor origin differs"));
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

    pub(crate) fn check_segment_parent(&self, base: &RelaySegmentBaseFile) -> Result<()> {
        match (self.segment_base(), base.parent()) {
            (None, None) => Ok(()),
            (Some(current), Some(expected)) if current.binding() == expected.binding() => Ok(()),
            _ => Err(Error::Contract("relay segment archive parent differs")),
        }
    }

    pub(crate) fn prepare_segment(
        &self,
        path: &Path,
        base: &RelaySegmentBaseFile,
        generation_id: &str,
    ) -> Result<(Directory, [u8; 32])> {
        self.ready()?;
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        if state.contains_generation(generation_id) {
            return Err(Error::Contract("relay segment generation identity already used"));
        }
        let (manifest, bytes) = initial_segment(base, generation_id)?;
        let directory = Directory::create(path)?;
        write_segment_root(&directory, generation_id, manifest, &bytes)?;
        Ok((directory, manifest))
    }

    pub(crate) fn commit_segment(
        &mut self,
        target: &Directory,
        manifest: [u8; 32],
        base: Arc<RelaySegmentBaseFile>,
    ) -> Result<SegmentCustody> {
        self.ready()?;
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        state.directory.absent(SUCCESSOR)?;
        state.directory.absent(".rotation.json")?;
        base.check()?;
        let mut ancestry = Vec::new();
        let mut restore_floor = None;
        if let Some(previous) = &state.segment {
            match &previous.selection {
                SegmentSelection::Handoff { ancestry: earlier, marker } => {
                    ancestry.extend(earlier.iter().cloned());
                    ancestry.push(marker.clone());
                }
                SegmentSelection::Restored { .. } => restore_floor = Some(previous.base.binding()),
            }
        }
        let selection = Selection {
            format_version: if restore_floor.is_some() { 2 } else { 1 },
            restore_floor,
            source: state.directory.witness()?,
            target: target.witness()?,
            manifest,
            base: base.binding(),
        };
        let bytes = format::encode(&selection)?;
        self.poisoned = true;
        let marker = publication::insert(&state.directory, SUCCESSOR, &bytes)?;
        let marker = Handoff::hold(state.directory.path.join(SUCCESSOR), marker, &base)?;
        let custody =
            SegmentCustody { selection: SegmentSelection::Handoff { ancestry, marker }, base };
        custody.check()?;
        Ok(custody)
    }

    pub(crate) fn open_selected_segment(
        paths: &[&Path],
        base: Arc<RelaySegmentBaseFile>,
    ) -> Result<(Self, crate::Recovery)> {
        let mut bases: Vec<&RelaySegmentBaseFile> =
            std::iter::successors(Some(base.as_ref()), |part| part.parent()).collect();
        let (last, ancestors) = paths.split_last().ok_or(Error::NeedsRecovery)?;
        let skip = bases
            .len()
            .checked_sub(ancestors.len())
            .filter(|_| !ancestors.is_empty())
            .ok_or(Error::Contract("relay segment directory chain length differs"))?;
        bases.reverse();
        let floor = skip.checked_sub(1).map(|index| bases[index].binding());
        let mut markers: Vec<Handoff> = Vec::with_capacity(ancestors.len());
        for (index, (path, base)) in ancestors.iter().zip(bases.into_iter().skip(skip)).enumerate()
        {
            let directory = Directory::open(path)?;
            if let Some(parent) = markers.last() {
                directory.guard_witness(&parent.selection.target)?;
            }
            let marker = Handoff::open(&directory, base)?;
            let expected_floor = if index == 0 { floor } else { None };
            if marker.selection.restore_floor != expected_floor {
                return Err(Error::Contract("relay segment recovery floor differs"));
            }
            markers.push(marker);
        }
        let marker = markers.pop().ok_or(Error::NeedsRecovery)?;
        let directory = Directory::open(last)?;
        Self::open_segment_directory(
            directory,
            SegmentCustody {
                selection: SegmentSelection::Handoff { ancestry: markers, marker },
                base,
            },
        )
    }
}
