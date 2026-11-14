//! Absent-only immutable whole target checkpoint, synced and read back before return.
use super::{
    super::ServerLogGenerationRecoveryStateIdentity,
    PreparedNativeGenerationActivationIdentity as Identity,
};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupFile, credentials,
    log::generations::{GenerationDirectory, GenerationFileStamp, GenerationFileWitness},
    server::{
        PreparedLogGenerationHandoverIdentity, RoomDeploymentSelection, deployment_fence,
        generation_backup::durable::{Interruption, Point, files},
    },
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Write,
    path::Path,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
pub(in crate::server) struct Store {
    pub directory: GenerationDirectory,
    pub identity: Identity,
    pub buffered: std::sync::OnceLock<ServerLogGenerationRoomBackup>,
    pub(super) backup: ServerLogGenerationRoomBackupFile,
    pub(super) archive: File,
    pub(super) intent: File,
    pub(super) archive_stamp: GenerationFileStamp,
    pub(super) intent_stamp: GenerationFileStamp,
    pub(super) read_gate: Mutex<()>,
    pub(super) poisoned: AtomicBool,
}
pub(super) struct Inputs {
    pub source: PreparedLogGenerationHandoverIdentity,
    pub current: ServerLogGenerationRecoveryStateIdentity,
    pub operation: [u8; 32],
    pub previous: RoomDeploymentSelection,
    pub parent: Option<[u8; 32]>,
}
impl Store {
    pub(super) fn create(
        root: &Path,
        input: Inputs,
        stop: &Interruption,
        write: impl FnOnce(&mut File) -> Result<ServerLogGenerationRoomBackupFile>,
    ) -> Result<Self> {
        deployment_fence::handover_selection(&input.previous, &[0; 32])?;
        let directory = GenerationDirectory::create(root)?;
        let mut archive = directory.create_file("target.backup", &[])?;
        let backup = write(&mut archive)?;
        let info = backup.info();
        if info.identity != input.current.server {
            return Err(Error::Contract("native checkpoint current archive differs"));
        }
        archive.sync_all()?;
        directory.sync()?;
        stop.after(Point::ArchiveSynced)?;
        let mut intent = directory.create_file("activation.json", &[])?;
        let mut identity = Identity {
            format: "breditor/prepared-native-generation-activation".into(),
            format_version: 1,
            salt: credentials::issue()?,
            source: input.source,
            current: input.current,
            operation: input.operation,
            planned: input.previous.clone(),
            previous: input.previous,
            parent: input.parent,
            root: directory.witness()?,
            archive: GenerationFileWitness::of(&archive)?,
            intent: GenerationFileWitness::of(&intent)?,
            bytes: info.bytes,
        };
        identity.planned =
            deployment_fence::handover_selection(&identity.previous, &identity.nonce()?)?;
        identity.validate()?;
        let bytes = serde_json::to_vec(&identity)?;
        if bytes.len() as u64 > files::MAX_INTENT {
            return Err(Error::Contract("native checkpoint intent budget"));
        }
        intent.write_all(&bytes)?;
        intent.sync_all()?;
        directory.sync()?;
        let result = Self {
            archive_stamp: GenerationFileStamp::of(&archive)?,
            intent_stamp: GenerationFileStamp::of(&intent)?,
            directory,
            identity,
            buffered: std::sync::OnceLock::new(),
            backup,
            archive,
            intent,
            read_gate: Mutex::new(()),
            poisoned: AtomicBool::new(false),
        };
        result.guard()?;
        stop.after(Point::IntentSynced)?;
        Ok(result)
    }
    pub fn guard(&self) -> Result<()> {
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
            .map(|row| row.map(|row| row.file_name()))
            .collect::<std::io::Result<Vec<_>>>()?;
        names.sort();
        if names != [".owner", "activation.json", "target.backup"].map(std::ffi::OsString::from) {
            return Err(Error::Contract("native checkpoint closed directory contents"));
        }
        self.identity.archive.guard(&self.archive, &self.directory.path.join("target.backup"))?;
        self.identity.intent.guard(&self.intent, &self.directory.path.join("activation.json"))?;
        self.archive_stamp.guard(&self.archive)?;
        self.intent_stamp.guard(&self.intent)?;
        let bytes = serde_json::to_vec(&self.identity)?;
        let digest: [u8; 32] = Sha256::digest(&bytes).into();
        if files::digest(
            &self.intent,
            &self.directory.path.join("activation.json"),
            bytes.len() as u64,
        )? != digest
            || files::digest(
                &self.archive,
                &self.directory.path.join("target.backup"),
                self.identity.bytes,
            )? != self.identity.current.server.archive_sha256
            || self.backup.info().identity != self.identity.current.server
            || self.backup.info().bytes != self.identity.bytes
        {
            return Err(Error::Contract("native checkpoint immutable files changed"));
        }
        self.backup.guard_file()?;
        self.archive_stamp.guard(&self.archive)?;
        self.intent_stamp.guard(&self.intent)?;
        self.directory.guard_witness(&self.identity.root)
    }
}
