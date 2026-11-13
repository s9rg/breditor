//! Visit one checked record at a time from the locked generation directory.
use super::{manifest::Manifest, packed_wal::HeldWal};
use crate::{
    Error, Result,
    log::{Log, Record, frame, scan},
};
use std::{
    fs::File,
    io::{BufReader, Seek, SeekFrom},
};

/// Read handles share the held log's inodes. The caller keeps the log and its
/// exclusive directory lease alive for this private, synchronous traversal.
pub(crate) struct OpenGenerationReplay {
    manifest: Manifest,
    closed: Vec<HeldWal>,
    active: File,
    active_length: u64,
    accepted_bytes: u64,
    next: u64,
    previous: [u8; 32],
}

impl Log {
    pub(crate) fn open_generation_replay(&self) -> Result<OpenGenerationReplay> {
        self.ready()?;
        let state =
            self.generations.as_ref().ok_or(Error::Contract("generation replay owner absent"))?;
        let active_length =
            state.opening_length.ok_or(Error::Contract("generation replay requires a cold log"))?;
        let manifest = &state.current().value;
        if state.closed.len() != manifest.sealed.len() + 1 {
            return Err(Error::Contract("generation replay owner count differs"));
        }
        let closed = state.closed.iter().map(HeldWal::clone_handle).collect::<Result<_>>()?;
        Ok(OpenGenerationReplay {
            manifest: manifest.clone(),
            closed,
            active: self.file.try_clone()?,
            active_length,
            accepted_bytes: self.bytes,
            next: self.next,
            previous: self.previous,
        })
    }

    pub(crate) fn check_generation_replay(&self) -> Result<()> {
        self.ready()?;
        self.generations
            .as_ref()
            .ok_or(Error::Contract("generation replay owner absent"))?
            .verify_inventory()?;
        self.ready()
    }
}

impl OpenGenerationReplay {
    /// All state built by the visitor stays private until this returns successfully.
    pub(crate) fn visit(self, mut visit: impl FnMut(Record) -> Result<()>) -> Result<()> {
        for (wal, (item, family)) in self.closed.iter().zip(self.manifest.closed_files()) {
            let cut = wal.read(item.sha256, |mut reader| {
                scan::visit_records_from(
                    &mut reader,
                    item.bytes,
                    family,
                    item.first,
                    item.previous,
                    &mut visit,
                )
            })?;
            if cut.recovery.truncated_bytes != 0
                || cut.records != item.records
                || cut.previous != item.terminal
            {
                return Err(Error::Contract("closed log cut differs"));
            }
        }

        let mut active = BufReader::new(self.active);
        active.seek(SeekFrom::Start(0))?;
        let cut = scan::visit_records_from(
            &mut active,
            self.active_length,
            frame::Family::Continuation,
            self.manifest.active.first,
            self.manifest.active.previous,
            visit,
        )?;
        if cut.bytes != self.accepted_bytes
            || cut.previous != self.previous
            || self.manifest.active.first.checked_add(cut.records) != Some(self.next)
        {
            return Err(Error::Contract("active generation changed before replay"));
        }
        active.into_inner().seek(SeekFrom::Start(self.accepted_bytes))?;
        Ok(())
    }
}
