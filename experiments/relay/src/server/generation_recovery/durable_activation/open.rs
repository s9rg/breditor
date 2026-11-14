//! Cold admission of exact checkpoint files; no repair, role change or serving grant.
use super::{
    PreparedNativeGenerationActivation as Prepared,
    PreparedNativeGenerationActivationIdentity as Identity, store::Store,
};
use crate::{
    Error, Result, ServerLogGenerationRoomBackupFile,
    log::generations::{GenerationDirectory, GenerationFileStamp},
    server::{PreparedLogGenerationHandover, generation_backup::durable::files},
};
use std::{
    path::Path,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
impl Prepared {
    /// Open independently selected complete immutable checkpoint and original source owners.
    /// The original operational room must be separately re-admitted and authenticated later.
    /// # Errors
    /// Missing/corrupt/replaced files, copied roots, wrong source/choice, competing custody
    /// or bounded admission failures refuse without changing any durable bytes.
    pub fn open(
        root: &Path,
        expected: &Identity,
        source: Arc<PreparedLogGenerationHandover>,
    ) -> Result<Self> {
        expected.validate()?;
        source.store.guard()?;
        if source.identity() != expected.source() {
            return Err(Error::Contract("native checkpoint original source differs"));
        }
        let directory = GenerationDirectory::open(root)?;
        directory.guard_witness(&expected.root)?;
        let intent = files::open(&directory.path.join("activation.json"))?;
        expected.intent.guard(&intent, &directory.path.join("activation.json"))?;
        let bytes =
            files::read(&intent, &directory.path.join("activation.json"), files::MAX_INTENT)?;
        let identity: Identity = serde_json::from_slice(&bytes)?;
        if &identity != expected || serde_json::to_vec(&identity)? != bytes {
            return Err(Error::Contract("native checkpoint canonical choice differs"));
        }
        let archive = files::open(&directory.path.join("target.backup"))?;
        identity.archive.guard(&archive, &directory.path.join("target.backup"))?;
        let backup = ServerLogGenerationRoomBackupFile::open(
            archive.try_clone()?,
            &identity.current.server,
        )?;
        backup.check_archive_ancestor(source.source_backup())?;
        let store = Store {
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
        let value = Self { store, source };
        value.guard()?;
        Ok(value)
    }
}
