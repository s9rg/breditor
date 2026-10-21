//! Separate complete physical archive. Admission alone does not replay or activate a native room.
mod admission;
#[cfg(any(feature = "server", test))]
mod ancestry;
mod capture;
mod format;
mod identity;
mod selected_files;
mod verify_live;
mod visit_records;
pub use format::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES;
pub use identity::{ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo};

/// Immutable complete multi-file transport archive, not native replay or deployment authority.
/// Keeps original event bytes and every selected manifest, plus bounded unpublished stages.
/// Private fields prevent mutation after transport admission.
pub struct ServerLogGenerationBackup {
    bytes: Vec<u8>,
    header: format::Header,
    identity: ServerLogGenerationBackupIdentity,
}
