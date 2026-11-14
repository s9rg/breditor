//! Separate complete physical archive. Admission alone does not replay or activate a native room.
mod admission;
mod disk;
pub(super) use disk::admit_native_file;
mod ancestry;
#[cfg(feature = "server")]
pub(super) use ancestry::check_native_ancestry;
mod capture;
mod format;
mod identity;
mod migrate_original;
mod selected_files;
mod stage_reclamation;
mod stream;
pub(in crate::room) use stream::BackupOutput;
mod verify_live;
pub use format::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES;
pub use identity::{ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo};
pub(super) use verify_live::check_native_selection;

/// Immutable complete multi-file transport archive, not native replay or deployment authority.
/// Keeps original event bytes and every selected manifest, plus bounded unpublished stages.
/// Private fields prevent mutation after transport admission.
pub struct ServerLogGenerationBackup {
    bytes: Vec<u8>,
    header: format::Header,
    identity: ServerLogGenerationBackupIdentity,
}
