//! Two-pass capture of the canonical native backup without a complete body buffer.
use super::{
    capture::{CaptureEntry, GenerationFileSection},
    closure::{GenerationCut, MAX_GENERATION_BODY_BYTES},
    format,
    state::Generations,
};
use crate::{
    Error, Result,
    archive_digest::ArchiveDigest,
    log::{Log, Record, frame, scan},
};
use std::{
    collections::BTreeSet,
    io::{self, BufReader, Read, Seek, SeekFrom, Write},
};

pub(crate) struct StreamGenerationCapture<'a> {
    pub(crate) sections: Vec<GenerationFileSection>,
    pub(crate) cut: GenerationCut,
    entries: Vec<CaptureEntry<'a>>,
    names: BTreeSet<String>,
    state: &'a Generations,
}

// Active-file reads share the append cursor, even through cloned handles.
// Failure or unwind must move it back before another operation uses this log.
struct AppendCursor<'a> {
    log: &'a mut Log,
    restored: bool,
}

impl AppendCursor<'_> {
    fn restore(&mut self) -> Result<()> {
        match self.log.file.seek(SeekFrom::Start(self.log.bytes)) {
            Ok(_) => {
                self.restored = true;
                Ok(())
            }
            Err(error) => {
                self.log.invalidate();
                Err(error.into())
            }
        }
    }
}

impl Drop for AppendCursor<'_> {
    fn drop(&mut self) {
        if !self.restored {
            let _ = self.restore();
        }
    }
}

impl StreamGenerationCapture<'_> {
    pub(crate) fn write_body(&self, output: &mut impl Write) -> Result<()> {
        let mut buffer = [0_u8; 16 * 1024];
        for (part, entry) in self.sections.iter().zip(&self.entries) {
            entry.guard()?;
            let mut hash = ArchiveDigest::new(part.bytes);
            let mut emit = |reader: &mut dyn Read| -> Result<u64> {
                let mut count = 0_u64;
                loop {
                    let read = reader.read(&mut buffer)?;
                    if read == 0 {
                        return Ok(count);
                    }
                    hash.write_all(&buffer[..read])?;
                    output.write_all(&buffer[..read])?;
                    count += read as u64;
                }
            };
            let copied = if let Some((wal, metadata)) = self.state.closed_wal(&part.name) {
                wal.read(metadata.sha256, emit)?
            } else {
                let mut file = entry.file();
                file.seek(SeekFrom::Start(0))?;
                emit(&mut file.take(part.bytes))?
            };
            if copied != part.bytes || hash.finish().0 != part.sha256 {
                return Err(Error::Contract("streamed generation backup source changed"));
            }
            entry.guard()?;
        }
        self.check()
    }

    /// Read records in global order while keeping the exact same held cut as the archive writer.
    pub(crate) fn visit_records(&self, mut visit: impl FnMut(Record) -> Result<()>) -> Result<()> {
        self.check()?;
        let manifest = &self.state.current().value;
        for (wal, (selected, family)) in self.state.closed.iter().zip(manifest.closed_files()) {
            self.state.guard_sealed_wal(wal)?;
            wal.visit_records(selected, family, &mut visit)?;
            self.state.guard_sealed_wal(wal)?;
        }
        let active = &manifest.active;
        let name = format::wal_name(&active.generation);
        let (part, entry) = self
            .sections
            .iter()
            .zip(&self.entries)
            .find(|(part, _)| part.name == name)
            .ok_or(Error::Contract("streamed generation active file absent"))?;
        let mut reader = BufReader::new(entry.file());
        reader.seek(SeekFrom::Start(0))?;
        let (cut, digest) = scan::visit_and_hash_records(
            &mut reader,
            part.bytes,
            frame::Family::Continuation,
            active.first,
            active.previous,
            visit,
        )?;
        if cut.recovery.truncated_bytes != 0
            || cut.bytes != part.bytes
            || cut.previous != self.cut.previous
            || active.first.checked_add(cut.records) != Some(self.cut.records)
            || digest != part.sha256
        {
            return Err(Error::Contract("streamed generation retained packet source differs"));
        }
        self.check()
    }

    pub(crate) fn segment_base(&self) -> Option<&crate::RelaySegmentBaseFile> {
        self.state.segment.as_ref().map(|segment| segment.base.as_ref())
    }

    pub(crate) fn check(&self) -> Result<()> {
        for entry in &self.entries {
            entry.guard()?;
        }
        self.state.check_capture_names(self.names.clone(), None)
    }
}

impl Log {
    pub(crate) fn stream_generation_backup<T>(
        &mut self,
        write: impl FnOnce(StreamGenerationCapture<'_>) -> Result<T>,
        destination_failed: &std::cell::Cell<bool>,
    ) -> Result<T> {
        self.ready()?;
        self.check_legacy_generation_archive()?;
        self.stream_held_generation(write, destination_failed)
    }

    pub(crate) fn stream_held_generation<T>(
        &mut self,
        write: impl FnOnce(StreamGenerationCapture<'_>) -> Result<T>,
        destination_failed: &std::cell::Cell<bool>,
    ) -> Result<T> {
        self.ready()?;
        let mut cursor = AppendCursor { log: self, restored: false };
        let result = cursor.log.prepare_stream_generation_capture().and_then(write);
        cursor.restore()?;
        if result.is_err() && !destination_failed.get() {
            cursor.log.invalidate();
        }
        // Recheck actual custody even when the destination stops accepting writes.
        cursor.log.ready()?;
        result
    }

    fn prepare_stream_generation_capture(&self) -> Result<StreamGenerationCapture<'_>> {
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no generation archive"))?;
        if state.ready_name != ".ready.json" || state.opening_length.is_some() {
            return Err(Error::Contract("generation source is not complete and published"));
        }
        state.directory.absent(".rotation.json")?;
        state.verify_inventory()?;
        state.verify_retained()?;
        let names = state.capture_live_names()?;
        let portable = state.portable_names(&names, None)?;
        let manifest = state.current();
        let active = &manifest.value.active;
        let active_name = format::wal_name(&active.generation);
        for required in [".head.json".into(), ".ready.json".into(), active_name.clone()]
            .into_iter()
            .chain(state.history.iter().map(|manifest| format::manifest_name(&manifest.hash)))
            .chain(state.closed.iter().map(|wal| super::packed_wal::selected_name(wal)))
        {
            if !portable.contains(&required) {
                return Err(Error::Contract("streamed generation backup missing selected file"));
            }
        }
        let mut entries = Vec::with_capacity(portable.len());
        let mut sections = Vec::with_capacity(portable.len());
        let mut offset = 0_u64;
        for name in portable {
            let entry = state.capture_entry(&name, &self.file, &active_name, None)?;
            let end = offset
                .checked_add(entry.bytes)
                .filter(|bytes| *bytes <= MAX_GENERATION_BODY_BYTES)
                .ok_or(Error::Contract("streamed generation backup byte budget"))?;
            let sha256 = if name == active_name {
                let mut reader = BufReader::new(entry.file());
                reader.seek(SeekFrom::Start(0))?;
                let (cut, hash) = scan::verify_and_hash_records(
                    &mut reader,
                    entry.bytes,
                    frame::Family::Continuation,
                    active.first,
                    active.previous,
                )?;
                if cut.recovery.truncated_bytes != 0
                    || cut.bytes != self.bytes
                    || cut.previous != self.previous
                    || active.first.checked_add(cut.records) != Some(self.next)
                {
                    return Err(Error::Contract("streamed generation backup active cut differs"));
                }
                hash
            } else if let Some((_, metadata)) = state.closed_wal(&name) {
                metadata.sha256
            } else {
                let mut file = entry.file();
                file.seek(SeekFrom::Start(0))?;
                let mut hash = ArchiveDigest::new(entry.bytes);
                if io::copy(&mut file.take(entry.bytes), &mut hash)? != entry.bytes {
                    return Err(Error::Contract("streamed generation backup incomplete file"));
                }
                hash.finish().0
            };
            entry.guard()?;
            sections.push(GenerationFileSection { name, offset, bytes: entry.bytes, sha256 });
            entries.push(entry);
            offset = end;
        }
        self.ready()?;
        Ok(StreamGenerationCapture {
            sections,
            cut: GenerationCut {
                root: state.root_id().to_owned(),
                manifest: manifest.hash,
                records: self.next,
                previous: self.previous,
            },
            entries,
            names,
            state,
        })
    }
}
