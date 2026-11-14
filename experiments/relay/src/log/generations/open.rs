//! Select and lock the entire physical lineage before any semantic replay or tail repair.
use super::{
    archive_sealed_wal::{self, ArchiveDirectory},
    directory::Directory,
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{Head, Manifest, Ready},
    packed_wal::HeldWal,
    segment::{self, SegmentCustody},
    state::{Generations, HeldManifest},
};
use crate::{
    Error, Recovery, Result,
    log::{Log, frame, scan},
};
use std::{
    collections::BTreeSet,
    io::{BufReader, Seek, SeekFrom},
    path::Path,
};

fn ready(
    directory: &Directory,
    root: [u8; 32],
    name: &str,
) -> Result<(std::fs::File, Vec<u8>, FileIdentity)> {
    let file = held_file::open(&directory.path.join(name))?;
    let bytes = held_file::read(&file, format::MAX_CONTROL)?;
    let mark: Ready = format::decode(&bytes)?;
    mark.validate(root)?;
    let identity = FileIdentity::of(&file)?;
    Ok((file, bytes, identity))
}

fn history(directory: &Directory, selected: [u8; 32]) -> Result<Vec<HeldManifest>> {
    let mut output = Vec::new();
    let mut visited = BTreeSet::new();
    let mut hash = Some(selected);
    let mut total = 0;
    while let Some(id) = hash {
        if output.len() >= format::MAX_GENERATIONS || !visited.insert(id) {
            return Err(Error::Contract("physical log manifest chain budget or cycle"));
        }
        let file = held_file::open(&directory.path.join(format::manifest_name(&id)))?;
        let stamp = FileStamp::of(&file)?;
        let bytes = held_file::read(&file, format::MAX_CONTROL)?;
        total += bytes.len() as u64;
        if total > format::MAX_MANIFEST_BYTES || format::sha(&bytes) != id {
            return Err(Error::Contract("physical log manifest hash or budget"));
        }
        let value: Manifest = format::decode(&bytes)?;
        value.validate()?;
        hash = value.parent;
        let identity = FileIdentity::of(&file)?;
        stamp.guard(&file)?;
        output.push(HeldManifest { hash: id, value, file, bytes, identity, stamp });
    }
    output.reverse();
    let first = output.first().ok_or(Error::Contract("missing physical log root"))?;
    if first.value.parent.is_some() || !first.value.sealed.is_empty() {
        return Err(Error::Contract("physical root manifest differs"));
    }
    for pair in output.windows(2) {
        pair[1].value.follows(&pair[0].value, pair[0].hash)?;
    }
    Ok(output)
}
fn closed(
    directory: &Directory,
    archive: Option<&ArchiveDirectory>,
    current: &Manifest,
    identities: &mut BTreeSet<FileIdentity>,
) -> Result<Vec<HeldWal>> {
    let mut closed = Vec::new();
    for (item, _) in current.closed_files() {
        let wal = archive_sealed_wal::open_wal(directory, archive, item)?;
        if !identities.insert(wal.identity) {
            return Err(Error::Contract("physical log inode alias"));
        }
        closed.push(wal);
    }
    Ok(closed)
}
impl Log {
    pub(crate) fn open_generations(path: &Path) -> Result<(Self, Recovery)> {
        let directory = Directory::open(path)?;
        Self::open_owned_generations(directory)
    }
    pub(crate) fn open_owned_generations(directory: Directory) -> Result<(Self, Recovery)> {
        Self::open_generation_directory(directory, ".ready.json", None)
    }
    /// Provenance admission is read-only: pending rotation and torn tails require a separate
    /// explicit recovery decision. Never let Room replay finish/repair them incidentally.
    pub(crate) fn open_complete_owned_generations(
        directory: Directory,
    ) -> Result<(Self, Recovery)> {
        let (log, recovery) = Self::open_generation_prefix(directory)?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("operational generation log has an incomplete tail"));
        }
        Ok((log, recovery))
    }

    /// Inspect a prefix without completing a pending rotation or changing the active WAL.
    pub(crate) fn open_generation_prefix(directory: Directory) -> Result<(Self, Recovery)> {
        directory.absent(".rotation.json")?;
        let (log, recovery) = Self::open_owned_generations(directory)?;
        log.generations
            .as_ref()
            .ok_or(Error::Contract("operational generation owner absent"))?
            .directory
            .absent(".rotation.json")?;
        Ok((log, recovery))
    }
    pub(crate) fn open_prepared_generations(directory: Directory) -> Result<(Self, Recovery)> {
        Self::open_generation_directory(directory, ".prepared.json", None)
    }
    pub(crate) fn open_segment_directory(
        directory: Directory,
        custody: SegmentCustody,
    ) -> Result<(Self, Recovery)> {
        Self::open_generation_directory(directory, ".ready.json", Some(custody))
    }

    fn open_generation_directory(
        directory: Directory,
        ready_name: &'static str,
        segment: Option<SegmentCustody>,
    ) -> Result<(Self, Recovery)> {
        directory.absent(segment::SUCCESSOR)?;
        let head = held_file::open(&directory.path.join(".head.json"))?;
        let head_bytes = held_file::read(&head, format::MAX_CONTROL)?;
        let selected: Head = format::decode(&head_bytes)?;
        selected.validate()?;
        let history = history(&directory, selected.manifest)?;
        let initial = history.first().ok_or(Error::Contract("physical root absent"))?;
        match (&segment, &initial.value.origin) {
            (Some(custody), Some(_)) => custody.verify(&directory, &initial.value, initial.hash)?,
            (None, None) => {}
            _ => return Err(Error::Contract("relay segment requires the selected predecessor")),
        }
        if let Some(custody) = &segment {
            let current =
                &history.last().ok_or(Error::Contract("missing relay segment head"))?.value;
            if current
                .closed_files()
                .map(|(file, _)| file.generation.as_str())
                .chain(std::iter::once(current.active.generation.as_str()))
                .any(|id| custody.base.contains_section(&format::wal_name(id)))
            {
                return Err(Error::Contract("relay segment reuses a predecessor generation"));
            }
        }
        let (ready, ready_bytes, ready_identity) = ready(&directory, initial.hash, ready_name)?;
        let current = history.last().ok_or(Error::Contract("missing physical log head"))?;
        let mut identities = BTreeSet::new();
        let archive = ArchiveDirectory::open(&directory)?;
        let closed = closed(&directory, archive.as_ref(), &current.value, &mut identities)?;
        let active = &current.value.active;
        let mut file = held_file::open(&directory.path.join(format::wal_name(&active.generation)))?;
        let active_stamp = FileStamp::of(&file)?;
        let length = file.metadata()?.len();
        if length > super::super::MAX_LOG
            || current
                .value
                .closed_bytes()
                .checked_add(length)
                .is_none_or(|bytes| bytes > format::MAX_WAL_BYTES)
        {
            return Err(Error::Contract("physical log byte budget"));
        }
        let parsed = scan::verify_records_from(
            &mut BufReader::new(&file),
            length,
            frame::Family::Continuation,
            active.first,
            active.previous,
        )?;
        let next = active
            .first
            .checked_add(parsed.records)
            .ok_or(Error::Contract("log global sequence"))?;
        let active_identity = FileIdentity::of(&file)?;
        active_stamp.guard(&file)?;
        if !identities.insert(active_identity) {
            return Err(Error::Contract("physical log inode alias"));
        }
        file.seek(SeekFrom::Start(parsed.bytes))?;
        let head_identity = FileIdentity::of(&head)?;
        let log = Self {
            file,
            family: frame::Family::Continuation,
            next,
            previous: parsed.previous,
            bytes: parsed.bytes,
            poisoned: false,
            generations: Some(Generations {
                directory,
                archive,
                segment,
                history,
                closed,
                head,
                head_bytes,
                head_identity,
                active_identity,
                active_stamp,
                opening_length: Some(length),
                ready,
                ready_name,
                ready_bytes,
                ready_identity,
                fenced: std::sync::atomic::AtomicBool::new(false),
                #[cfg(test)]
                stop_after: None,
                #[cfg(test)]
                stop_ready_after_link: false,
            }),
            #[cfg(test)]
            read_only_after_append: None,
        };
        log.generations
            .as_ref()
            .ok_or(Error::Contract("physical owner absent"))?
            .verify_inventory()?;
        log.ready()?;
        Ok((log, parsed.recovery))
    }
}
