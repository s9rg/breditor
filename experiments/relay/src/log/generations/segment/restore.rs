//! Deterministic physical root and fresh local custody for a portable recovery.
use super::super::{
    directory::{Directory, DirectoryWitness},
    format,
    manifest::{ActiveFile, Manifest, Ready, SEGMENT_ROOT_VERSION, SegmentOrigin},
    options::generation,
    state::Generations,
};
use super::{SegmentCustody, SegmentSelection};
use crate::{Error, RelaySegmentBaseFile, Result, log::Log};
use std::{path::Path, sync::Arc};

/// Deterministic fresh physical root at the newest admitted archive position.
pub(super) fn initial_segment(
    base: &RelaySegmentBaseFile,
    generation_id: &str,
) -> Result<([u8; 32], Vec<u8>)> {
    generation(generation_id)?;
    base.check()?;
    if base.contains_section(&format::wal_name(generation_id)) {
        return Err(Error::Contract("relay segment generation identity already used"));
    }
    let source = &base.identity().predecessor.source;
    let manifest = Manifest {
        format: "breditor/relay-log-generations".into(),
        format_version: SEGMENT_ROOT_VERSION,
        parent: None,
        root: None,
        origin: Some(SegmentOrigin {
            root: base.root_generation().to_owned(),
            first: source.records,
            previous: source.terminal_log_digest,
            base: base.binding(),
        }),
        sealed: Vec::new(),
        active: ActiveFile {
            generation: generation_id.to_owned(),
            first: source.records,
            previous: source.terminal_log_digest,
        },
    };
    manifest.validate()?;
    let bytes = format::encode(&manifest)?;
    Ok((format::sha(&bytes), bytes))
}

pub(super) fn write_segment_root(
    directory: &Directory,
    first: &str,
    manifest: [u8; 32],
    bytes: &[u8],
) -> Result<()> {
    directory.create_file(&format::wal_name(first), &[])?;
    directory.immutable(&format::manifest_name(&manifest), bytes)?;
    directory.create_file(".head.json", &Generations::head_bytes(manifest)?)?;
    directory.create_file(".ready.json", &format::encode(&Ready::new(manifest))?)?;
    directory.guard()
}

impl Log {
    pub(crate) fn validate_segment_restoration(
        base: &RelaySegmentBaseFile,
        generation: &str,
    ) -> Result<()> {
        initial_segment(base, generation).map(|_| ())
    }

    #[cfg(feature = "server")]
    pub(crate) fn check_fresh_segment_restoration(&self, generation: &str) -> Result<()> {
        let base = self.segment_base().ok_or(Error::NeedsRecovery)?;
        let (manifest, _) = initial_segment(base, generation)?;
        let head = self.generation_descriptor()?;
        let source = &base.identity().predecessor.source;
        if head.manifest != manifest
            || head.next_sequence != source.records.to_string()
            || head.terminal_digest != source.terminal_log_digest
        {
            return Err(Error::Contract("relay segment handover target advanced"));
        }
        Ok(())
    }

    pub(crate) fn create_restored_segment(
        path: &Path,
        base: Arc<RelaySegmentBaseFile>,
        generation: &str,
    ) -> Result<(Self, crate::Recovery)> {
        let (manifest, bytes) = initial_segment(&base, generation)?;
        let directory = Directory::create(path)?;
        write_segment_root(&directory, generation, manifest, &bytes)?;
        Self::open_restored_segment(directory, base, manifest)
    }

    fn open_restored_segment(
        directory: Directory,
        base: Arc<RelaySegmentBaseFile>,
        manifest: [u8; 32],
    ) -> Result<(Self, crate::Recovery)> {
        let selection = SegmentSelection::Restored { directory: directory.witness()?, manifest };
        Self::open_segment_directory(directory, SegmentCustody { selection, base })
    }

    pub(crate) fn open_restored_segment_at(
        path: &Path,
        expected: &DirectoryWitness,
        base: Arc<RelaySegmentBaseFile>,
        generation: &str,
    ) -> Result<(Self, crate::Recovery)> {
        let (manifest, _) = initial_segment(&base, generation)?;
        let directory = Directory::open(path)?;
        directory.guard_witness(expected)?;
        Self::open_restored_segment(directory, base, manifest)
    }

    pub(crate) fn segment_directory_witness(&self) -> Result<DirectoryWitness> {
        self.ready()?;
        self.generations.as_ref().ok_or(Error::NeedsRecovery)?.directory.witness()
    }
}
