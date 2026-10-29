//! Complete archive and commitment sync before any old-server fencing can occur.
use super::{
    PreparedLogGenerationHandoverIdentity, files,
    interruption::{Interruption, Point},
};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup,
    log::generations::{GenerationDirectory, GenerationFileStamp, GenerationFileWitness},
    server::{RoomDeploymentSelection, deployment_fence},
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
pub(in crate::server) struct Store {
    pub(super) poisoned: AtomicBool,
    pub(super) read_gate: std::sync::Mutex<()>,
    pub directory: GenerationDirectory,
    pub identity: PreparedLogGenerationHandoverIdentity,
    pub backup: ServerLogGenerationRoomBackup,
    pub(super) archive: File,
    pub(super) intent: File,
    pub(super) archive_stamp: GenerationFileStamp,
    pub(super) intent_stamp: GenerationFileStamp,
}
impl Store {
    pub(super) fn create(
        root: &Path,
        backup: ServerLogGenerationRoomBackup,
        previous: RoomDeploymentSelection,
        stop: &Interruption,
    ) -> Result<Self> {
        deployment_fence::handover_selection(&previous, &[0; 32])?;
        let info = backup.info()?;
        let directory = GenerationDirectory::create(root)?;
        let mut archive = directory.create_file("source.backup", &[])?;
        backup.write_to(&mut archive)?;
        archive.sync_all()?;
        directory.sync()?;
        if files::digest(&archive, &directory.path.join("source.backup"), info.bytes)?
            != info.identity.archive_sha256
        {
            return Err(Error::Contract("prepared handover archive readback differs"));
        }
        stop.after(Point::ArchiveSynced)?;
        let mut intent = directory.create_file("intent.json", &[])?;
        let identity = PreparedLogGenerationHandoverIdentity::new(
            info.identity,
            previous,
            directory.witness()?,
            GenerationFileWitness::of(&archive)?,
            GenerationFileWitness::of(&intent)?,
            info.bytes,
        )?;
        let encoded = serde_json::to_vec(&identity)?;
        if encoded.len() as u64 > files::MAX_INTENT {
            return Err(Error::Contract("handover intent budget"));
        }
        intent.write_all(&encoded)?;
        intent.sync_all()?;
        directory.sync()?;
        let result = Self {
            poisoned: AtomicBool::new(false),
            read_gate: std::sync::Mutex::new(()),
            directory,
            identity,
            backup,
            archive_stamp: GenerationFileStamp::of(&archive)?,
            intent_stamp: GenerationFileStamp::of(&intent)?,
            archive,
            intent,
        };
        result.guard()?;
        stop.after(Point::IntentSynced)?;
        Ok(result)
    }
    pub fn guard(&self) -> Result<()> {
        // try_clone shares the underlying file cursor. Serialize every retained
        // descriptor read, including owner-marker checks, across shared &self calls.
        let _read = self.read_gate.lock().map_err(|_| Error::NeedsRecovery)?;
        if self.poisoned.load(Ordering::Acquire) {
            return Err(Error::NeedsRecovery);
        }
        let result = self.guard_files();
        if result.is_err() {
            self.poisoned.store(true, Ordering::Release);
        }
        result
    }
    fn guard_files(&self) -> Result<()> {
        self.identity.validate()?;
        self.directory.guard_witness(&self.identity.root)?;
        let mut names = fs::read_dir(&self.directory.path)?
            .take(4)
            .map(|e| e.map(|e| e.file_name()))
            .collect::<std::io::Result<Vec<_>>>()?;
        names.sort();
        if names != [".owner", "intent.json", "source.backup"].map(std::ffi::OsString::from) {
            return Err(Error::Contract("handover unknown directory contents"));
        }
        self.identity
            .archive_file
            .guard(&self.archive, &self.directory.path.join("source.backup"))?;
        self.identity.intent_file.guard(&self.intent, &self.directory.path.join("intent.json"))?;
        self.archive_stamp.guard(&self.archive)?;
        self.intent_stamp.guard(&self.intent)?;
        let encoded = serde_json::to_vec(&self.identity)?;
        let intent_digest: [u8; 32] = Sha256::digest(&encoded).into();
        if files::digest(
            &self.intent,
            &self.directory.path.join("intent.json"),
            encoded.len() as u64,
        )? != intent_digest
            || files::digest(
                &self.archive,
                &self.directory.path.join("source.backup"),
                self.identity.bytes,
            )? != self.identity.source.archive_sha256
            || self.backup.info()?.identity != self.identity.source
            || self.backup.encoded_len()? != self.identity.bytes
        {
            return Err(Error::Contract("handover immutable source or intent changed"));
        }
        self.archive_stamp.guard(&self.archive)?;
        self.intent_stamp.guard(&self.intent)?;
        self.directory.guard_witness(&self.identity.root)
    }
}
