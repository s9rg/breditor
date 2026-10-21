//! Held physical owners. Immutable metadata, native event position and current authority are separate.
use super::{
    directory::Directory,
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{Head, Manifest},
    receipt::{ServerLogGenerationDescriptor, ServerLogGenerationReceipt},
};
use crate::{Error, Result};
use std::{
    fs::File,
    sync::atomic::{AtomicBool, Ordering},
};

pub(super) struct HeldManifest {
    pub hash: [u8; 32],
    pub value: Manifest,
    pub file: File,
    pub bytes: Vec<u8>,
    pub identity: FileIdentity,
    pub stamp: FileStamp,
}
pub(super) struct HeldWal {
    pub file: File,
    pub generation: String,
    pub bytes: u64,
    pub identity: FileIdentity,
    pub stamp: FileStamp,
}
pub(in crate::log) struct Generations {
    pub(super) directory: Directory,
    pub(super) history: Vec<HeldManifest>,
    pub(super) closed: Vec<HeldWal>,
    pub(super) head: File,
    pub(super) head_bytes: Vec<u8>,
    pub(super) head_identity: FileIdentity,
    pub(super) active_identity: FileIdentity,
    pub(super) active_stamp: FileStamp,
    pub(in crate::log) opening_length: Option<u64>,
    pub(super) ready: File,
    pub(super) ready_name: &'static str,
    pub(super) ready_bytes: Vec<u8>,
    pub(super) ready_identity: FileIdentity,
    pub(super) fenced: AtomicBool,
    #[cfg(test)]
    pub(super) stop_after: Option<super::RotationPoint>,
    #[cfg(test)]
    pub(super) stop_ready_after_link: bool,
}
impl Generations {
    pub(super) fn current(&self) -> &HeldManifest {
        // Construction/open admits a nonempty manifest chain before building this owner.
        self.history.last().expect("admitted manifest chain")
    }
    pub(in crate::log) fn active_first(&self) -> u64 {
        self.current().value.active.first
    }
    pub(in crate::log) fn closed_bytes(&self) -> u64 {
        self.current().value.closed_bytes()
    }
    pub(in crate::log) fn guard(&self, active: &File, bytes: u64) -> Result<()> {
        if self.fenced.load(Ordering::Acquire) {
            return Err(Error::NeedsRecovery);
        }
        let result = self.guard_inner(active, bytes);
        if result.is_err() {
            self.fenced.store(true, Ordering::Release);
        }
        result
    }
    fn guard_inner(&self, active: &File, bytes: u64) -> Result<()> {
        self.directory.guard()?;
        self.head_identity.guard(&self.head, &self.directory.path.join(".head.json"))?;
        if held_file::read(&self.head, format::MAX_CONTROL)? != self.head_bytes {
            return Err(Error::Contract("log physical head changed"));
        }
        self.ready_identity.guard(&self.ready, &self.directory.path.join(self.ready_name))?;
        if held_file::read(&self.ready, format::MAX_CONTROL)? != self.ready_bytes {
            return Err(Error::Contract("physical log readiness changed"));
        }
        for manifest in &self.history {
            manifest.stamp.guard(&manifest.file)?;
            manifest.identity.guard(
                &manifest.file,
                &self.directory.path.join(format::manifest_name(&manifest.hash)),
            )?;
            if manifest.file.metadata()?.len() != manifest.bytes.len() as u64 {
                return Err(Error::Contract("immutable log manifest length changed"));
            }
        }
        for wal in &self.closed {
            wal.stamp.guard(&wal.file)?;
            wal.identity
                .guard(&wal.file, &self.directory.path.join(format::wal_name(&wal.generation)))?;
            if wal.file.metadata()?.len() != wal.bytes {
                return Err(Error::Contract("immutable log file length changed"));
            }
        }
        let active_path =
            self.directory.path.join(format::wal_name(&self.current().value.active.generation));
        self.active_identity.guard(active, &active_path)?;
        self.active_stamp.guard(active)?;
        if active.metadata()?.len() != self.opening_length.unwrap_or(bytes) {
            return Err(Error::Contract("active log length changed outside authority"));
        }
        Ok(())
    }
    pub(in crate::log) fn refresh_active(&mut self, active: &File) -> Result<()> {
        self.active_stamp = FileStamp::of(active)?;
        Ok(())
    }
    pub(in crate::log) fn descriptor(
        &self,
        next: u64,
        previous: [u8; 32],
    ) -> ServerLogGenerationDescriptor {
        let current = self.current();
        ServerLogGenerationDescriptor {
            format: "breditor/relay-log-generation-descriptor",
            format_version: 1,
            root: current.value.root.generation.clone(),
            active: current.value.active.generation.clone(),
            sealed: current.value.sealed.len(),
            manifest: current.hash,
            next_sequence: next.to_string(),
            terminal_digest: previous,
        }
    }
    pub(super) fn receipt(
        current: &HeldManifest,
        duplicate: bool,
    ) -> Result<ServerLogGenerationReceipt> {
        Ok(ServerLogGenerationReceipt {
            format: "breditor/relay-log-generation-receipt",
            format_version: 1,
            generation: current.value.active.generation.clone(),
            before_manifest: current
                .value
                .parent
                .ok_or(Error::Contract("initial head is not a rotation"))?,
            after_manifest: current.hash,
            next_sequence: current.value.active.first.to_string(),
            terminal_digest: current.value.active.previous,
            duplicate,
        })
    }
    pub(super) fn head_bytes(hash: [u8; 32]) -> Result<Vec<u8>> {
        format::encode(&Head::new(hash))
    }
    pub(in crate::log) fn retry(
        &self,
        generation: &str,
    ) -> Result<Option<ServerLogGenerationReceipt>> {
        self.history
            .iter()
            .find(|held| held.value.parent.is_some() && held.value.active.generation == generation)
            .map(|held| Self::receipt(held, true))
            .transpose()
    }
}

impl super::super::Log {
    pub(crate) fn generation_descriptor(&self) -> Result<ServerLogGenerationDescriptor> {
        self.ready()?;
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no physical generations"))?;
        Ok(state.descriptor(self.next, self.previous))
    }
}
