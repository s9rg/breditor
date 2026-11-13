//! New-directory birth with a separately framed seed. No existing original log is rewritten.
use super::{
    ServerLogGenerationOptions,
    directory::Directory,
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{ActiveFile, ClosedFile, Manifest, Ready, SEEDED_ROOT_VERSION},
    packed_wal::HeldWal,
    state::{Generations, HeldManifest},
};
use crate::{
    Error, Result,
    log::{Event, Log, decoder, frame},
};
use std::path::{Path, PathBuf};

pub(crate) struct Creation {
    directory: Directory,
    options: ServerLogGenerationOptions,
}
impl Creation {
    pub(crate) fn begin(path: &Path, options: &ServerLogGenerationOptions) -> Result<Self> {
        options.validate()?;
        Ok(Self { directory: Directory::create(path)?, options: options.clone() })
    }
    fn seed_path(&self) -> PathBuf {
        self.directory.path.join(format::wal_name(&self.options.root))
    }
    pub(crate) fn seed(&self, event: Event) -> Result<Log> {
        self.directory.guard()?;
        Log::create_in_family(&self.seed_path(), event, frame::Family::Continuation)
    }
    fn root(&self, log: &Log) -> Result<ClosedFile> {
        self.directory.guard()?;
        log.ready()?;
        if log.generations.is_some() || log.family != frame::Family::Continuation || log.next != 1 {
            return Err(Error::Contract("physical generation requires its separately framed seed"));
        }
        FileIdentity::of(&log.file)?.guard(&log.file, &self.seed_path())?;
        let stamp = FileStamp::of(&log.file)?;
        let bytes = held_file::read(&log.file, super::super::MAX_LOG)?;
        let parsed = decoder::read_records_from(
            &mut bytes.as_slice(),
            bytes.len() as u64,
            frame::Family::Continuation,
            0,
            [0; 32],
        )?;
        stamp.guard(&log.file)?;
        if parsed.recovery.truncated_bytes != 0
            || parsed.records.len() != 1
            || parsed.previous != log.previous
            || parsed.bytes != log.bytes
            || !parsed.records.first().is_some_and(|record| {
                matches!(
                    record.event,
                    Event::Seed { .. }
                        | Event::SeedStructuralV2 { .. }
                        | Event::SeedLayoutV3 { .. }
                        | Event::SeedAtomicTransportV2 { .. }
                )
            })
        {
            return Err(Error::Contract("physical generation seed cut differs"));
        }
        Ok(ClosedFile {
            generation: self.options.root.clone(),
            first: 0,
            records: log.next,
            previous: [0; 32],
            terminal: log.previous,
            bytes: log.bytes,
            sha256: format::sha(&bytes),
        })
    }
    pub(crate) fn finish(self, mut log: Log) -> Result<Log> {
        let root = self.root(&log)?;
        let value = Manifest {
            format: "breditor/relay-log-generations".into(),
            format_version: SEEDED_ROOT_VERSION,
            parent: None,
            root,
            sealed: Vec::new(),
            active: ActiveFile {
                generation: self.options.active,
                first: log.next,
                previous: log.previous,
            },
        };
        value.validate()?;
        let active =
            self.directory.create_file(&format::wal_name(&value.active.generation), &[])?;
        let bytes = format::encode(&value)?;
        let hash = format::sha(&bytes);
        let file = self.directory.immutable(&format::manifest_name(&hash), &bytes)?;
        let manifest = HeldManifest {
            hash,
            value,
            identity: FileIdentity::of(&file)?,
            stamp: FileStamp::of(&file)?,
            file,
            bytes,
        };
        let head_bytes = Generations::head_bytes(hash)?;
        let head = self.directory.create_file(".head.json", &head_bytes)?;
        let ready_bytes = format::encode(&Ready::new(hash))?;
        let ready = self.directory.create_file(".ready.json", &ready_bytes)?;
        let ready_identity = FileIdentity::of(&ready)?;
        let root_file = std::mem::replace(&mut log.file, active);
        let active_identity = FileIdentity::of(&log.file)?;
        let active_stamp = FileStamp::of(&log.file)?;
        let head_identity = FileIdentity::of(&head)?;
        log.generations = Some(Generations {
            directory: self.directory,
            history: vec![manifest],
            closed: vec![HeldWal::raw(root_file, self.options.root, log.bytes)?],
            head,
            head_bytes,
            head_identity,
            active_identity,
            active_stamp,
            opening_length: None,
            ready,
            ready_name: ".ready.json",
            ready_bytes,
            ready_identity,
            fenced: std::sync::atomic::AtomicBool::new(false),
            #[cfg(test)]
            stop_after: None,
            #[cfg(test)]
            stop_ready_after_link: false,
        });
        log.bytes = 0;
        log.ready()?;
        Ok(log)
    }
}
