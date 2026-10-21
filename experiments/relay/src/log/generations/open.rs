//! Select and lock the entire physical lineage before any semantic replay or tail repair.
use super::{
    directory::Directory,
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{Head, Manifest, Ready},
    state::{Generations, HeldManifest, HeldWal},
};
use crate::{
    Error, Recovery, Result,
    log::{Log, Record, decoder, frame},
};
use std::{
    collections::BTreeSet,
    io::{Seek, SeekFrom},
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
    current: &Manifest,
    records: &mut Vec<Record>,
    identities: &mut BTreeSet<FileIdentity>,
) -> Result<Vec<HeldWal>> {
    let mut closed = Vec::new();
    for item in std::iter::once(&current.root).chain(&current.sealed) {
        let file = held_file::open(&directory.path.join(format::wal_name(&item.generation)))?;
        let stamp = FileStamp::of(&file)?;
        let bytes = held_file::read(&file, super::super::MAX_LOG)?;
        if bytes.len() as u64 != item.bytes || format::sha(&bytes) != item.sha256 {
            return Err(Error::Contract("closed physical log bytes differ"));
        }
        let parsed = decoder::read_records_from(
            &mut bytes.as_slice(),
            item.bytes,
            frame::Family::Continuation,
            item.first,
            item.previous,
        )?;
        if parsed.recovery.truncated_bytes != 0
            || parsed.records.len() as u64 != item.records
            || parsed.previous != item.terminal
        {
            return Err(Error::Contract("closed log cut differs"));
        }
        let identity = FileIdentity::of(&file)?;
        if !identities.insert(identity) {
            return Err(Error::Contract("physical log inode alias"));
        }
        stamp.guard(&file)?;
        closed.push(HeldWal {
            file,
            generation: item.generation.clone(),
            bytes: item.bytes,
            identity,
            stamp,
        });
        records.extend(parsed.records);
    }
    Ok(closed)
}
impl Log {
    pub(crate) fn open_generations(path: &Path) -> Result<(Self, Vec<Record>, Recovery)> {
        let directory = Directory::open(path)?;
        Self::open_owned_generations(directory)
    }
    pub(crate) fn open_owned_generations(
        directory: Directory,
    ) -> Result<(Self, Vec<Record>, Recovery)> {
        Self::open_generation_directory(directory, ".ready.json")
    }
    pub(crate) fn open_prepared_generations(
        directory: Directory,
    ) -> Result<(Self, Vec<Record>, Recovery)> {
        Self::open_generation_directory(directory, ".prepared.json")
    }
    fn open_generation_directory(
        directory: Directory,
        ready_name: &'static str,
    ) -> Result<(Self, Vec<Record>, Recovery)> {
        let head = held_file::open(&directory.path.join(".head.json"))?;
        let head_bytes = held_file::read(&head, format::MAX_CONTROL)?;
        let selected: Head = format::decode(&head_bytes)?;
        selected.validate()?;
        let history = history(&directory, selected.manifest)?;
        let (ready, ready_bytes, ready_identity) = ready(
            &directory,
            history.first().ok_or(Error::Contract("physical root absent"))?.hash,
            ready_name,
        )?;
        let current = history.last().ok_or(Error::Contract("missing physical log head"))?;
        let mut records = Vec::new();
        let mut identities = BTreeSet::new();
        let closed = closed(&directory, &current.value, &mut records, &mut identities)?;
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
        let parsed = decoder::read_records_from(
            &mut file,
            length,
            frame::Family::Continuation,
            active.first,
            active.previous,
        )?;
        let next = active
            .first
            .checked_add(parsed.records.len() as u64)
            .ok_or(Error::Contract("log global sequence"))?;
        let active_identity = FileIdentity::of(&file)?;
        active_stamp.guard(&file)?;
        if !identities.insert(active_identity) {
            return Err(Error::Contract("physical log inode alias"));
        }
        records.extend(parsed.records);
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
        Ok((log, records, parsed.recovery))
    }
}
