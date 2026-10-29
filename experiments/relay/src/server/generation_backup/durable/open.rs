//! Cold admission retains real files and independent choices; it grants no lease.
use super::{PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity, Store, files};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup,
    log::generations::{GenerationDirectory, GenerationFileStamp},
};
use std::path::Path;
impl PreparedLogGenerationHandover {
    /// Reopen complete immutable DATA using an independently retained identity.
    /// The exact private directory and inodes must remain; copies are not custody.
    /// No file repair, missing-intent completion, epoch claim or serving starts.
    /// Use status against independently configured authority after opening.
    /// # Errors
    /// Wrong choices, incomplete/corrupt files, replaced custody, occupied ownership or budgets refuse.
    pub fn open(root: &Path, expected: &PreparedLogGenerationHandoverIdentity) -> Result<Self> {
        expected.validate()?;
        let directory = GenerationDirectory::open(root)?;
        directory.guard_witness(&expected.root)?;
        let intent = files::open(&directory.path.join("intent.json"))?;
        expected.intent_file.guard(&intent, &directory.path.join("intent.json"))?;
        let bytes = files::read(&intent, &directory.path.join("intent.json"), files::MAX_INTENT)?;
        let identity: PreparedLogGenerationHandoverIdentity = serde_json::from_slice(&bytes)?;
        if &identity != expected || serde_json::to_vec(&identity)? != bytes {
            return Err(Error::Contract("cold handover choice or canonical intent differs"));
        }
        identity.validate()?;
        let archive = files::open(&directory.path.join("source.backup"))?;
        identity.archive_file.guard(&archive, &directory.path.join("source.backup"))?;
        let bytes = files::read(
            &archive,
            &directory.path.join("source.backup"),
            crate::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES,
        )?;
        let backup = ServerLogGenerationRoomBackup::from_owned_bytes(bytes)?;
        let store = Store {
            poisoned: std::sync::atomic::AtomicBool::new(false),
            read_gate: std::sync::Mutex::new(()),
            directory,
            identity,
            backup,
            archive_stamp: GenerationFileStamp::of(&archive)?,
            intent_stamp: GenerationFileStamp::of(&intent)?,
            archive,
            intent,
        };
        store.guard()?;
        Ok(Self { store })
    }
}
